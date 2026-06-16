<div align="center">

# 🎵 Spotiseek

**Sync your Spotify playlists and automatically download your music via Soulseek — self-hosted, headless, light enough for a Raspberry Pi.**

Think **Lidarr + Overseerr**, but driven by Spotify playlists, with intelligent score-based matching, automatic library organization, and a minimalist Apple-style UI — with a built-in player.

`NestJS` · `SvelteKit` · `SQLite` · `slskd` · `Docker (amd64 / arm64)`

</div>

---

## ⚠️ Legal notice

Soulseek is a P2P file-sharing network. **There is no official API** and automated use is not endorsed by the network. Downloading copyrighted works without a license may be **illegal** in your jurisdiction. Spotiseek is a **personal-use automation tool**: it does not host, distribute, or index content — it merely orchestrates a client (slskd) that **you** install and control. **Responsibility for what is downloaded/shared lies entirely with the operator.** See [`docs/09`](docs/09-riscos-alternativas.md).

---

## ✨ Features

- **Spotify playlist import** — by URL (public, via Client Credentials) or from your account (private, via OAuth).
- **On-demand downloads** — importing a playlist only **catalogs** the tracks; you click **Download** on whatever you want (or "Download all"). Optional auto mode.
- **Wishlist** — add a **track**, **album**, or **artist** by text; the app resolves it on Spotify and downloads via Soulseek (full discography for artists).
- **Intelligent score-based matching** — title/artist/album similarity (substring-aware), duration, and quality; with per-candidate score **auditing**.
- **Quality policy** — preference FLAC › MP3 320 › V0 › 256 › 192, with a configurable floor and **bitrate inference** when the peer doesn't report it.
- **Download resilience** — *stall* detection (idle peer) and **automatic rotation** to the next-best source (up to 4 sources).
- **Library organization** — moves/renames to `Artist/Album (year)/NN Title.ext`, writes tags (ffmpeg), deduplicates.
- **Built-in web player** — play downloaded tracks right in the interface (streaming with seek).
- **Real-time** — live download progress and log via SSE.
- **Headless & lightweight** — 2 containers, SQLite (no Postgres/Redis), embedded durable queue. Runs 24/7 on an RPi4.

---

## 🧱 Stack & architecture

**Ultralight** stack — just **2 containers**:

| Container | Role | Typical RAM (RPi4) |
|---|---|---|
| `app` | NestJS API + workers + **durable queue in SQLite** + static UI (SvelteKit) | ~150–350 MB |
| `slskd` | Headless Soulseek client (REST API) | ~80–200 MB |

No Postgres, no Redis: all persistence is **a single SQLite file**; the job queue is embedded (survives restarts).

```
Browser ──HTTP/SSE──► app (NestJS + static SvelteKit + SQLite)
                        │
        ┌───────────────┼───────────────────────────┐
        ▼               ▼                             ▼
   Spotify Web API   slskd (REST)              Volume: MUSIC_PATH
   (metadata)        │  Soulseek protocol       (final library)
                     ▼
                Soulseek network
```

