# 01 — Arquitetura

## 1. Princípios norteadores

1. **Eficiência primeiro.** O alvo é um Raspberry Pi 4 (4GB) rodando 24/7. Cada decisão
   é avaliada por consumo de RAM/CPU/IO. Metas: < 1GB RAM idle, < 2GB em sync, CPU baixa.
2. **Headless e self-contained.** Zero GUI, X11 ou desktop. Tudo via HTTP/REST.
3. **Plugável.** Providers (fontes de download) e fontes de metadados são intercambiáveis.
4. **Resiliente.** Toda operação custosa é um job idempotente, com retry e backoff.
5. **Self-hosted single-tenant.** Não é SaaS. Otimizamos para 1 família/1 instância, não
   para milhares de usuários — isso simplifica enormemente a arquitetura.

## 2. Visão de componentes

```
                            ┌──────────────────────────────────────────────┐
                            │                  Browser (UI)                 │
                            │        SvelteKit SPA  (estática, ~devtool)     │
                            └───────────────┬──────────────────────────────┘
                                            │ HTTPS / REST + SSE (websocket opcional)
                            ┌───────────────▼──────────────────────────────┐
                            │            API / App (NestJS)                 │
                            │  Auth(JWT) · REST · SSE · Scheduler(cron)     │
                            │  Workers + fila durável embarcada (SQLite)    │
                            │  TUDO no MESMO processo Node (ultralight)     │
                            └───┬─────────────────────────────┬────────────┘
                                │                             │
              ┌─────────────────▼──────────────┐              │
              │   SQLite (Prisma)               │             │
              │   /data/spotiseek.db            │             │
              │   metadados, estado, fila       │             │
              └─────────────────────────────────┘             │
                                                               │
        ┌───────────────────────────────────────────┬─────────┴────────────────┐
        │                                            │                          │
┌───────▼────────┐                       ┌───────────▼───────────┐   ┌──────────▼─────────┐
│ Spotify Web API │                       │  Provider: Soulseek    │   │ Metadata providers │
│ (OAuth/Client)  │                       │  via slskd (sidecar)   │   │ MusicBrainz/Cover  │
│  metadados      │                       │  REST API (HTTP)       │   │ Art Archive        │
└─────────────────┘                       └───────────┬───────────┘   └────────────────────┘
                                                       │ protocolo Soulseek (TCP)
                                                ┌──────▼───────┐
                                                │ rede Soulseek │
                                                └───────────────┘
                                                       │
                                          ┌────────────▼─────────────┐
                                          │  Volume: /music (library) │
                                          │  + /downloads (incoming)  │
                                          └───────────────────────────┘
```

### Containers (ULTRALIGHT — apenas 2)

| Container | Imagem | Papel | RAM típica RPi4 |
|---|---|---|---|
| `app` | nossa (multi-arch) | API + Workers + fila durável + SQLite + UI estática | 150–350 MB |
| `slskd` | `slskd/slskd` | Daemon Soulseek headless c/ REST API | 80–200 MB |

> **Decisão (stack ULTRALIGHT — escolhida com o operador):** colapsamos a stack para **2
> containers**. **Não há Postgres nem Redis.** A persistência inteira é um **único arquivo
> SQLite** (`/data/spotiseek.db`, via Prisma) e a fila de jobs é **durável e embarcada na
> própria SQLite** — API, workers e scheduler rodam **no mesmo processo Node**. Isso elimina
> dois daemons, economiza ~100–250MB de RAM e simplifica backup (um arquivo). É a escolha
> certa para o alvo single-tenant doméstico num RPi4.
>
> **Postgres + Redis + BullMQ continuam documentados como alternativas avaliadas / caminho de
> escala futura** (ver tabela de stack abaixo e doc 07): se um dia houver muito mais hardware
> ou múltiplas instâncias, migrar o `DATABASE_URL` para Postgres e a fila para BullMQ/Redis é
> um caminho conhecido — mas **não é o que está implementado**.

## 3. Stack escolhida e justificativas

