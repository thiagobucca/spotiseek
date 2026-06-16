# 04 — API REST

Base: `/api`. Formato: JSON. Auth: `Authorization: Bearer <jwt>` (exceto login e health).
Versionamento: prefixo `/api` hoje; `/api/v2` reservado p/ breaking changes futuras.

## Convenções

- Paginação por cursor: `?limit=50&cursor=<id>` → `{ data: [...], nextCursor }`.
- Erros: `{ statusCode, error, message, details? }` (filtro de exceção global Nest).
- Operações longas retornam **202 Accepted** com `{ jobId }` e progridem via SSE.
- Idempotência: `POST` de sync aceita header `Idempotency-Key`.

## Autenticação

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | `{email,password}` → `{accessToken, refreshToken}` |
| POST | `/auth/refresh` | renova access token |
| POST | `/auth/logout` | revoga refresh token |
| GET  | `/auth/me` | usuário atual |

### Spotify OAuth (PKCE / Authorization Code)
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/spotify/connect` | redireciona ao consent do Spotify (scopes: `playlist-read-private playlist-read-collaborative user-library-read`) |
| GET  | `/spotify/callback` | troca `code`→tokens, cifra e persiste em `User.spotifyAuth` |
| GET  | `/spotify/status` | `{connected, scopes, expiresAt}` |
| DELETE | `/spotify/connection` | desconecta |

## Playlists

| Método | Rota | Descrição |
|---|---|---|
| GET | `/playlists` | lista (nome, #músicas, lastSyncedAt, status) |
| POST | `/playlists/import` | `{ url \| spotifyId, syncMode, syncCron? }` — importa pública via URL ou privada via OAuth → **202** `{jobId}` |
| GET | `/playlists/:id` | detalhe + faixas + status por faixa |
| PATCH | `/playlists/:id` | editar (syncMode, cron, nome) |
| POST | `/playlists/:id/sync` | **Sincronizar agora** → 202 `{jobId}` |
| DELETE | `/playlists/:id` | remove (não apaga arquivos por padrão; `?purgeFiles=true`) |

## Wishlist

| Método | Rota | Descrição |
|---|---|---|
| GET | `/wishlist` | lista itens |
| POST | `/wishlist` | `{ type: TRACK\|ALBUM\|ARTIST\|PLAYLIST, query }` → resolve e enfileira |
| DELETE | `/wishlist/:id` | remove |

Exemplos de corpo:
```json
{ "type": "TRACK",  "query": "Metallica - One" }
{ "type": "ALBUM",  "query": "Dream Theater - Images and Words" }
{ "type": "ARTIST", "query": "Pink Floyd" }          // monitora discografia
```

## Catálogo / Biblioteca

| Método | Rota | Descrição |
|---|---|---|
| GET | `/library/artists` | lista artistas (+capa, #álbuns) |
| GET | `/library/artists/:id` | álbuns do artista |
| GET | `/library/albums/:id` | faixas + estado (na biblioteca? qualidade?) |
| GET | `/library/tracks` | busca rápida `?q=` (full-text Postgres) |
| GET | `/library/search?q=` | busca global artistas/álbuns/faixas |
| POST | `/library/rescan` | reindexar pasta `/music` → 202 |

## Downloads

| Método | Rota | Descrição |
|---|---|---|
| GET | `/downloads` | ativos+recentes (música, artista, provider, qualidade, velocidade, progresso) |
| GET | `/downloads/:id` | detalhe + logs |
| POST | `/downloads/:id/retry` | re-enfileira |
| POST | `/downloads/:id/cancel` | cancela transfer no provider |
| GET | `/downloads/:id/candidates` | candidatos de match + score breakdown (auditoria) |
| POST | `/tracks/:id/rematch` | força nova busca/seleção de candidato |
| POST | `/tracks/:id/select` | `{candidateId}` seleção manual de um candidato |

## Providers & Configurações

| Método | Rota | Descrição |
|---|---|---|
| GET | `/providers` | lista + saúde + prioridade |
| PATCH | `/providers/:key` | `{enabled, priority, config}` |
| POST | `/providers/:key/health` | dispara healthCheck |
| GET | `/settings` | todas as configs |
| PATCH | `/settings` | atualiza (qualidade, pasta, maxConcurrent, agendamentos, política) |

Exemplo `PATCH /settings`:
```json
{
  "quality.priority": ["FLAC","MP3_320","V0","MP3_256","MP3_192"],
  "quality.minimum": "MP3_192",
  "downloads.maxConcurrent": 2,
  "library.path": "/music",
  "matching.autoAcceptScore": 0.85
}
```

## Dashboard & Eventos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard` | agregados: #playlists, #artistas monitorados, downloads ativos/concluídos/falhas, espaço usado, qualidade média |
| GET | `/events` | **SSE** stream: `download.progress`, `download.done`, `sync.progress`, `log`, `health` |
| GET | `/health` | liveness/readiness (db, redis, slskd) — sem auth |
| GET | `/metrics` | Prometheus (opcional, ver doc 07) |

### Exemplo de evento SSE
```
event: download.progress
data: {"id":"ck..","trackId":"ck..","progress":0.42,"speedBps":1310720,"state":"IN_PROGRESS"}
```
