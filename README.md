<div align="center">

# 🎵 Spotiseek

**Sincronize playlists do Spotify e baixe automaticamente sua música via Soulseek — self-hosted, headless, leve o suficiente para um Raspberry Pi.**

Pense em **Lidarr + Overseerr**, mas dirigido por playlists do Spotify, com matching inteligente por score, organização automática da biblioteca e uma UI minimalista estilo Apple — com player embutido.

`NestJS` · `SvelteKit` · `SQLite` · `slskd` · `Docker (amd64 / arm64)`

</div>

---

## ⚠️ Aviso legal

Soulseek é uma rede P2P de compartilhamento de arquivos. **Não existe API oficial** e o uso automatizado não é endossado pela rede. Baixar obras protegidas por direitos autorais sem licença pode ser **ilegal** na sua jurisdição. O Spotiseek é uma **ferramenta de automação de uso pessoal**: ele não hospeda, distribui nem indexa conteúdo — apenas orquestra um cliente (slskd) que **você** instala e controla. **A responsabilidade pelo que é baixado/compartilhado é inteiramente do operador.** Ver [`docs/09`](docs/09-riscos-alternativas.md).

---

## ✨ Funcionalidades

- **Import de playlists do Spotify** — por URL (públicas, via Client Credentials) ou da sua conta (privadas, via OAuth).
- **Download sob demanda** — importar uma playlist só **cataloga** as faixas; você clica **Baixar** no que quiser (ou "Baixar todas"). Modo automático opcional.
- **Wishlist** — adicione **faixa**, **álbum** ou **artista** por texto; o app resolve no Spotify e baixa via Soulseek (discografia para artista).
- **Matching inteligente por score** — similaridade de título/artista/álbum (substring-aware), duração e qualidade; com **auditoria** do score por candidato.
- **Política de qualidade** — preferência FLAC › MP3 320 › V0 › 256 › 192, com piso configurável e **inferência de bitrate** quando o peer não reporta.
- **Resiliência de download** — detecção de *stall* (peer parado) e **rotação automática** para a próxima melhor fonte (até 4 fontes).
- **Organização da biblioteca** — move/renomeia para `Artista/Álbum (ano)/NN Título.ext`, grava tags (ffmpeg), deduplica.
- **Player web embutido** — toque as faixas baixadas direto na interface (streaming com seek).
- **Tempo real** — progresso de downloads e log ao vivo via SSE.
- **Headless & leve** — 2 containers, SQLite (sem Postgres/Redis), fila durável embarcada. Roda 24/7 num RPi4.

---

## 🧱 Stack & arquitetura

Stack **ultraleve** — apenas **2 containers**:

| Container | Papel | RAM típica (RPi4) |
|---|---|---|
| `app` | API NestJS + workers + **fila durável em SQLite** + UI estática (SvelteKit) | ~150–350 MB |
| `slskd` | Cliente Soulseek headless (REST API) | ~80–200 MB |

Sem Postgres, sem Redis: toda a persistência é **um arquivo SQLite**; a fila de jobs é embarcada (sobrevive a restart).

```
Browser ──HTTP/SSE──► app (NestJS + SvelteKit estático + SQLite)
                        │
        ┌───────────────┼───────────────────────────┐
        ▼               ▼                             ▼
   Spotify Web API   slskd (REST)              Volume: MUSIC_PATH
   (metadados)       │  protocolo Soulseek      (biblioteca final)
                     ▼
                rede Soulseek
```

