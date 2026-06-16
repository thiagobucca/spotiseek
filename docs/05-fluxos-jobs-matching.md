# 05 — Fluxos de sincronização, jobs e matching

## 1. Pipeline assíncrono (BullMQ)

Cada etapa é uma **fila** independente, com seu próprio limite de concorrência e retry.
Isso isola gargalos (busca lenta no Soulseek não trava a importação) e permite afinar
recursos no RPi.

```
Playlist/Wishlist
      │  (1) import / resolve
      ▼
 [queue: import] ──► normaliza faixas, cria/atualiza Track(WANTED)
      │  (2)
      ▼
 [queue: search] ──► provider.search(track)  →  grava MatchCandidate[]
      │  (3)
      ▼
 [queue: match]  ──► score + seleção  →  Track(MATCHED) + candidate.chosen
      │  (4)
      ▼
 [queue: download] ─► provider.download(chosen) → DownloadJob, polling de progresso
      │  (5)
      ▼
 [queue: organize] ─► mover, renomear, tags, capa, dedupe → LibraryFile, Track(IMPORTED)
      │  (6)
      ▼
 [queue: library]  ─► atualiza índices/agregados do dashboard
```

### Filas e concorrência (defaults RPi4)

| Fila | Concorrência | Rate limit | Retry/backoff |
|---|---|---|---|
| `import` | 1 | — | 3× exp |
| `search` | 2 | 1 req/s/provider (evita ban) | 3× exp |
| `match` | 4 (CPU-bound leve) | — | 1× |
| `download` | **`downloads.maxConcurrent` (default 2)** | — | 2×, +rotação de candidato |
| `organize` | 1 (IO/disco serial) | — | 3× |
| `library` | 1 | — | 3× |

> **Otimização RPi:** `download` baixo (2) evita saturar IO de SSD USB e RAM; `search`
> com rate-limit protege contra banimento no Soulseek; `organize` serial evita corrida de
> escrita no mesmo diretório e picos de IO.

### Repeatable jobs (scheduler)
- Sync agendado de playlist: `repeat: { pattern: syncCron }`, com `jobId` estável por
  playlist (evita duplicatas).
- Reconciliação de downloads: job a cada 10s enquanto há transfers ativos (polling do slskd).
- Health-check de providers: a cada 60s.
- Limpeza de jobs antigos: diário.

## 2. Fluxo de importação Spotify (detalhe)

1. **Pública (URL):** extrai `playlistId` da URL → chama `GET /v1/playlists/{id}/tracks`
   com **client-credentials** (sem login do usuário). Paginação de 100 em 100.
2. **Privada:** usa tokens OAuth do usuário (refresh automático). Mesmos endpoints.
3. **Detecção de mudança:** compara `snapshot_id` salvo. Se igual → no-op (0 chamadas extras).
4. Para cada item: extrai `name, artists[], album, year, duration_ms, isrc(external_ids), popularity`.
5. Normaliza (ver §matching) e **upsert** de `Artist/Album/Track`. Faixas novas entram
   `WANTED` e são enfileiradas em `search`.

> **Nota de robustez (a confirmar pela pesquisa):** o Spotify restringiu alguns endpoints
> (audio-features, related-artists, recommendations) em nov/2024. Este produto **não
> depende** desses — usa apenas leitura de playlists e metadados de faixa, que permanecem
> disponíveis. ISRC vem em `track.external_ids.isrc`. Confirmar no doc 02/pesquisa.

## 3. Algoritmo de matching por score

### Normalização (pré-processamento)
```ts
function norm(s: string): string {
  return s.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/\(feat\.?[^)]*\)|\bfeat\.?\b.*$/g, '')      // remove feat.
    .replace(/\b(remaster(ed)?|remix|live|deluxe|bonus)\b.*$/g, '') // ruído (penaliza, ver abaixo)
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
```

