#!/usr/bin/env bash
# Albion ZvZ Supabase 백업 스크립트.
#
# 사용법:
#   ./scripts/backup-db.sh                        # ~/backups/albion-zvz/daily/<TS>.tar.gz
#   ./scripts/backup-db.sh pre-migration mig135   # pre-migration 폴더, 라벨 부착
#
# 묶음 내용: roles.sql + schema.sql + data.sql (3-step pg_dump)
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
dump_step "data"   data.sql   --data-only --use-copy

tar -czf "$TARGET_DIR/$NAME.tar.gz" -C "$TMP_DIR" roles.sql schema.sql data.sql
chmod 600 "$TARGET_DIR/$NAME.tar.gz"

SIZE="$(du -h "$TARGET_DIR/$NAME.tar.gz" | cut -f1)"
echo "[backup] 완료: $TARGET_DIR/$NAME.tar.gz ($SIZE)"

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