**Async pipeline:** `import → search → match → download → organize → library`.
Full documentation in [`docs/`](#-documentation).

---

## 🚀 Quick start

> Requires **Docker** + **Docker Compose**. Images build natively for `amd64` and `arm64` (Raspberry Pi OS 64-bit).

```bash
git clone https://github.com/thiagobucca/spotiseek.git
cd spotiseek

cp .env.example .env       # fill in secrets + Spotify + Soulseek + paths (see below)
docker compose up -d

# UI at http://localhost:8080  (log in with ADMIN_EMAIL / ADMIN_PASSWORD)
```

Or use the bootstrap script (installs Docker if missing, generates secrets, brings the stack up):

```bash
./scripts/install.sh
```

---

## ⚙️ Configuration (`.env`)

| Variable | Description |
|---|---|
| `JWT_SECRET` | Signs session tokens. `openssl rand -hex 32` |
| `APP_SECRET` | Encrypts Spotify OAuth tokens at rest. `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account created on first boot |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | From your app at [developer.spotify.com](https://developer.spotify.com/dashboard) |
| `SPOTIFY_REDIRECT_URI` | Must **exactly** match the one registered in Spotify (see note below) |
| `SOULSEEK_USERNAME` / `SOULSEEK_PASSWORD` | Soulseek network account (used by slskd) |
| `SLSKD_API_KEY` | Internal app↔slskd key. `openssl rand -hex 16` |
| `MUSIC_PATH` | **Where your final library lives** (host bind mount) |
| `STAGING_PATH` | Temporary download area (use the **same drive** as `MUSIC_PATH`) |

### 🎯 Where music is stored

Organized music goes to `MUSIC_PATH` (a bind mount). Defaults to `./music` in the project folder; point it anywhere you like:

```bash
MUSIC_PATH=/home/pi/airdisk/Airdisk/Music
STAGING_PATH=/home/pi/airdisk/Airdisk/.spotiseek-staging   # same drive = fast "rename" organization
```

slskd downloads into `STAGING_PATH`; the app organizes (rename + tags + cover) by moving into `MUSIC_PATH`.

> **Permissions:** the container writes as root. Make sure the paths exist and are writable. If the drive is exFAT/NTFS, mount it with `uid=1000,gid=1000,umask=000` in `/etc/fstab`. Details in [`docs/06`](docs/06-deploy-raspberry-pi.md).

---

## 🟢 Spotify — quick setup

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app** → copy the **Client ID** and **Client Secret**.
2. Under **Redirect URIs**, add exactly your `SPOTIFY_REDIRECT_URI`.

> **Heads-up (Spotify rule):** redirect URIs only accept **HTTPS**, except the loopback **`http://127.0.0.1`**. So:
> - **Public playlists** (import by URL) work from anywhere — no OAuth needed.
> - **Private playlists** (OAuth) need `http://127.0.0.1:8080/...` (do the login once via an SSH tunnel on a headless Pi) **or** HTTPS (Tailscale/Caddy). See [`docs/09`](docs/09-riscos-alternativas.md).

---

## 🎧 Soulseek — setup

- Create a Soulseek account and fill in `SOULSEEK_USERNAME`/`SOULSEEK_PASSWORD`.
- **Sharing is off by default** (personal use). The network etiquette favors those who share back — to enable it, mount your library read-only into slskd and turn on `shares` in [`docker/slskd.yml`](docker/slskd.yml) (instructions inside the file).
- slskd's REST API stays **on the internal compose network only** (port 5030 is not published); only the P2P port `50300` is exposed.

---

## 📖 Usage

1. **Log in** at `http://<host>:8080` (admin from `.env`).
2. **Connect Spotify** under *Settings* (for private playlists) — optional for public ones.
3. **Playlists → Import** → paste a Spotify playlist URL → the tracks get cataloged.
4. Open the playlist and click **Download** on the tracks you want (or **Download all**). Track progress in **Downloads** (live).
5. **Wishlist** → add a track/album/artist by text → it resolves and downloads automatically.
6. **Library** → browse and **▶ play** tracks in the built-in player.

Tracks with no source show up as **"Not found"** with a retry button (it rotates through up to 4 sources, skipping dead peers).

---

## 🗂️ Project structure

```
spotiseek/
├── apps/
│   ├── api/                  # NestJS — API, workers, job pipeline, providers, library
│   │   ├── src/
│   │   │   ├── spotify/      # OAuth + client-credentials + search/resolve
│   │   │   ├── providers/    # ⭐ pluggable architecture (SlskdProvider)
│   │   │   ├── matching/     # score + quality algorithm
│   │   │   ├── queue/        # embedded durable queue (SQLite)
│   │   │   ├── jobs/         # import → search → match → download → organize
│   │   │   ├── library/      # organization, tags, covers, dedupe, streaming
│   │   │   └── ...           # auth, playlists, wishlist, downloads, dashboard, events(SSE)
│   │   └── prisma/           # SQLite schema + migrations
│   └── web/                  # SvelteKit (adapter-static) — Apple-minimalist UI + player
├── packages/shared/          # shared typed contract (DTOs/enums)
├── docker/                   # multi-arch Dockerfile + slskd.yml
├── docs/                     # architecture documentation (see below)
├── prototype/                # UI prototype (design reference)
├── scripts/                  # install.sh, backup.sh
└── docker-compose.yml
```

---

## 🛠️ Development

```bash
npm install
npm run build:shared              # build the shared package first

# backend (port 8080)
npm run dev:api

# standalone frontend with mocks (port 5173) — UI without a backend
PUBLIC_USE_MOCKS=true npm run dev:web
```

- Migrations: `npm run prisma:migrate -w @spotiseek/api`
- Build everything: `npm run build`

---

## 📚 Documentation

> Architecture docs are written in Portuguese (pt-BR).

| Doc | Contents |
|---|---|
| [01 — Architecture](docs/01-arquitetura.md) | Components, stack, directory structure |
| [02 — Soulseek integration](docs/02-soulseek.md) | slskd evaluation, provider abstraction, code |
| [03 — Data model](docs/03-modelo-dados.md) | Prisma/SQLite schema |
| [04 — REST API](docs/04-api-rest.md) | Endpoints, contracts, SSE |
| [05 — Flows, jobs & matching](docs/05-fluxos-jobs-matching.md) | Pipeline, score algorithm, quality |
| [06 — Deploy & Raspberry Pi](docs/06-deploy-raspberry-pi.md) | Multi-arch Docker, disk mapping, optimizations |
| [07 — Roadmap, risks, alternatives](docs/07-roadmap-riscos-alternativas.md) | Phases, MVP, scalability, observability |
| [09 — Legal/operational limits](docs/09-riscos-alternativas.md) | ToS, ratio, copyright, Spotify quota |

---

## 📦 Resource footprint (Raspberry Pi 4)

- **< 1 GB RAM** at idle; ~960 MB memory ceiling in the compose.
- Single SQLite file; staging→library via *rename* (no copy) when on the same drive.
- Low download concurrency by default (tuned for USB SSD); rate-limited search (avoids bans).

---

## 🗺️ Roadmap

- [ ] CI (GitHub Actions) publishing a multi-arch image to GHCR
- [ ] "Import all my playlists" (discovery via Spotify account)
- [ ] Playable track list inside the Library + "play album"
- [ ] Notifications (ntfy/Discord) on failures
- [ ] Automatic quality upgrade (re-download FLAC when it appears)
- [ ] Prometheus metrics (optional)

---

## 📄 License

Personal use. See the [legal notice](#️-legal-notice). Set the repository license as you prefer.
