# 06 — Deploy, Docker multi-arch e Raspberry Pi

> **Stack ULTRALIGHT (2 containers):** `app` (NestJS API + workers + fila durável embarcada +
> UI estática + **SQLite**) e `slskd`. **Sem Postgres, sem Redis.** O `docker-compose.yml` fica
> na **raiz** do repo; o `Dockerfile` em `docker/`. Postgres/Redis/BullMQ permanecem apenas
> como caminho de escala futura (doc 01 §3, doc 07).

## 1. Dockerfile multi-stage (multi-arch arm64 + amd64)

Monorepo com **npm workspaces** (não pnpm). Ordem de build: `npm ci` na raiz → `shared` →
`web` → `api` → copiar `apps/web/build` para o dir estático da API. O arquivo real é
[`docker/Dockerfile`](../docker/Dockerfile); resumo dos estágios:

```dockerfile
# ---------- deps ----------  (npm ci de TODO o workspace)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci

# ---------- build-shared ----------  (@spotiseek/shared primeiro)
FROM deps AS build-shared
COPY packages/shared packages/shared
RUN npm run build -w @spotiseek/shared

# ---------- build-web ----------  (SvelteKit adapter-static -> apps/web/build)
FROM build-shared AS build-web
COPY apps/web apps/web
RUN npm run build -w @spotiseek/web

# ---------- build-api ----------  (prisma generate + nest build -> apps/api/dist)
FROM build-shared AS build-api
COPY apps/api apps/api
RUN npm run prisma:generate -w @spotiseek/api
RUN npm run build -w @spotiseek/api

# ---------- prune ----------  (node_modules só de produção, com Prisma Client)
FROM node:20-alpine AS prune
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/*/package.json apps/*/package.json ./   # (mantendo a árvore de workspaces)
RUN npm ci --omit=dev
COPY --from=build-api /app/node_modules/.prisma node_modules/.prisma

# ---------- runtime ----------
FROM node:20-alpine AS runtime
RUN apk add --no-cache ffmpeg tini wget   # ffmpeg p/ tags; tini p/ PID 1; wget p/ healthcheck
WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"   # heap V8 amigável a RPi (sobrescrevível)
COPY --from=prune     /app/node_modules        /app/node_modules
COPY --from=build-shared /app/packages/shared  /app/packages/shared
COPY --from=build-api /app/apps/api/dist       ./dist
COPY --from=build-api /app/apps/api/prisma     ./prisma
COPY --from=build-web /app/apps/web/build      ./public   # UI estática servida pelo Nest
RUN mkdir -p /data                             # SQLite (DATABASE_URL=file:/data/spotiseek.db)
EXPOSE 8080
ENTRYPOINT ["/sbin/tini","--"]
# aplica migrations do SQLite e sobe a API
CMD ["sh","-c","npx prisma migrate deploy && node dist/main.js"]
```

Build multi-arch (CI):
```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/<org>/spotiseek:latest --push -f docker/Dockerfile .
```

> **Por que Alpine + Node 20:** imagem final pequena (~150–250MB). Prisma exige
> `binaryTargets` com `linux-musl-arm64-openssl-3.0.x` / `linux-musl-openssl-3.0.x` (já no
> schema, doc 03). `ffmpeg` via apk evita bundlar binários grandes.

## 2. docker-compose.yml (raiz do repo — 2 serviços)

O arquivo real é [`docker-compose.yml`](../docker-compose.yml) na raiz. Stack ULTRALIGHT:

