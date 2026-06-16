#!/usr/bin/env bash
#
# Spotiseek — backup da stack ULTRALIGHT.
#
# Empacota num único .tar.gz:
#   - volume app-data (contém o SQLite /data/spotiseek.db — toda a persistência da app)
#   - configs do slskd (./docker/slskd.yml)
#   - o .env (credenciais — guarde o backup em local seguro!)
#
# NÃO faz backup da biblioteca /music nem de /downloads (são grandes e recuperáveis).
#
# Uso:  ./scripts/backup.sh [diretório-destino]   (default: ./backups)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

PROJECT="spotiseek"
DEST_DIR="${1:-${REPO_DIR}/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${DEST_DIR}/spotiseek-backup-${STAMP}.tar.gz"

mkdir -p "${DEST_DIR}"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# Nome real do volume criado pelo compose: <project>_<volume>.
APP_DATA_VOLUME="${PROJECT}_app-data"

if ! docker volume inspect "${APP_DATA_VOLUME}" >/dev/null 2>&1; then
  echo "Volume ${APP_DATA_VOLUME} não encontrado. A stack já foi iniciada (docker compose up -d)?" >&2
  exit 1
fi

# Diretório temporário para juntar tudo num só tarball.
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

log "Exportando volume app-data (SQLite + estado da app)..."
# Container efêmero monta o volume e o app empacota seu conteúdo.
docker run --rm \
  -v "${APP_DATA_VOLUME}":/data:ro \
  -v "${WORK}":/backup \
  alpine:3.20 \
  sh -c "cd /data && tar czf /backup/app-data.tar.gz ."

log "Copiando configs e .env..."
mkdir -p "${WORK}/config"
[ -f docker/slskd.yml ] && cp docker/slskd.yml "${WORK}/config/slskd.yml"
[ -f docker-compose.yml ] && cp docker-compose.yml "${WORK}/config/docker-compose.yml"
[ -f .env ] && cp .env "${WORK}/config/.env"

log "Gerando ${OUT}..."
tar czf "${OUT}" -C "${WORK}" .

log "Backup concluído: ${OUT}"
log "Restaurar app-data:  docker run --rm -v ${APP_DATA_VOLUME}:/data -v \$(pwd):/backup alpine:3.20 sh -c 'cd /data && tar xzf /backup/app-data.tar.gz'"
