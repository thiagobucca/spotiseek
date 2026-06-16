# 07 — Plano de implementação, MVP, roadmap, riscos, escalabilidade e observabilidade

## 1. Plano de implementação por fases

### Fase 0 — Fundações (1–2 semanas)
- Monorepo pnpm, NestJS skeleton, Prisma + Postgres + migrations iniciais, Redis/BullMQ.
- Docker Compose dev + Dockerfile multi-stage. CI buildx multi-arch.
- Auth JWT + seed do usuário admin. Health endpoints.

### Fase 1 — Spotify → Catálogo (1–2 semanas)
- OAuth Spotify (PKCE) + client-credentials p/ playlists públicas.
- Import de playlist (URL e privada), normalização, upsert de Track/Artist/Album.
- Wishlist (track/álbum/artista/playlist) + resolução.
- UI: tela de playlists + import.

### Fase 2 — Provider Soulseek + busca/match (2–3 semanas) ⭐ núcleo
- `MusicProvider` interface + `SlskdProvider` (search/download/getTransfer/health).
- slskd como sidecar; reconciliação de transfers.
- Algoritmo de matching + política de qualidade + auditoria de score.
- Filas `search`/`match`/`download`. UI: tela de downloads + SSE de progresso.

### Fase 3 — Biblioteca (1–2 semanas)
- `organize`: mover/renomear, tags ID3/FLAC, capas, dedupe.
- Rescan da pasta `/music`. UI: tela de biblioteca + busca.

### Fase 4 — Operação contínua (1 semana)
- Scheduler (sync agendado/auto), detecção por snapshot_id.
- Dashboard com agregados. Configurações completas.
- Watchdog de recursos (download adaptativo).

### Fase 5 — Hardening & RPi (1 semana)
- Testes em RPi4 real, ajuste de limites de memória, perfis de carga.
- Observabilidade (logs estruturados, /metrics), backup script, docs de deploy.

## 2. MVP detalhado (escopo mínimo entregável)

**Objetivo:** importar uma playlist do Spotify e baixar suas faixas via Soulseek com
qualidade configurável, organizando na biblioteca — rodando em Docker no RPi4.

Inclui:
- ✅ Import de playlist pública por URL **e** privada por OAuth.
- ✅ Normalização + Track(WANTED).
- ✅ `SlskdProvider`: busca + seleção por score + download + progresso (SSE).
- ✅ Política de qualidade (FLAC→MP3...) configurável; `autoAcceptScore`.
- ✅ Organização básica (mover/renomear + tags + capa) e dedupe por hash.
- ✅ Dashboard mínimo (ativos/concluídos/falhas/espaço) + tela de downloads.
- ✅ Compose com app+slskd+postgres+redis; volumes persistentes; multi-arch.
- ✅ Auth JWT single-user.

Fora do MVP: monitorar discografia completa de artista, upgrades automáticos de qualidade,
multi-usuário, providers além do Soulseek, métricas Prometheus.

## 3. Roadmap

| Versão | Tema | Itens |
|---|---|---|
| **V1** | Sólido e usável | Tudo do MVP + sync agendado/auto, wishlist completa (incl. monitorar artista→discografia via MusicBrainz), enriquecimento MusicBrainz/Cover Art, busca full-text na biblioteca, configurações completas, backup/restore. |
| **V2** | Qualidade & escala | Upgrade automático de qualidade; segundo provider (ex.: ponte Lidarr/indexers); Drizzle como ORM leve opcional; notificações (Discord/ntfy/webhook); import de "Curtidas"/álbuns salvos; multi-usuário com RBAC; retry inteligente com rotação de fonte. |
| **V3** | Plataforma | Plugins de provider via contrato público + marketplace; integração com players (Jellyfin/Plex refresh, Subsonic API read-only); recomendação (similar artists via MusicBrainz); app mobile PWA; HA opcional (workers separados, Postgres externo). |