**Pipeline assíncrono:** `import → search → match → download → organize → biblioteca`.
Documentação completa em [`docs/`](#-documentação).

---

## 🚀 Quick start

> Requer **Docker** + **Docker Compose**. As imagens buildam nativo em `amd64` e `arm64` (Raspberry Pi OS 64-bit).

```bash
git clone https://github.com/thiagobucca/spotiseek.git
cd spotiseek

cp .env.example .env       # preencha segredos + Spotify + Soulseek + caminhos (veja abaixo)
docker compose up -d

# UI em http://localhost:8080  (login com ADMIN_EMAIL / ADMIN_PASSWORD)
```

Ou use o bootstrap (instala Docker se faltar, gera segredos, sobe a stack):

```bash
./scripts/install.sh
```

---

## ⚙️ Configuração (`.env`)

| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Assina tokens de sessão. `openssl rand -hex 32` |
| `APP_SECRET` | Cifra os tokens OAuth do Spotify em repouso. `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Conta admin criada no primeiro boot |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Do seu app em [developer.spotify.com](https://developer.spotify.com/dashboard) |
| `SPOTIFY_REDIRECT_URI` | Deve bater **exatamente** com o cadastrado no Spotify (ver nota abaixo) |
| `SOULSEEK_USERNAME` / `SOULSEEK_PASSWORD` | Conta na rede Soulseek (usada pelo slskd) |
| `SLSKD_API_KEY` | Chave interna app↔slskd. `openssl rand -hex 16` |
| `MUSIC_PATH` | **Onde sua biblioteca final fica** (bind mount no host) |
| `STAGING_PATH` | Área temporária de download (use o **mesmo disco** que `MUSIC_PATH`) |

### 🎯 Onde a música é salva

A música organizada vai para `MUSIC_PATH` (bind mount). Por padrão `./music` na pasta do projeto; aponte para onde quiser:

```bash
MUSIC_PATH=/home/pi/airdisk/Airdisk/Music
STAGING_PATH=/home/pi/airdisk/Airdisk/.spotiseek-staging   # mesmo disco = organização por "rename" rápido
```

O slskd baixa em `STAGING_PATH`; o app organiza (renomeia + tags + capa) movendo para `MUSIC_PATH`.

> **Permissões:** o container grava como root. Garanta que os caminhos existem e são graváveis. Se for exFAT/NTFS, monte com `uid=1000,gid=1000,umask=000` no `/etc/fstab`. Detalhes em [`docs/06`](docs/06-deploy-raspberry-pi.md).

---

## 🟢 Spotify — setup rápido

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app** → copie **Client ID** e **Client Secret**.
2. Em **Redirect URIs**, adicione exatamente o seu `SPOTIFY_REDIRECT_URI`.

> **Atenção (regra do Spotify):** redirect URIs só aceitam **HTTPS**, exceto o loopback **`http://127.0.0.1`**. Portanto:
> - **Playlists públicas** (import por URL) funcionam de qualquer lugar — não precisam de OAuth.
> - **Playlists privadas** (OAuth) precisam de `http://127.0.0.1:8080/...` (faça o login uma vez via túnel SSH no Pi headless) **ou** HTTPS (Tailscale/Caddy). Ver [`docs/09`](docs/09-riscos-alternativas.md).

---

## 🎧 Soulseek — setup

- Crie uma conta na rede Soulseek e preencha `SOULSEEK_USERNAME`/`SOULSEEK_PASSWORD`.
- **Compartilhamento desligado por padrão** (uso pessoal). A etiqueta da rede valoriza quem compartilha — para ativar, monte sua biblioteca read-only no slskd e habilite `shares` no [`docker/slskd.yml`](docker/slskd.yml) (instruções no arquivo).
- A REST API do slskd fica **só na rede interna** do compose (porta 5030 não publicada); apenas a porta P2P `50300` é exposta.

---

## 📖 Como usar

1. **Login** em `http://<host>:8080` (admin do `.env`).
2. **Conectar Spotify** em *Configurações* (para playlists privadas) — opcional para públicas.
3. **Playlists → Importar** → cole a URL de uma playlist do Spotify → as faixas entram catalogadas.
4. Abra a playlist e clique **Baixar** nas faixas desejadas (ou **Baixar todas**). Acompanhe em **Downloads** (progresso ao vivo).
5. **Wishlist** → adicione faixa/álbum/artista por texto → resolve e baixa automaticamente.
6. **Biblioteca** → navegue e **▶ toque** as faixas no player embutido.

Faixas sem fonte aparecem como **"Não encontrada"** com botão de tentar de novo (rotaciona por até 4 fontes, pulando peers mortos).

---

## 🗂️ Estrutura do projeto

```
spotiseek/
├── apps/
│   ├── api/                  # NestJS — API, workers, pipeline de jobs, providers, biblioteca
│   │   ├── src/
│   │   │   ├── spotify/      # OAuth + client-credentials + busca/resolução
│   │   │   ├── providers/    # ⭐ arquitetura plugável (SlskdProvider)
│   │   │   ├── matching/     # algoritmo de score + qualidade
│   │   │   ├── queue/        # fila durável embarcada (SQLite)
│   │   │   ├── jobs/         # import → search → match → download → organize
│   │   │   ├── library/      # organização, tags, capas, dedupe, streaming
│   │   │   └── ...           # auth, playlists, wishlist, downloads, dashboard, events(SSE)
│   │   └── prisma/           # schema SQLite + migrations
│   └── web/                  # SvelteKit (adapter-static) — UI Apple-minimalista + player
├── packages/shared/          # contrato tipado (DTOs/enums) compartilhado
├── docker/                   # Dockerfile multi-arch + slskd.yml
├── docs/                     # documentação de arquitetura (ver abaixo)
├── prototype/                # protótipo de UI (referência de design)
├── scripts/                  # install.sh, backup.sh
└── docker-compose.yml
```

---

## 🛠️ Desenvolvimento

```bash
npm install
npm run build:shared              # compila o pacote compartilhado primeiro

# backend (porta 8080)
npm run dev:api

# frontend standalone com mocks (porta 5173) — UI sem backend
PUBLIC_USE_MOCKS=true npm run dev:web
```

- Migrations: `npm run prisma:migrate -w @spotiseek/api`
- Build de tudo: `npm run build`

---

## 📚 Documentação

| Doc | Conteúdo |
|---|---|
| [01 — Arquitetura](docs/01-arquitetura.md) | Componentes, stack, estrutura de diretórios |
| [02 — Integração Soulseek](docs/02-soulseek.md) | Avaliação do slskd, abstração de provider, código |
| [03 — Modelo de dados](docs/03-modelo-dados.md) | Schema Prisma/SQLite |
| [04 — API REST](docs/04-api-rest.md) | Endpoints, contratos, SSE |
| [05 — Fluxos, jobs e matching](docs/05-fluxos-jobs-matching.md) | Pipeline, algoritmo de score, qualidade |
| [06 — Deploy & Raspberry Pi](docs/06-deploy-raspberry-pi.md) | Docker multi-arch, mapeamento de disco, otimizações |
| [07 — Roadmap, riscos, alternativas](docs/07-roadmap-riscos-alternativas.md) | Fases, MVP, escalabilidade, observabilidade |
| [09 — Limitações legais/operacionais](docs/09-riscos-alternativas.md) | ToS, ratio, copyright, quota Spotify |

---

## 📦 Footprint de recursos (Raspberry Pi 4)

- **< 1 GB RAM** em idle; teto de memória ~960 MB no compose.
- SQLite num único arquivo; staging→biblioteca por *rename* (sem cópia) quando no mesmo disco.
- Concorrência de download baixa por padrão (otimizado para SSD USB); busca com rate-limit (evita ban).

---

## 🗺️ Roadmap

- [ ] CI (GitHub Actions) publicando imagem multi-arch no GHCR
- [ ] "Importar todas as minhas playlists" (descoberta via conta Spotify)
- [ ] Lista de faixas tocáveis dentro da Biblioteca + "tocar álbum"
- [ ] Notificações (ntfy/Discord) em falhas
- [ ] Upgrade automático de qualidade (re-baixar FLAC quando aparecer)
- [ ] Métricas Prometheus (opcional)

---

## 📄 Licença

Uso pessoal. Veja o [aviso legal](#️-aviso-legal). Defina a licença do repositório conforme sua preferência.