| Camada | Escolha | Por quê / alternativa avaliada |
|---|---|---|
| Backend | **NestJS (Node 20 LTS)** | Pedido no brief; DI e modularidade casam com arquitetura de providers. **Trade-off honesto:** Node consome mais RAM que Go/Rust. Mitigado com `--max-old-space-size`, sem ORM pesado em hot paths. *Alternativa:* Fastify puro (mais leve) ou Go — ver doc 07. |
| ORM | **Prisma** | Pedido no brief; ótimo DX e migrations. *Risco RPi:* o engine binário é nativo (suportado em arm64/musl via `binaryTargets`) e adiciona ~30–50MB RSS. Aceitável. *Alternativa leve:* Drizzle ORM (sem engine, menor footprint) — possível otimização futura. |
| DB | **SQLite** (via Prisma) — **implementado** | **Decisão ultralight:** um único arquivo (`/data/spotiseek.db`), zero daemon, backup trivial, footprint mínimo. Para 1 família/1 instância a concorrência de escrita é baixa e o WAL dá leitura concorrente de sobra. *Alternativa avaliada / escala futura:* **PostgreSQL 16** (JSONB, FTS nativo, melhor concorrência multi-usuário) — trocável pelo `DATABASE_URL`, documentado no doc 07, mas **não é o que roda**. |
| Filas | **Fila durável embarcada na SQLite** — **implementado** | Jobs persistidos na própria SQLite, processados por workers no mesmo processo Node, com rate-limit, retry/backoff e jobs agendados (scheduler `@nestjs/schedule`/cron). Sem broker externo. *Alternativa avaliada / escala futura:* **BullMQ + Redis** (jobs distribuídos entre processos/máquinas, cache compartilhado) — adotar só se houver workers separados; **não é o que roda** na stack ultralight. |
| Cache | **In-process (memória, TTL curto)** | Sem Redis: tokens Spotify e respostas recentes de busca ficam em cache em memória no processo; metadados estáveis (MusicBrainz) podem ser materializados na SQLite. Suficiente p/ single-tenant. |
| Frontend | **SvelteKit (adapter-static)** | **Alternativa proposta ao óbvio React/Next:** Svelte gera bundles muito menores e sem runtime pesado → melhor p/ servir de container minúsculo e renderizar rápido. Servido como arquivos estáticos pelo próprio Nest (sem container Node extra de SSR). |
| Soulseek | **slskd (sidecar) via REST** | Ver doc 02. Único caminho headless/ARM robusto hoje. |
| Metadados | **Spotify Web API** (origem) + **MusicBrainz** + **Cover Art Archive** (enriquecimento) | Spotify dá a playlist; MusicBrainz dá releases/track numbers canônicos e MBIDs; Cover Art Archive dá capas livres. |
| Tags | **node-taglib-sharp** ou binário **`ffmpeg`/`metaflac`** | Escrita de tags ID3/FLAC. Preferir lib nativa para evitar shell-out frequente. |

## 4. Estrutura de diretórios (monorepo)

```text
spotiseek/
├── README.md
├── docs/                              # esta documentação
├── docker-compose.yml                 # stack ULTRALIGHT (2 serviços: app + slskd) — na RAIZ
├── docker/
│   ├── Dockerfile                     # multi-stage, multi-arch
│   └── slskd.yml                      # config do slskd montada como volume
├── .env.example
├── scripts/
│   ├── install.sh                     # bootstrap em host RPi (instala docker, sobe stack)
│   └── backup.sh                      # tar do volume app-data (SQLite) + configs
├── package.json                       # workspaces (npm)
├── apps/
│   ├── api/                           # NestJS (API + Workers + serve UI)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/                # filtros, guards, pipes, logger
│   │   │   ├── auth/                  # JWT, login, guard
│   │   │   ├── config/                # @nestjs/config + validação zod/joi
│   │   │   ├── spotify/               # client OAuth + import de playlists
│   │   │   ├── wishlist/              # CRUD de wishlists (música/álbum/artista/playlist)
│   │   │   ├── catalog/               # tracks/artists/albums (entidades de domínio)
│   │   │   ├── providers/             # ⭐ arquitetura plugável
│   │   │   │   ├── provider.interface.ts
│   │   │   │   ├── provider.registry.ts
│   │   │   │   └── soulseek/          # SlskdProvider
│   │   │   ├── matching/              # algoritmo de score
│   │   │   ├── downloads/             # estado de downloads, controle de transfers
│   │   │   ├── library/               # organização, tagging, capas, dedupe
│   │   │   ├── jobs/                   # fila durável embarcada (SQLite) + processors
│   │   │   │   ├── queue.ts            # enqueue/claim/retry sobre a SQLite
│   │   │   │   └── processors/        # import, search, match, download, organize
│   │   │   ├── scheduler/             # repeatable jobs (sync agendado)
│   │   │   ├── settings/              # configurações persistidas
│   │   │   ├── dashboard/             # agregações p/ dashboard
│   │   │   └── events/                # SSE / gateway de progresso
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── test/
│   └── web/                           # SvelteKit SPA
│       ├── src/routes/                # dashboard, playlists, downloads, library, settings
│       └── src/lib/                   # api client, components, stores
└── packages/
    └── shared/                        # tipos compartilhados (DTOs, enums) entre api e web
```

## 5. Fronteiras e contratos-chave

- **Providers** expõem somente `search`, `download`, `getTransfer`/`healthCheck`. O core
  nunca conhece o protocolo Soulseek diretamente — só o `SlskdProvider`. Trocar/adicionar
  fonte = adicionar uma classe ao `provider.registry`. (Ver doc 02 §abstração.)
- **Metadados de origem vs. de enriquecimento** são separados: Spotify é só *origem da
  intenção* (o que o usuário quer); MusicBrainz/Cover Art enriquecem *o que foi baixado*.
- **Estado de download** é a fonte da verdade na SQLite (`/data/spotiseek.db`); slskd é
  tratado como efêmero (reconciliação periódica via polling do seu REST API).

## 6. Comunicação em tempo real

- **SSE (Server-Sent Events)** para progresso de downloads e logs ao vivo — mais leve que
  WebSocket, unidirecional (servidor→browser) é suficiente, reconecta sozinho. Um único
  endpoint `GET /api/events` multiplexa por tipo. WebSocket fica como opção V2 se precisar
  de bidirecionalidade.