## 4. Riscos técnicos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| **Soulseek sem API oficial / ToS** | Legal/operacional | Tratado em doc 02 e 09. Usar slskd (cliente legítimo da rede), respeitar ratio, rate-limit, deixar responsabilidade explícita ao operador. |
| **Banimento por automação agressiva** | Buscas param | Rate-limit em `search` (1 req/s), backoff, jitter; compartilhar arquivos (ratio); evitar flood. |
| **Qualidade/disponibilidade variável no P2P** | Faixas não encontradas | Score com fallback de qualidade; rotação de candidatos; fila de "não encontradas" para re-tentar periodicamente. |
| **Matching errado (faixa errada baixada)** | UX ruim | ISRC como chave forte; threshold de auto-aceite; revisão manual na faixa 0.6–0.85; auditoria de score; rematch manual. |
| **Spotify deprecations (nov/2024)** | Import quebra | Depender só de endpoints estáveis de playlist/track; isolar em `SpotifyClient`; testes de contrato. (Confirmar na pesquisa — doc 02.) |
| **RAM estourar no RPi4** | OOM kill | Limites no Compose; heap V8 limitado; concorrência baixa; watchdog adaptativo; Postgres/Redis tunados. |
| **Prisma engine pesado em arm64** | RAM/cold start | `binaryTargets` corretos; opção de migrar p/ Drizzle (V2) se footprint incomodar. |
| **Corrupção/escrita em SD card** | Perda de dados | Recomendar SSD USB; volumes nomeados; backup script. |
| **slskd indisponível** | Sem downloads | Health-check + circuit breaker; jobs ficam QUEUED e retomam quando volta. |

## 5. Alternativas tecnológicas (decisões abertas)

| Decisão | Default | Alternativa | Quando trocar |
|---|---|---|---|
| Runtime backend | NestJS/Node | **Go** (menor RAM, binário único) ou **Fastify** puro | Se RAM no RPi for crítica e a equipe topar reescrever hot paths. |
| ORM | Prisma | **Drizzle** (sem engine nativo, ~menor RSS) | Otimização V2; medir antes. |
| DB | Postgres 16 | **SQLite + Litestream** | Instalações ultraleves single-user; perde FTS robusto e concorrência. |
| Fila | BullMQ/Redis | **pg-boss** (filas no próprio Postgres) | Remover Redis p/ economizar um container (~50MB); perde rate-limit/cache prontos. |
| Frontend | SvelteKit estático | React/Next, SolidStart | Preferência da equipe; custo: bundle maior. |
| Soulseek | slskd (REST) | soulseek.NET embarcado / slsk-client (npm) | Ver doc 02 — slskd é a recomendação robusta. |
| Tags | taglib lib | shell-out ffmpeg/metaflac | Lib evita custo de processo; ffmpeg como fallback. |

> **Observação sobre Redis:** para o cenário RPi single-user, `pg-boss` (filas em Postgres)
> é uma alternativa real para eliminar um serviço. Mantemos BullMQ por ser pedido no brief e
> pela maturidade de rate-limit/repeatable jobs, mas registramos o trade-off.

## 6. Estratégia de escalabilidade

Single-tenant, mas escala em **volume de biblioteca** e **opcional em hardware**:
- **Vertical/eficiência primeiro:** alvo é caber no RPi4. Índices e paginação por cursor
  suportam dezenas de milhares de faixas sem degradar a UI.
- **Separar roles:** `ROLE=worker` permite mover workers para outra máquina (NAS/mini-PC)
  mantendo Postgres/Redis compartilhados — escala downloads sem tocar na API.
- **Concorrência configurável** por fila; rate-limit por provider.
- **Stateless app:** estado em Postgres/Redis → múltiplas réplicas possíveis (V3/HA).
- **Particionamento futuro:** `AuditLog`/`SyncRun` por data; arquivamento de jobs antigos.

## 7. Observabilidade e logs

- **Logs estruturados (JSON)** com `pino` (mais leve/rápido que Winston) — campos
  `scope`, `trackId`, `jobId`, `provider`. Níveis por env (`LOG_LEVEL`).
- **AuditLog** no DB para eventos de negócio relevantes (match escolhido, download falho)
  — consultável na UI; logs de runtime ficam no stdout (capturados pelo Docker).
- **Correlação:** cada pipeline carrega um `correlationId` propagado entre filas.
- **/health**: readiness checa db/redis/slskd; liveness simples.
- **/metrics (Prometheus, opcional V2):** filas (waiting/active/failed), downloads/s,
  taxa de sucesso de match, RAM/CPU do processo, latência Spotify/slskd. Dashboards Grafana
  documentados, **desligados por default** no RPi p/ economizar recursos.
- **Tracing:** OpenTelemetry opcional (V3) — overhead não justificado em RPi single-user.
- **Alertas leves:** notificação (ntfy/Discord) em falhas repetidas ou slskd offline (V2).
- **Retenção:** rotação de `AuditLog` (ex.: 90 dias), limpeza de jobs concluídos no BullMQ.