```yaml
name: spotiseek
services:
  app:
    build: { context: ., dockerfile: docker/Dockerfile }
    image: spotiseek:latest
    restart: unless-stopped
    depends_on: [ slskd ]
    env_file: [ .env ]
    environment:
      DATABASE_URL: file:/data/spotiseek.db      # SQLite — arquivo único
      JWT_SECRET: ${JWT_SECRET}
      APP_SECRET: ${APP_SECRET}                  # cifra tokens OAuth
      SPOTIFY_CLIENT_ID: ${SPOTIFY_CLIENT_ID}
      SPOTIFY_CLIENT_SECRET: ${SPOTIFY_CLIENT_SECRET}
      SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI}
      SLSKD_URL: http://slskd:5030
      SLSKD_API_KEY: ${SLSKD_API_KEY}
      LIBRARY_PATH: /music
      DOWNLOADS_PATH: /downloads
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    volumes:
      - ${MUSIC_PATH:-./music}:/music            # biblioteca final (bind mount → seu disco)
      - ${STAGING_PATH:-./downloads}:/downloads  # staging (compartilhado com slskd)
      - app-data:/data                           # SQLite + estado da app
    ports: ["8080:8080"]
    healthcheck:
      test: ["CMD","wget","--quiet","--tries=1","--spider","http://localhost:8080/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 40s                          # tempo p/ migrations no boot
    deploy: { resources: { limits: { memory: 640M } } }

  slskd:
    image: slskd/slskd:latest                    # multi-arch (amd64/arm64)
    restart: unless-stopped
    environment:
      SLSKD_REMOTE_CONFIGURATION: "false"
      SLSKD_SLSK_USERNAME: ${SOULSEEK_USERNAME}
      SLSKD_SLSK_PASSWORD: ${SOULSEEK_PASSWORD}
      SLSKD_API_KEY: ${SLSKD_API_KEY}
    volumes:
      - ./docker/slskd.yml:/app/slskd.yml:ro
      - ${STAGING_PATH:-./downloads}:/downloads   # mesma pasta de staging que o app lê
      - slskd-incomplete:/incomplete              # parciais (mount point sempre existe)
      - slskd-data:/app/data
    ports: ["50300:50300"]                        # 50300 = porta de escuta P2P
                                                  # 5030 (REST) só na rede interna do compose
    deploy: { resources: { limits: { memory: 320M } } }

volumes:
  app-data:        # SQLite + estado da app
  slskd-data:
  slskd-incomplete:
```

> **Persistência garantida:** a **biblioteca** e o **staging** são *bind mounts* para o host
> (`MUSIC_PATH`/`STAGING_PATH`); o **SQLite + estado da app** (`app-data`) e o estado do slskd
> ficam em volumes nomeados. Recriar containers **não** perde dados. **Backup:** `tar` do
> volume `app-data` salva o banco inteiro (`scripts/backup.sh`); a música já está no seu disco.
> Limites de memória somam **~960MB** de teto — folga enorme no RPi4 de 4GB.

### 2.1. Mapear a biblioteca para o seu disco (Raspberry Pi)

Por padrão a música vai para `./music` na pasta do projeto. Para gravar no seu disco externo,
defina no `.env` (caminhos do **host**):

```bash
# biblioteca final organizada (Artista/Álbum/NN Título.ext)
MUSIC_PATH=/home/pi/airdisk/Airdisk/Music
# staging dos downloads — use o MESMO disco que MUSIC_PATH p/ a organização ser um rename
# rápido (mover entre discos diferentes copia o arquivo inteiro):
STAGING_PATH=/home/pi/airdisk/Airdisk/.spotiseek-staging
```

O slskd baixa em `STAGING_PATH`, o app organiza (renomeia + tags + capa) para `MUSIC_PATH`.
Os caminhos internos do container (`/music`, `/downloads`) permanecem fixos — você só mexe
nos do host.

> **Permissões:** o container grava como root por padrão. Garanta que os caminhos existem e
> são graváveis (`mkdir -p` + `sudo chown` se necessário). Se o disco for exFAT/NTFS, monte-o
> com permissão de escrita no `/etc/fstab` (ex.: `uid=1000,gid=1000,umask=000`). Se aparecer
> erro de permissão na organização, é quase sempre isto.
>
> **Compartilhamento Soulseek desligado por padrão** → o `/music` **não** é montado no slskd
> (doc 02/09). Para ativar a etiqueta de rede depois, monte `${MUSIC_PATH}:/music:ro` no slskd
> e habilite `shares` no `slskd.yml`.

## 3. .env.example

O arquivo real é [`.env.example`](../.env.example). Variáveis (segredos: `openssl rand -hex 32`):

