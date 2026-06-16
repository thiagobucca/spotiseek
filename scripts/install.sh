#!/usr/bin/env bash
#
# Spotiseek — bootstrap para host Raspberry Pi (ou qualquer Linux amd64/arm64).
#
# Idempotente: pode ser rodado várias vezes com segurança.
#   - Instala o Docker se faltar.
#   - Cria .env a partir de .env.example se ausente.
#   - Gera segredos faltantes (JWT_SECRET, APP_SECRET, SLSKD_API_KEY).
#   - Sobe a stack (docker compose pull && up -d).
#   - Imprime a URL de acesso na LAN.
#
# Uso:  ./scripts/install.sh
set -euo pipefail

# Raiz do repo = diretório pai deste script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------------------------
# 1. Docker
# ---------------------------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker não encontrado — instalando via get.docker.com (precisa de sudo)..."
  curl -fsSL https://get.docker.com | sh
  # Permite usar docker sem sudo na próxima sessão.
  if [ -n "${SUDO_USER:-${USER:-}}" ]; then
    sudo usermod -aG docker "${SUDO_USER:-$USER}" || true
    warn "Usuário adicionado ao grupo 'docker'. Talvez seja preciso relogar para valer."
  fi
else
  log "Docker já instalado: $(docker --version)"
fi

# Sanidade do plugin compose v2.
if ! docker compose version >/dev/null 2>&1; then
  warn "'docker compose' (v2) não disponível. Atualize o Docker (Compose v2 é parte do Docker moderno)."
  exit 1
fi

# ---------------------------------------------------------------------------------------------
# 2. .env
# ---------------------------------------------------------------------------------------------
if [ ! -f .env ]; then
  log "Criando .env a partir de .env.example"
  cp .env.example .env
fi

# ---------------------------------------------------------------------------------------------
# 3. Gera segredos faltantes (apenas chaves vazias do tipo NOME=)
# ---------------------------------------------------------------------------------------------
gen_secret() {
  local key="$1"
  # Casa "KEY=" (valor vazio) no início da linha.
  if grep -qE "^${key}=$" .env; then
    local val
    val="$(openssl rand -hex 32)"
    # Delimitador '|' evita conflito com '/' do valor hex (hex não tem '|').
    sed -i.bak -E "s|^${key}=$|${key}=${val}|" .env
    rm -f .env.bak
    log "Gerado ${key}"
  fi
}

gen_secret JWT_SECRET
gen_secret APP_SECRET
gen_secret SLSKD_API_KEY

# ---------------------------------------------------------------------------------------------
# 4. Checagem de credenciais que SÓ o operador pode preencher
# ---------------------------------------------------------------------------------------------
MISSING=()
for key in SPOTIFY_CLIENT_ID SPOTIFY_CLIENT_SECRET SOULSEEK_USERNAME SOULSEEK_PASSWORD ADMIN_PASSWORD; do
  if grep -qE "^${key}=$" .env; then
    MISSING+=("${key}")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  warn "As seguintes variáveis em .env ainda estão vazias e PRECISAM ser preenchidas:"
  for k in "${MISSING[@]}"; do printf '      - %s\n' "$k"; done
  warn "Edite .env (ver comentários no arquivo) e rode novamente: ./scripts/install.sh"
  exit 1
fi

# ---------------------------------------------------------------------------------------------
# 5. Sobe a stack
# ---------------------------------------------------------------------------------------------
log "Baixando/atualizando imagens..."
docker compose pull

log "Subindo a stack (build do app + slskd)..."
docker compose up -d --build

# ---------------------------------------------------------------------------------------------
# 6. URL de acesso
# ---------------------------------------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
IP="${IP:-localhost}"
log "Pronto! Spotiseek disponível em: http://${IP}:8080"
log "Acompanhe os logs com:  docker compose logs -f app"
