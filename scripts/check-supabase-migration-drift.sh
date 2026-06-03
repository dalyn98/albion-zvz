#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

if ! command -v supabase >/dev/null 2>&1; then
  echo "::error::supabase CLI is required for the remote migration drift check"
  exit 1
fi

if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  link_args=(link --project-ref "$SUPABASE_PROJECT_REF" --yes)
  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    link_args+=(--password "$SUPABASE_DB_PASSWORD")
  fi
  supabase "${link_args[@]}" >/dev/null
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

list_args=(migration list --linked)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  list_args+=(--password "$SUPABASE_DB_PASSWORD")
fi

supabase "${list_args[@]}" | tee "$tmp_file"

set +e
analysis="$(
  awk -F'|' '
    BEGIN {
      drift_count = 0
      local_count = 0
      parsed_rows = 0
      remote_count = 0
    }
    function trim(value) {
      gsub(/^[ \t]+|[ \t]+$/, "", value)
      return value
    }
    function is_version(value) {
      return value ~ /^[0-9][0-9][0-9]$/
    }
    {
      local = trim($1)
      remote = trim($2)
      if (!is_version(local) && !is_version(remote)) {
        next
      }

      parsed_rows++
      if (is_version(local)) {
        local_versions[local] = 1
      }
      if (is_version(remote)) {
        remote_versions[remote] = 1
      }
      if (is_version(local) && is_version(remote) && local != remote) {
        row_mismatches[local "|" remote] = 1
      }
    }
    END {
      if (parsed_rows == 0) {
        print "::error::Unable to parse Supabase migration list output"
        print "Expected pipe-delimited rows with three-digit Local and Remote migration versions."
        exit 2
      }

      for (number = 0; number <= 999; number++) {
        version = sprintf("%03d", number)
        if (version in local_versions) {
          local_count++
          local_latest = version
        }
        if (version in remote_versions) {
          remote_count++
          remote_latest = version
        }
      }

      latest = local_latest
      if (latest == "" || (remote_latest != "" && remote_latest + 0 > latest + 0)) {
        latest = remote_latest
      }
      if (latest == "") {
        latest = "<none>"
      }

      print "[check-supabase-migration-drift] parsed migrations: local=" local_count " remote=" remote_count " latest=" latest

      for (number = 0; number <= 999; number++) {
        version = sprintf("%03d", number)
        if ((version in local_versions) && !(version in remote_versions)) {
          drift_count++
          print "local-only migration " version " (apply it with ./scripts/safe-db-push.sh <label> before pushing main)"
        }
        if (!(version in local_versions) && (version in remote_versions)) {
          drift_count++
          print "remote-only migration " version " (recover the missing migration file before pushing main)"
        }
      }

      for (key in row_mismatches) {
        split(key, parts, "|")
        drift_count++
        print "mismatched migration row local=" parts[1] " remote=" parts[2]
      }

      if (drift_count > 0) {
        exit 1
      }
    }
  ' "$tmp_file"
)"
analysis_status=$?
set -e

if [[ $analysis_status -eq 2 ]]; then
  printf '%s\n' "$analysis"
  exit 1
fi

if [[ $analysis_status -ne 0 ]]; then
  echo "::error::Supabase migration drift detected"
  printf '%s\n' "$analysis"
  exit 1
fi

printf '%s\n' "$analysis"
echo "[check-supabase-migration-drift] local and remote migrations match"