```bash
DATABASE_URL=file:/data/spotiseek.db   # SQLite — não precisa mexer
JWT_SECRET=                 # openssl rand -hex 32
APP_SECRET=                 # openssl rand -hex 32  (cifra tokens OAuth)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=             # senha do admin inicial
# Spotify (registre seu próprio app: https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:8080/api/spotify/callback
# Soulseek (conta na rede — criada uma vez)
SOULSEEK_USERNAME=
SOULSEEK_PASSWORD=
SLSKD_API_KEY=              # openssl rand -hex 32  (também lida pelo slskd.yml)
SLSKD_URL=http://slskd:5030
LIBRARY_PATH=/music
DOWNLOADS_PATH=/downloads
```

## 4. scripts/install.sh (bootstrap RPi)

O arquivo real é [`scripts/install.sh`](../scripts/install.sh) — idempotente, `set -euo
pipefail`. Resumo do que faz:

```bash
#!/usr/bin/env bash
set -euo pipefail
# 1. Docker (instala se faltar)
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
# 2. .env a partir do exemplo
[ -f .env ] || cp .env.example .env
# 3. gera segredos vazios (JWT_SECRET, APP_SECRET, SLSKD_API_KEY)
for k in JWT_SECRET APP_SECRET SLSKD_API_KEY; do
  grep -qE "^$k=$" .env && sed -i "s|^$k=$|$k=$(openssl rand -hex 32)|" .env || true
done
# 4. exige credenciais que só o operador tem (Spotify/Soulseek/admin); aborta se faltarem
# 5. sobe a stack
docker compose pull && docker compose up -d --build
echo "Spotiseek em http://$(hostname -I | awk '{print $1}'):8080"
```

> Backup do estado: [`scripts/backup.sh`](../scripts/backup.sh) faz `tar` do volume
> `app-data` (SQLite) + `slskd.yml` + `.env` num único `.tar.gz`.

## 5. Otimizações específicas para Raspberry Pi 4

| Área | Estratégia |
|---|---|
| **Memória** | `NODE_OPTIONS=--max-old-space-size=384`; API+workers+fila no mesmo processo; SQLite tem footprint mínimo (sem daemon de banco). Teto total ~960MB. |
| **CPU** | Concorrência de download baixa (2); matching é O(n) leve por faixa; evitar shell-out de ffmpeg em loop (usar taglib lib). Builds fora do Pi (CI). |
| **Disco/IO (SSD USB 3.0)** | `organize` serial; escrever tags in-place; mover (rename) ao invés de copiar quando download e library no mesmo FS; SQLite em modo **WAL** (boa concorrência leitura/escrita) com `synchronous=NORMAL`. |
| **Download adaptativo** | Reduzir concorrência se RAM/IO subir (watchdog que lê `/proc`); pausar buscas se health do slskd degradar. |
| **Indexação eficiente** | SQLite com índices em colunas normalizadas (`*Norm`) e, se preciso, FTS5 para busca textual da biblioteca. Suporta dezenas de milhares de faixas. |
| **Cache** | In-process (memória, TTL): tokens Spotify, respostas de busca recentes; metadados MusicBrainz materializados na SQLite (sem Redis). Reduz chamadas externas e CPU. |
| **Boot rápido** | Migrations idempotentes (`prisma migrate deploy`); reconciliação assíncrona pós-boot (não bloqueia readiness). |
| **Térmico/SD** | Recomendar boot por SSD USB (não SD card) — a escrita contínua da SQLite (downloads/jobs) desgasta SD card. Documentado no install. |

## 6. Estratégia de atualização

- Imagens versionadas (`:1.2.3` + `:latest`) em GHCR. Update = `docker compose pull && up -d`.
- Migrations Prisma rodam no start (`prisma migrate deploy`, forward-only, testadas em CI).
- **Watchtower opcional** para auto-update (documentado, não default — updates de app que
  baixa conteúdo devem ser conscientes).
- Backup: `scripts/backup.sh` faz `tar` do volume `app-data` (SQLite `/data/spotiseek.db`) +
  `slskd.yml`/`.env` antes de upgrades maiores. Restaurar = destar de volta no volume.
