#!/usr/bin/env bash
# Albion ZvZ 백업 cron (launchd) 설치/제거 스크립트.
#
# 설치:   ./scripts/install-backup-cron.sh install
# 제거:   ./scripts/install-backup-cron.sh uninstall
# 상태:   ./scripts/install-backup-cron.sh status
# 즉시:   ./scripts/install-backup-cron.sh trigger   (한 번 실행, 디버그 용)

set -euo pipefail

ACTION="${1:-status}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.albion-zvz.backup"
PLIST_SRC="$PROJECT_DIR/scripts/${LABEL}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${LABEL}.plist"

case "$ACTION" in
  install)
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    launchctl load -w "$PLIST_DST"
    echo "[install] $LABEL 등록 완료. 매일 03:00 KST 실행."
    echo "[install] 로그: ~/backups/albion-zvz/cron.log"
    ;;
  uninstall)
    if [ -f "$PLIST_DST" ]; then
      launchctl unload "$PLIST_DST" 2>/dev/null || true
      rm -f "$PLIST_DST"
      echo "[uninstall] $LABEL 제거됨."
    else
      echo "[uninstall] 등록된 plist 없음 ($PLIST_DST)"
    fi
    ;;
  status)
    if launchctl list | grep -q "$LABEL"; then
      echo "[status] $LABEL 실행 등록 상태:"
      launchctl list | grep "$LABEL"
      echo ""
      echo "마지막 백업:"
      ls -lh "$HOME/backups/albion-zvz/daily/" 2>/dev/null | tail -3
    else
      echo "[status] $LABEL 미등록. install 로 등록하세요."
    fi
    ;;
  trigger)
    if [ ! -f "$PLIST_DST" ]; then
      echo "ERROR: plist 미설치. 먼저 install 실행." >&2
      exit 1
    fi
    launchctl kickstart -p "gui/$(id -u)/$LABEL"
    echo "[trigger] 즉시 실행 요청. 로그 확인: tail -f ~/backups/albion-zvz/cron.log"
    ;;
  *)
    echo "Usage: $0 {install|uninstall|status|trigger}" >&2
    exit 1
    ;;
esac
