#!/usr/bin/env bash
# Albion ZvZ Supabase 백업 스크립트.
#
# 사용법:
#   ./scripts/backup-db.sh                        # ~/backups/albion-zvz/daily/<TS>.tar.gz
#   ./scripts/backup-db.sh pre-migration mig135   # pre-migration 폴더, 라벨 부착
#
# 묶음 내용: roles.sql + schema.sql + data.sql.gz (3-step pg_dump)
# 메커니즘: `supabase db dump --linked --dry-run` 이 출력하는 pg_dump 파이프라인을
# 그대로 bash 에 흘려보내 로컬 pg_dump 로 실행. Docker 의존 회피 + Supabase 가
# 추천하는 sed 정리 그대로 적용.
# 인증: .env.local 의 SUPABASE_ACCESS_TOKEN 자동 로드.

set -euo pipefail

KIND="${1:-daily}"
LABEL="${2:-}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/albion-zvz}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
TARGET_DIR="$BACKUP_ROOT/$KIND"
NAME="$TIMESTAMP${LABEL:+-$LABEL}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 시스템 pg_dump (libpq, brew install libpq) 가 PATH 에 들어가야 한다.
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:$PATH"

if [ -f "$PROJECT_DIR/.env.local" ] && [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  TOKEN_LINE="$(grep '^SUPABASE_ACCESS_TOKEN=' "$PROJECT_DIR/.env.local" || true)"
  if [ -n "$TOKEN_LINE" ]; then
    export SUPABASE_ACCESS_TOKEN="${TOKEN_LINE#SUPABASE_ACCESS_TOKEN=}"
  fi
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  if ! supabase projects list >/dev/null 2>&1; then
    echo "ERROR: SUPABASE_ACCESS_TOKEN not set and Supabase CLI login is unavailable" >&2
    exit 1
  fi
fi

if ! command -v pg_dump >/dev/null; then
  echo "ERROR: pg_dump not found. brew install libpq" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cd "$PROJECT_DIR"

echo "[backup] $NAME 시작 → $TARGET_DIR"

dump_step() {
  local label="$1"; shift
  local out="$TMP_DIR/$1"; shift
  local -a flags=("$@")
  echo "  · $label"
  # --dry-run 출력은 매 호출마다 새 임시 cli_login 자격증명을 발급하므로 즉시 실행
  if ! supabase db dump --linked --dry-run ${flags[@]+"${flags[@]}"} 2>/dev/null | bash > "$out"; then
    echo "ERROR: $label dump 실패" >&2
    exit 1
  fi
  if [ ! -s "$out" ]; then
    echo "ERROR: $label dump 결과가 비어 있음" >&2
    exit 1
  fi
}

dump_step "roles"  roles.sql  --role-only
dump_step "schema" schema.sql

# 데이터 덤프는 수 GB까지 커질 수 있다. 평문 data.sql을 디스크에 먼저
# 저장하면 압축본을 만들 여유 공간까지 필요하므로 생성 즉시 gzip으로 압축한다.
# 복원할 때는 gzip -dc data.sql.gz | psql "$DATABASE_URL" 을 사용한다.
DATA_ARCHIVE="$TMP_DIR/data.sql.gz"
ARCHIVE="$TARGET_DIR/$NAME.tar.gz"
ARCHIVE_TMP="$TARGET_DIR/.$NAME.tar.gz.tmp"

echo "  · data"
if ! supabase db dump --linked --dry-run --data-only --use-copy 2>/dev/null \
  | bash \
  | gzip -c > "$DATA_ARCHIVE"; then
  echo "ERROR: data dump 실패" >&2
  exit 1
fi
if [ ! -s "$DATA_ARCHIVE" ] || ! gzip -t "$DATA_ARCHIVE"; then
  echo "ERROR: data dump 압축 결과가 유효하지 않음" >&2
  exit 1
fi

if ! COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE_TMP" \
  -C "$TMP_DIR" roles.sql schema.sql data.sql.gz; then
  rm -f "$ARCHIVE_TMP"
  echo "ERROR: backup archive 생성 실패" >&2
  exit 1
fi

mv "$ARCHIVE_TMP" "$ARCHIVE"
chmod 600 "$ARCHIVE"

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
echo "[backup] 완료: $ARCHIVE ($SIZE)"

# Rotation
case "$KIND" in
  daily)
    find "$TARGET_DIR" -name '*.tar.gz' -mtime +30 -delete 2>/dev/null || true
    ;;
  pre-migration)
    # shellcheck disable=SC2012
    ls -t "$TARGET_DIR"/*.tar.gz 2>/dev/null | tail -n +51 | xargs -I{} rm -f {} 2>/dev/null || true
    ;;
esac
