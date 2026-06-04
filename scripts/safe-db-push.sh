#!/usr/bin/env bash
# 마이그 적용 직전에 백업을 만든 뒤 supabase db push --linked 를 실행한다.
# Claude (또는 사람) 가 마이그 적용할 때 항상 이 스크립트를 거치도록 한다.
#
# 사용법:
#   ./scripts/safe-db-push.sh              # 라벨 없이 백업 후 push
#   ./scripts/safe-db-push.sh mig135       # 라벨 "mig135" 로 백업
#   SAFE_DB_PUSH_INCLUDE_ALL=1 ./scripts/safe-db-push.sh mig195
#                                           # 원격에 중간 no-op gap 이 있을 때 include-all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="${1:-pre-push}"

echo "[safe-db-push] 마이그 직전 백업 생성... (label=$LABEL)"
"$SCRIPT_DIR/backup-db.sh" pre-migration "$LABEL"

echo ""
push_args=(db push --linked)
if [[ "${SAFE_DB_PUSH_INCLUDE_ALL:-0}" == "1" ]]; then
  push_args+=(--include-all)
fi

echo "[safe-db-push] supabase ${push_args[*]} 실행..."
cd "$PROJECT_DIR"
supabase "${push_args[@]}"
