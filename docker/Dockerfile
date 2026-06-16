# syntax=docker/dockerfile:1
#
# Spotiseek — imagem ULTRALIGHT (app único: NestJS API + Workers + UI estática + SQLite).
# Multi-stage, multi-arch (linux/amd64 + linux/arm64 p/ Raspberry Pi 4 64-bit).
#
# Estágios:
#   deps         -> instala node_modules de TODO o monorepo (npm workspaces)
#   build-shared -> compila packages/shared (@spotiseek/shared) primeiro
#   build-web    -> compila apps/web (SvelteKit adapter-static) -> apps/web/build
#   build-api    -> gera Prisma Client + compila apps/api (NestJS) -> apps/api/dist
#   prune        -> reinstala somente dependências de produção (imagem final enxuta)
#   runtime      -> Alpine slim + ffmpeg + tini; roda migrations e sobe o servidor
#
# Build multi-arch (CI):
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -t ghcr.io/<org>/spotiseek:latest --push -f docker/Dockerfile .

# ---------- base ----------
FROM node:20-alpine AS base
WORKDIR /app
# Alpine usa musl -> o Prisma precisa dos binaryTargets linux-musl-* (já no schema.prisma).
ENV NODE_ENV=production

# ---------- deps (instala TODAS as deps, incl. dev, p/ poder buildar) ----------
FROM base AS deps
ENV NODE_ENV=development
# Manifests primeiro -> cache de layer de instalação não invalida a cada mudança de código.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
# npm ci na raiz resolve TODO o workspace de uma vez (npm workspaces, não pnpm).
RUN npm ci

# ---------- build shared (precisa vir antes de web e api) ----------
FROM deps AS build-shared
COPY packages/shared packages/shared
RUN npm run build -w @spotiseek/shared

# ---------- build web (SvelteKit estático -> apps/web/build) ----------
FROM build-shared AS build-web
# Produção SEMPRE fala com a API real (mocks só p/ dev standalone). Fixar aqui garante o
# comportamento mesmo que o .env não esteja no contexto de build (ver .dockerignore).
ENV PUBLIC_USE_MOCKS=false
COPY apps/web apps/web
RUN npm run build -w @spotiseek/web

# ---------- build api (Prisma generate + nest build -> apps/api/dist) ----------
FROM build-shared AS build-api
COPY apps/api apps/api
# Gera o Prisma Client com os engines musl corretos antes de compilar.
RUN npm run prisma:generate -w @spotiseek/api
RUN npm run build -w @spotiseek/api

# ---------- prune (node_modules só de produção p/ a imagem final) ----------
FROM base AS prune
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev
# Reaproveita o shared já compilado e o Prisma Client já gerado.
COPY --from=build-shared /app/packages/shared/dist packages/shared/dist
COPY --from=build-api /app/node_modules/.prisma node_modules/.prisma
COPY --from=build-api /app/node_modules/@prisma node_modules/@prisma

# ---------- runtime (imagem final slim) ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Limite de heap V8 amigável a RPi4 (sobrescrevível via env do compose).
ENV NODE_OPTIONS="--max-old-space-size=384"
# ffmpeg: escrita/leitura de tags e probe. tini: PID 1 que faz reaping de zumbis.
# openssl + libc6-compat: exigidos pelos engines do Prisma (schema + query) no Alpine/musl.
RUN apk add --no-cache ffmpeg tini wget openssl libc6-compat

# node_modules de produção (com Prisma Client) + shared compilado.
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/packages/shared ./packages/shared
COPY --from=prune /app/package.json ./package.json

# App compilado.
COPY --from=build-api /app/apps/api/dist ./apps/api/dist
COPY --from=build-api /app/apps/api/package.json ./apps/api/package.json
COPY --from=build-api /app/apps/api/prisma ./apps/api/prisma
# UI estática servida pelo próprio Nest (sem container extra de SSR).
COPY --from=build-web /app/apps/web/build ./apps/api/public

# Diretório do SQLite (DATABASE_URL=file:/data/spotiseek.db) — montado como volume em prod.
RUN mkdir -p /data

WORKDIR /app/apps/api
EXPOSE 8080

# tini como init -> sinais corretos (SIGTERM) chegam ao Node.
ENTRYPOINT ["/sbin/tini", "--"]
# 1) aplica migrations do SQLite (forward-only), 2) sobe a API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
