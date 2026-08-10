#!/usr/bin/env bash
set -euo pipefail

locale="${1:-}"
kind="${2:-messages}"
case "$locale" in
  en) target_language="en" ;;
  ja) target_language="ja" ;;
  zh) target_language="zh-CN" ;;
  zh-Hant) target_language="zh-TW" ;;
  fr) target_language="fr" ;;
  de) target_language="de" ;;
  es-ES) target_language="es-ES" ;;
  es-419) target_language="es-419" ;;
  pt-BR) target_language="pt-BR" ;;
  pt-PT) target_language="pt-PT" ;;
  pl) target_language="pl" ;;
  ru) target_language="ru" ;;
  it) target_language="it" ;;
  id) target_language="id" ;;
  ar) target_language="ar" ;;
  tr) target_language="tr" ;;
  *)
    echo "Usage: $0 <en|ja|zh|zh-Hant|fr|de|es-ES|es-419|pt-BR|pt-PT|pl|ru|it|id|ar|tr> [messages|discord|docs]" >&2
    exit 2
    ;;
esac

if [[ "$kind" != "messages" && "$kind" != "discord" && "$kind" != "docs" ]]; then
  echo "Translation kind must be 'messages', 'discord', or 'docs'." >&2
  exit 2
fi
if [[ "$kind" == "discord" && "$locale" == "zh-Hant" ]]; then
  echo "Discord zh-TW command copy is already maintained in the built-in Traditional Chinese catalog." >&2
  exit 2
fi
if [[ "$kind" == "discord" && ( "$locale" == "ar" || "$locale" == "pt-PT" ) ]]; then
  echo "Discord does not expose a separate command locale for $locale." >&2
  exit 2
fi
if [[ "$kind" != "docs" && ( "$locale" == "en" || "$locale" == "ja" || "$locale" == "zh" ) ]]; then
  echo "$kind translation is not generated for the existing $locale catalog." >&2
  exit 2
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
app_dir="/tmp/AGMMessageTranslator.app"
source_language="en"
if [[ "$kind" == "messages" ]]; then
  job_script="$script_dir/message-translation-job.mjs"
  job_prefix="/tmp/agm-message-translation-$locale"
elif [[ "$kind" == "discord" ]]; then
  job_script="$script_dir/discord-command-translation-job.mjs"
  job_prefix="/tmp/agm-discord-command-translation-$locale"
else
  if [[ "$locale" == "en" ]]; then
    source_language="ko"
  else
    source_language="en"
  fi
  job_script="$script_dir/docs-translation-job.mjs"
  job_prefix="/tmp/agm-docs-translation-$locale"
fi

node "$job_script" prepare "$locale"
mkdir -p "$app_dir/Contents/MacOS"
cp "$script_dir/apple-message-translator-Info.plist" "$app_dir/Contents/Info.plist"
swiftc -parse-as-library \
  "$script_dir/apple-message-translator.swift" \
  -o "$app_dir/Contents/MacOS/AGMMessageTranslator" \
  -framework SwiftUI \
  -framework Translation

rm -f "$job_prefix-result.json" "$job_prefix-error.txt"
open -n "$app_dir" --args \
  --source "$source_language" \
  --target "$target_language" \
  --input "$job_prefix-job.json" \
  --output "$job_prefix-result.json" \
  --error "$job_prefix-error.txt"

# macOS may remember that the transient SwiftUI window was closed after a
# previous run and launch the app with no WindowGroup. Re-open it when UI
# automation is available; otherwise the app remains visible for manual use.
sleep 1
osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
tell application "AGMMessageTranslator" to activate
delay 0.5
tell application "System Events"
  tell process "AGMMessageTranslator"
    if (count of windows) is 0 then
      click menu item "New AGM Message Translator Window" of menu 1 of menu bar item "File" of menu bar 1
    end if
  end tell
end tell
APPLESCRIPT

echo "$kind translation started for $locale."
echo "Result: $job_prefix-result.json"
echo "Error:  $job_prefix-error.txt"
echo "After completion: node $job_script apply $locale"
