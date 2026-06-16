# 03 — Modelo de dados (PostgreSQL / Prisma)

Princípios:
- **Spotify = intenção** (o que o usuário quer). **Catálogo local = realidade** (o que existe/baixou).
- Toda faixa desejada vira um `Track` (alvo canônico). O ciclo de vida do download é
  rastreado em `DownloadJob` + `MatchCandidate`, separados do `Track` para auditoria.
- IDs externos (Spotify ID, ISRC, MusicBrainz MBID) guardados para dedupe e enriquecimento.
- JSONB para payloads flexíveis (resultados crus de busca, metadados extras) sem inflar colunas.

## Diagrama de entidades (resumo)

```
User ─< Playlist ─< PlaylistTrack >─ Track ─< MatchCandidate
                                      │  │
Wishlist ─────────────────────────────┘  └─< DownloadJob >─ Provider
Track >─ Album >─ Artist
Track ─1:1─ LibraryFile (quando baixada e organizada)
Setting (singleton-ish, key/value tipado)
SyncRun (histórico de sincronizações)  AuditLog
```

## schema.prisma (essencial)

```prisma
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "linux-arm64-openssl-3.0.x", "linux-musl-arm64-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Auth ─────────────────────────
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  role         Role       @default(ADMIN)
  // tokens OAuth do Spotify (criptografados na app antes de salvar)
  spotifyAuth  Json?      // { accessToken, refreshToken, expiresAt, scopes }
  createdAt    DateTime   @default(now())
  playlists    Playlist[]
  wishlists    Wishlist[]
}

enum Role { ADMIN USER }

// ─────────────────────── Domínio musical ───────────────────────
model Artist {
  id           String   @id @default(cuid())
  name         String
  nameNorm     String   // normalizado p/ matching (lowercase, sem acento/feat.)
  spotifyId    String?  @unique
  mbid         String?  @unique     // MusicBrainz Artist ID
  imageUrl     String?
  monitored    Boolean  @default(false) // wishlist de artista = baixar discografia
  albums       Album[]
  tracks       Track[]
  createdAt    DateTime @default(now())
  @@index([nameNorm])
}

model Album {
  id          String   @id @default(cuid())
  title       String
  titleNorm   String
  spotifyId   String?  @unique
  mbid        String?
  year        Int?
  coverUrl    String?
  artistId    String
  artist      Artist   @relation(fields: [artistId], references: [id])
  tracks      Track[]
  @@index([titleNorm])
}

model Track {
  id          String   @id @default(cuid())
  title       String
  titleNorm   String
  artistId    String
  artist      Artist   @relation(fields: [artistId], references: [id])
  albumId     String?
  album       Album?   @relation(fields: [albumId], references: [id])
  // metadados de origem (Spotify)
  spotifyId   String?  @unique
  isrc        String?              // chave forte de matching/dedupe
  durationMs  Int?
  trackNumber Int?
  discNumber  Int?
  popularity  Int?
  // ciclo de vida
  status      TrackStatus @default(WANTED)
  source      TrackSource              // de onde veio a intenção
  libraryFile LibraryFile?
  candidates  MatchCandidate[]
  downloads   DownloadJob[]
  playlists   PlaylistTrack[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([artistId, titleNorm, albumId])   // dedupe lógico
  @@index([isrc])
  @@index([status])
}

enum TrackStatus { WANTED SEARCHING MATCHED DOWNLOADING DOWNLOADED IMPORTED FAILED IGNORED }
enum TrackSource { SPOTIFY_PLAYLIST WISHLIST_TRACK WISHLIST_ALBUM WISHLIST_ARTIST MANUAL }

// ─────────────────────── Playlists / Wishlist ───────────────────────
model Playlist {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  spotifyId     String?  @unique     // null = playlist local/manual
  name          String
  isPublic      Boolean  @default(true)
  snapshotId    String?              // snapshot_id do Spotify p/ detectar mudanças
  syncMode      SyncMode @default(MANUAL)
  syncCron      String?              // cron se SCHEDULED
  lastSyncedAt  DateTime?
  status        PlaylistStatus @default(IDLE)
  tracks        PlaylistTrack[]
  createdAt     DateTime @default(now())
}

enum SyncMode { MANUAL SCHEDULED AUTO }
enum PlaylistStatus { IDLE SYNCING ERROR }

model PlaylistTrack {
  playlistId String
  trackId    String
  addedAt    DateTime  @default(now())
  position   Int?
  playlist   Playlist  @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  track      Track     @relation(fields: [trackId], references: [id])
  @@id([playlistId, trackId])
}

model Wishlist {
  id        String       @id @default(cuid())
  userId    String
  user      User         @relation(fields: [userId], references: [id])
  type      WishlistType
  query     String       // texto cru informado pelo usuário
  resolved  Json?        // ids resolvidos (spotify/mbid) após normalização
  status    String       @default("pending")
  createdAt DateTime     @default(now())
}

enum WishlistType { TRACK ALBUM ARTIST PLAYLIST }

// ─────────────────────── Providers / Download ───────────────────────
model Provider {
  id        String   @id @default(cuid())
  key       String   @unique          // "soulseek"
  name      String
  enabled   Boolean  @default(true)
  priority  Int      @default(100)    // menor = maior prioridade
  config    Json?                     // base url, apiKey ref, etc (segredos via env)
  healthy   Boolean  @default(false)
  lastCheck DateTime?
  downloads DownloadJob[]
}

model MatchCandidate {
  id          String   @id @default(cuid())
  trackId     String
  track       Track    @relation(fields: [trackId], references: [id], onDelete: Cascade)
  providerKey String
  // resultado cru do provider (filename, user, size, bitrate, etc.)
  raw         Json
  // dados extraídos p/ score
  filename    String
  format      String?  // flac/mp3
  bitrate     Int?
  sizeBytes   BigInt?
  // resultado do scoring
  score       Float
  scoreBreakdown Json    // {title, artist, album, duration, quality, ...} p/ auditoria
  chosen      Boolean  @default(false)
  createdAt   DateTime @default(now())
  @@index([trackId, score])
}

model DownloadJob {
  id          String   @id @default(cuid())
  trackId     String
  track       Track    @relation(fields: [trackId], references: [id])
  providerId  String
  provider    Provider @relation(fields: [providerId], references: [id])
  candidateId String?  // candidato escolhido
  // referência externa ao transfer no slskd
  externalRef Json?    // { username, filename }
  state       DownloadState @default(QUEUED)
  progress    Float    @default(0)   // 0..1
  speedBps    Int?
  bytesDone   BigInt   @default(0)
  bytesTotal  BigInt?
  attempts    Int      @default(0)
  error       String?
  filePath    String?  // caminho em /downloads quando concluído
  startedAt   DateTime?
  finishedAt  DateTime?
  createdAt   DateTime @default(now())
  @@index([state])
}

enum DownloadState { QUEUED REQUESTED IN_PROGRESS COMPLETED IMPORTED FAILED CANCELLED }

// ─────────────────────── Biblioteca ───────────────────────
model LibraryFile {
  id         String   @id @default(cuid())
  trackId    String   @unique
  track      Track    @relation(fields: [trackId], references: [id])
  path       String   @unique        // caminho final em /music
  format     String
  bitrate    Int?
  sizeBytes  BigInt
  sampleRate Int?
  hash       String?                 // p/ dedupe (audio hash ou sha256)
  tagged     Boolean  @default(false)
  createdAt  DateTime @default(now())
  @@index([hash])
}

// ─────────────────────── Operação ───────────────────────
model Setting {
  key       String   @id           // ex "quality.priority", "downloads.maxConcurrent"
  value     Json
  updatedAt DateTime @updatedAt
}

model SyncRun {
  id          String   @id @default(cuid())
  playlistId  String?
  kind        String   // "playlist" | "wishlist" | "discography"
  added       Int      @default(0)
  matched     Int      @default(0)
  downloaded  Int      @default(0)
  failed      Int      @default(0)
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
}

model AuditLog {
  id        String   @id @default(cuid())
  level     String   // info/warn/error
  scope     String   // "match" | "download" | "spotify" | ...
  message   String
  meta      Json?
  createdAt DateTime @default(now())
  @@index([scope, createdAt])
}
```

## Notas de modelagem

- **Dedupe em três camadas:** (1) `Track.@@unique([artistId,titleNorm,albumId])` evita
  intenção duplicada; (2) `Track.isrc` indexado permite colapsar a mesma gravação vinda de
  playlists diferentes; (3) `LibraryFile.hash` detecta arquivo físico duplicado.
- **Segredos não vão em `Provider.config` em claro.** A coluna guarda *referências*
  (ex.: nome da env). Tokens OAuth em `User.spotifyAuth` são cifrados com `APP_SECRET`
  (AES-GCM) antes de persistir.
- **`MatchCandidate.scoreBreakdown`** guarda o detalhamento do score → atende ao requisito
  de "registrar score para auditoria".
- **Tamanho em disco:** índices enxutos; JSONB só onde necessário. Para dezenas de milhares
  de faixas, o footprint do Postgres fica em poucas centenas de MB.
