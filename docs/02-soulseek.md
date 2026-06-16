# 02 — Estratégia de integração Soulseek (avaliação do slskd)

> **TL;DR:** A recomendação é **rodar o [`slskd`](https://github.com/slskd/slskd) como
> container sidecar** e integrar **exclusivamente via sua REST API**. É a única abordagem
> hoje que é (a) headless de verdade, (b) com imagens Docker multi-arch oficiais incluindo
> `linux/arm64`, (c) mantida ativamente, e (d) construída sobre uma biblioteca de protocolo
> sólida (`Soulseek.NET`, do mesmo autor). Nenhuma biblioteca Node.js de Soulseek está em
> estado confiável para produção. Você apontou o repo certo.

---

## 1. Avaliação crítica das opções

### Por que Soulseek é difícil de integrar
- **Não existe API/SDK oficial.** Soulseek é um protocolo P2P proprietário; o cliente
  oficial (SoulseekQt) é GUI-only e não expõe automação.
- **Etiqueta da rede importa.** A rede é mantida por compartilhamento. Clientes que só
  "sugam" (leech) sem compartilhar podem ser limitados/banidos por outros usuários.
- **Buscas são assíncronas e distribuídas.** Você emite uma busca e *respostas chegam ao
  longo de segundos* de múltiplos peers — não é um GET síncrono. Isso molda toda a
  integração (polling/stream + janela de coleta).

### Comparativo das abordagens headless

| Abordagem | Headless? | ARM64? | Manutenção | Veredito |
|---|---|---|---|---|
| **slskd** (daemon .NET + REST + SignalR) | ✅ Total | ✅ Imagens oficiais multi-arch | ✅ Ativa, popular | **✅ Escolhido** |
| **Soulseek.NET** (lib embarcada) | ✅ | ✅ (.NET) | ✅ (mesmo autor do slskd) | Bom, mas exigiria escrever/manter um host .NET — slskd já é exatamente isso. Reservado p/ caso extremo. |
| **Nicotine+** | ⚠️ GUI (GTK); tem CLI limitada, mas é orientado a desktop | parcial | ✅ | Não foi feito p/ ser um serviço REST headless. Rejeitado. |
| **slsk-client / node-slsk (npm)** | ✅ | ✅ (JS puro) | ❌ Abandonados / protocolo desatualizado | Frágeis, quebram com mudanças do servidor. **Rejeitado p/ produção.** |
| **SoulseekQt** (oficial) | ❌ GUI/X11 | — | — | Viola requisito headless. Rejeitado. |

**Conclusão:** Em vez de embarcar um cliente de protocolo frágil no nosso processo Node,
delegamos toda a complexidade de protocolo, conexão, NAT, busca distribuída e transferência
ao slskd, e falamos com ele por HTTP. Isso isola o risco e mantém nosso backend simples.

---

## 2. slskd em profundidade

**O que é:** cliente Soulseek headless, self-hosted, escrito em **.NET (8+)**, por
*jpdillingham* — o mesmo autor da biblioteca **Soulseek.NET** que o sustenta. Expõe:
- **Web UI** (que NÃO somos obrigados a usar — vamos consumir a API).
- **REST API** versionada sob **`/api/v0/`**.
- **SignalR (WebSocket)** para eventos em tempo real (respostas de busca, progresso de
  transfer) — alternativa ao polling.

**Por que casa com nossos requisitos:**
- 🐳 **Docker multi-arch oficial** (`slskd/slskd` no Docker Hub e GHCR) com `linux/amd64`,
  `linux/arm64` (e `arm/v7`) → roda nativo no Raspberry Pi OS 64-bit. ✔ requisito multi-arch.
- 🪶 **Leve:** runtime .NET enxuto; consumo típico **~80–200 MB RSS** no RPi4 em operação
  normal — cabe folgado no orçamento de memória (doc 06). ✔ requisito RPi4.
- 🔌 **100% headless:** sem X11/GUI necessária; config por arquivo `slskd.yml` ou env
  `SLSKD_*`. ✔ requisito headless.
- 🔁 **Mantido e popular:** base de usuários grande (usado por `soularr`, integrações Lidarr,
  etc.), releases frequentes.

### Autenticação da API
slskd suporta dois modos (configuráveis):
- **API key** — header `X-API-Key: <chave>` (mais simples p/ serviço↔serviço; **usaremos este**).
- **JWT** — `POST /api/v0/session` com usuário/senha → Bearer token (para a Web UI).

Geramos a API key (`SLSKD_API_KEY`) e injetamos tanto no slskd (via `slskd.yml`) quanto no
nosso app (env). Nada de credencial em código.

### Endpoints essenciais que vamos usar

> ⚠️ Os nomes abaixo refletem a API `v0` do slskd. **Antes de codar, confirmar contra o
> Swagger da versão fixada** (slskd serve a própria especificação OpenAPI em `/swagger`).
> Fixamos uma tag de imagem (não `latest`) para estabilidade de contrato.

| Operação | Método + rota | Observações |
|---|---|---|
| Estado da app/servidor | `GET /api/v0/application` | conectado à rede? logado? → health-check |
| **Iniciar busca** | `POST /api/v0/searches` | body `{ "searchText": "Metallica One" }` → retorna `id` |
| Estado da busca | `GET /api/v0/searches/{id}` | `state`, `responseCount`, `fileCount` |
| **Respostas da busca** | `GET /api/v0/searches/{id}/responses` | lista de peers + arquivos (filename, size, bitRate, length, freeUploadSlots, uploadSpeed) |
| Encerrar busca | `DELETE /api/v0/searches/{id}` | libera recursos após coletar |
| **Enfileirar download** | `POST /api/v0/transfers/downloads/{username}` | body: array `[{ "filename": "...", "size": 12345 }]` |
| Transfers de download | `GET /api/v0/transfers/downloads` | progresso/estado de todos |
| Transfers de um usuário | `GET /api/v0/transfers/downloads/{username}` | filtra por peer |
| Cancelar/remover | `DELETE /api/v0/transfers/downloads/{username}/{id}` | aborta um transfer |
| Eventos em tempo real | **SignalR** hubs (`/hubs/search`, `/hubs/transfers`) | opcional; alternativa ao polling |

### Fluxo de busca (modela a natureza assíncrona)
```
POST /searches {searchText}  ──►  id
   │  (respostas chegam ao longo de ~5–15s)
   ├─ poll GET /searches/{id}            (ou assinar SignalR)
   ├─ GET /searches/{id}/responses       (acumula candidatos)
   │  janela de coleta com early-stop: para quando
   │     responseCount estável por N s  OU  timeout (configurável)
   └─ DELETE /searches/{id}              (limpa)
```

---

## 3. Aprendizados de projetos-ponte (soularr & cia.)

`soularr` (ponte **Lidarr → slskd**) e integrações similares validam exatamente esta
arquitetura. Padrões que adotamos deles:
- **slskd como "motor de download" desacoplado**, dirigido por polling periódico — não por
  acoplamento em tempo real. Resiliente a restart de qualquer lado.
- **Reconciliação de estado**: a fonte da verdade é a app que orquestra; o slskd é tratado
  como efêmero. Em restart, varre-se `GET /transfers/downloads` e reconcilia.
- **Janela de coleta + scoring** antes de baixar (não baixar o primeiro resultado).
- **Importação só após o arquivo concluir** e ser validado (não confiar só no estado do slskd).

Diferença do nosso produto: a *fonte da intenção* é o **Spotify/wishlist** (não o Lidarr), e
fazemos o **matching/scoring** e a **organização da biblioteca** internamente (docs 03/05).

---

## 4. Abstração de provider (mantém Soulseek plugável)

O core nunca conhece slskd diretamente. Tudo passa pela interface `MusicProvider`. Trocar de
fonte = adicionar uma classe ao registry (doc 01 §fronteiras).

```ts
// providers/provider.interface.ts
export interface TrackMetadata {
  title: string; artist: string; album?: string;
  durationSec?: number; isrc?: string;
}

export interface SearchResult {
  providerKey: string;
  username: string;        // peer (Soulseek-specific, opaco ao core)
  filename: string;
  folder?: string;
  sizeBytes: number;
  format?: string;         // flac/mp3 derivado da extensão/headers
  bitrate?: number;
  durationSec?: number;
  freeUploadSlots?: boolean;
  uploadSpeed?: number;
  raw: unknown;            // payload cru p/ auditoria
}

export interface DownloadHandle { externalId: string; ref: unknown; }
export interface TransferStatus {
  state: 'queued'|'in_progress'|'completed'|'failed'|'cancelled';
  progress: number;        // 0..1
  speedBps?: number;
  bytesDone: number; bytesTotal?: number;
  localPath?: string;
}

export interface MusicProvider {
  readonly key: string;
  readonly priority: number;
  search(track: TrackMetadata): Promise<SearchResult[]>;
  download(result: SearchResult): Promise<DownloadHandle>;
  getTransfer(handle: DownloadHandle): Promise<TransferStatus>;
  cancel(handle: DownloadHandle): Promise<void>;
  healthCheck(): Promise<boolean>;
}
```

### Implementação `SlskdProvider` (componente crítico)

```ts
// providers/soulseek/slskd.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { MusicProvider, TrackMetadata, SearchResult, DownloadHandle, TransferStatus } from '../provider.interface';

@Injectable()
export class SlskdProvider implements MusicProvider {
  readonly key = 'soulseek';
  readonly priority = 0; // prioridade máxima (default do produto)
  private readonly log = new Logger(SlskdProvider.name);

  constructor(
    private readonly baseUrl = process.env.SLSKD_URL!,        // http://slskd:5030
    private readonly apiKey  = process.env.SLSKD_API_KEY!,
  ) {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v0${path}`, {
      ...init,
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`slskd ${res.status} on ${path}: ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : res.json() as Promise<T>;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const app = await this.api<any>('/application');
      return app?.server?.state?.includes?.('Connected') ?? app?.serverState === 'Connected';
    } catch { return false; }
  }

  async search(track: TrackMetadata): Promise<SearchResult[]> {
    const searchText = `${track.artist} ${track.title}`.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    const { id } = await this.api<{ id: string }>('/searches', {
      method: 'POST', body: JSON.stringify({ searchText, fileLimit: 200 }),
    });

    // janela de coleta com early-stop (natureza assíncrona da busca P2P)
    const deadline = Date.now() + 15_000;
    let stableFor = 0, last = -1;
    while (Date.now() < deadline) {
      await sleep(1500);
      const s = await this.api<any>(`/searches/${id}`);
      if (s.fileCount === last) { stableFor += 1500; if (stableFor >= 4500) break; }
      else { stableFor = 0; last = s.fileCount; }
    }

    const responses = await this.api<any[]>(`/searches/${id}/responses`);
    await this.api(`/searches/${id}`, { method: 'DELETE' }).catch(() => {}); // cleanup

    return responses.flatMap(r =>
      (r.files ?? []).map((f: any): SearchResult => ({
        providerKey: this.key,
        username: r.username,
        filename: f.filename,
        folder: dirname(f.filename),
        sizeBytes: f.size,
        format: ext(f.filename),               // 'flac' | 'mp3' | ...
        bitrate: f.bitRate,
        durationSec: f.length,
        freeUploadSlots: r.hasFreeUploadSlot,
        uploadSpeed: r.uploadSpeed,
        raw: { response: pick(r, ['username','queueLength','uploadSpeed']), file: f },
      })),
    );
  }

  async download(result: SearchResult): Promise<DownloadHandle> {
    await this.api(`/transfers/downloads/${encodeURIComponent(result.username)}`, {
      method: 'POST',
      body: JSON.stringify([{ filename: result.filename, size: result.sizeBytes }]),
    });
    return { externalId: result.filename, ref: { username: result.username, filename: result.filename } };
  }

  async getTransfer(handle: DownloadHandle): Promise<TransferStatus> {
    const { username, filename } = handle.ref as any;
    const list = await this.api<any[]>(`/transfers/downloads/${encodeURIComponent(username)}`);
    const t = flattenTransfers(list).find(x => x.filename === filename);
    if (!t) return { state: 'queued', progress: 0, bytesDone: 0 };
    return {
      state: mapState(t.state),                  // "Completed, Succeeded" -> 'completed' etc.
      progress: t.percentComplete != null ? t.percentComplete / 100 : 0,
      speedBps: t.averageSpeed,
      bytesDone: t.bytesTransferred ?? 0,
      bytesTotal: t.size,
      localPath: t.filename && mapState(t.state) === 'completed' ? toLocalPath(t) : undefined,
    };
  }

  async cancel(handle: DownloadHandle): Promise<void> {
    const { username, filename } = handle.ref as any;
    const list = await this.api<any[]>(`/transfers/downloads/${encodeURIComponent(username)}`);
    const t = flattenTransfers(list).find(x => x.filename === filename);
    if (t) await this.api(`/transfers/downloads/${encodeURIComponent(username)}/${t.id}`, { method: 'DELETE' });
  }
}
```
> O `download` job (doc 05) faz polling de `getTransfer` (ou assina SignalR) e atualiza
> `DownloadJob`. Estado terminal `completed` + arquivo presente → dispara `organize`.

---

## 5. Configuração do slskd (`docker/slskd.yml`, montado read-only)

```yaml
# slskd.yml — pontos essenciais
web:
  authentication:
    api_keys:
      spotiseek:
        key: ${SLSKD_API_KEY}          # mesma do app
        role: readwrite
soulseek:
  username: ${SLSKD_SLSK_USERNAME}     # injetado por env via docker-compose
  password: ${SLSKD_SLSK_PASSWORD}
  listen_port: 50300                   # porta de escuta P2P
directories:
  downloads: /downloads                # volume compartilhado com o app
  incomplete: /downloads/.incomplete

# COMPARTILHAMENTO DESABILITADO POR PADRÃO (decisão do operador).
shares:
  directories: []                      # vazio = não compartilha nada
```

> **Sharing OFF por padrão é deliberado** (decisão do operador para uso pessoal de baixa
> intensidade). A etiqueta da rede Soulseek valoriza quem compartilha de volta; quem só baixa
> (leech) pode ser limitado por outros peers. Para **ativar depois** (recomendado para boa
> reputação e melhor disponibilidade de downloads), monte a biblioteca read-only no slskd
> (`music-library:/music:ro`) e aponte `shares.directories: [ /music ]`. Tradeoff detalhado
> em [doc 09](09-riscos-alternativas.md).

---

## 6. Riscos específicos da integração e mitigação

| Risco | Mitigação |
|---|---|
| Contrato da API `v0` mudar entre versões | Fixar tag de imagem; validar contra Swagger; testes de contrato no CI; camada `SlskdProvider` isola mudanças. |
| Busca não retorna nada / poucos seeds | Janela de coleta + fallback de query (só título, variações); fila de "não encontradas" p/ re-tentar. |
| Peer lento / fila longa | Score considera `uploadSpeed`/`freeUploadSlots`/`queueLength`; timeout e rotação de candidato. |
| slskd desconectado do servidor Soulseek | `healthCheck` + circuit breaker; jobs ficam QUEUED e retomam. |
| Estado do transfer perdido em restart | Reconciliação periódica via `GET /transfers/downloads`. |
| Banimento por buscas agressivas | Rate-limit na fila `search` (1 req/s, jitter, backoff). |
| Leech sem compartilhar limita downloads | Sharing OFF por padrão (decisão do operador); aceitável em uso pessoal de baixa intensidade. Ativável depois p/ melhor disponibilidade (ver doc 09). |

Considerações **legais e de etiqueta da rede** (ratio/ToS/copyright) estão consolidadas em
[`docs/09-riscos-alternativas.md`](09-riscos-alternativas.md).