### Score (0..1) — soma ponderada
```ts
import { ratio } from 'fast-levenshtein-like'; // string-similarity / Dice coef.

interface Weights { title:number; artist:number; album:number; duration:number; quality:number; }
const W: Weights = { title:0.35, artist:0.30, album:0.10, duration:0.10, quality:0.15 };

function scoreCandidate(track: TrackMeta, c: Candidate, prefs: QualityPrefs) {
  // 1. ISRC bate? short-circuit forte
  if (track.isrc && c.isrc && track.isrc === c.isrc) return { score: 1, breakdown: { isrc: true } };

  const title    = dice(norm(track.title),  norm(extractTitle(c.filename)));
  const artist   = dice(norm(track.artist), norm(extractArtist(c.filename)));
  const album    = track.album ? dice(norm(track.album), norm(c.folder ?? '')) : 0.5;

  // duração: 1.0 se ±3s, decai linearmente até 0 em ±30s
  const dur = c.durationSec && track.durationSec
    ? Math.max(0, 1 - Math.abs(c.durationSec - track.durationSec) / 30)
    : 0.5;

  // qualidade: posição na lista de preferência do usuário → [0..1]
  const quality = qualityRank(c.format, c.bitrate, prefs);

  // penalidades por ruído indesejado no nome (a menos que o alvo peça)
  const noise = /remix|live|karaoke|cover|instrumental/i.test(c.filename)
                && !/remix|live/i.test(track.title) ? 0.15 : 0;

  const score = W.title*title + W.artist*artist + W.album*album
              + W.duration*dur + W.quality*quality - noise;

  return { score: clamp01(score),
           breakdown: { title, artist, album, duration: dur, quality, noise } };
}
```

### Seleção
- Ordena candidatos por `score` desc; desempate por: (1) qualidade preferida,
  (2) seeder mais rápido / fila menor (do slskd), (3) maior `sizeBytes` p/ mesmo formato.
- `score >= settings.matching.autoAcceptScore` (default **0.85**) → auto-seleciona e baixa.
- Entre 0.6 e 0.85 → baixa mas **flag p/ revisão** na UI.
- `< 0.6` → marca `FAILED`/needs-manual, não baixa.
- Grava todos os candidatos com `scoreBreakdown` (auditoria).

## 4. Política de qualidade

Ordem default (configurável em `quality.priority`):
1. **FLAC** 2. **MP3 320kbps** 3. **V0 VBR** 4. **MP3 256** 5. **MP3 192**

```ts
function qualityRank(format?: string, bitrate?: number, prefs: QualityPrefs): number {
  const tier = classify(format, bitrate); // -> "FLAC" | "MP3_320" | "V0" | ...
  const idx = prefs.priority.indexOf(tier);
  if (idx < 0) return 0;                          // abaixo do mínimo aceitável
  return 1 - idx / prefs.priority.length;         // 1º da lista = melhor
}
```
- `quality.minimum`: candidatos abaixo do mínimo recebem score 0 na dimensão qualidade
  (efetivamente descartados se nenhum melhor existir, baixados só como último recurso se
  `allowBelowMinimum=false` → não baixa).
- **Upgrade automático (V2):** se uma faixa já existe em MP3_320 e aparece FLAC, opção de
  re-download substituindo (política `library.upgradePolicy`).

## 5. Organização da biblioteca

Após download em `/downloads/<job>/...`:
1. **Identificar** o arquivo de áudio (extensão + probe `ffprobe`/taglib).
2. **Enriquecer metadados** (MusicBrainz por ISRC/MBID quando possível; fallback aos dados
   do Spotify) → artista, álbum, ano, nº de faixa/disco.
3. **Escrever tags** (ID3v2.4 p/ MP3, Vorbis comments p/ FLAC) + **embutir capa**.
4. **Mover/renomear** para o padrão:
   ```
   /music/{AlbumArtist}/{Album} ({Year})/{disc-}{NN} {Title}.{ext}
   ```
5. **Capa**: salvar `cover.jpg` na pasta do álbum (Cover Art Archive → Spotify fallback).
6. **Dedupe**: se `LibraryFile.hash` já existe → manter melhor qualidade, descartar o outro.
7. Criar `LibraryFile`, `Track(IMPORTED)`, atualizar agregados.

## 6. Idempotência & recuperação

- Cada job carrega `trackId`; reprocessar é seguro (upserts + checagem de estado).
- Na inicialização, um job de **reconciliação** varre `DownloadJob` em estado não-terminal
  e re-sincroniza com o slskd (que pode ter perdido estado em restart).
- `organize` só marca `IMPORTED` após `LibraryFile` persistido e arquivo presente em `/music`.
