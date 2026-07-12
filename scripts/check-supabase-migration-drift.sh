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

supabase "${list_args[@]}" --output-format json | tee "$tmp_file"

set +e
analysis="$(
  node - "$tmp_file" <<'NODE'
const { readFileSync } = require('node:fs')

const raw = readFileSync(process.argv[2], 'utf8').trim()
if (!raw.startsWith('{') && !raw.startsWith('[')) {
  process.exit(2)
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch {
  process.exit(2)
}

const rows = Array.isArray(parsed) ? parsed : parsed.migrations
if (!Array.isArray(rows)) {
  process.exit(2)
}

const isVersion = (value) => typeof value === 'string' && /^\d{3}$/.test(value)
const localVersions = new Set()
const remoteVersions = new Set()
const rowMismatches = new Set()

for (const row of rows) {
  if (!row || typeof row !== 'object') continue
  const local = row.local
  const remote = row.remote
  if (!isVersion(local) && !isVersion(remote)) continue
  if (isVersion(local)) localVersions.add(local)
  if (isVersion(remote)) remoteVersions.add(remote)
  if (isVersion(local) && isVersion(remote) && local !== remote) {
    rowMismatches.add(`${local}|${remote}`)
  }
}

if (localVersions.size === 0 && remoteVersions.size === 0) {
  process.exit(2)
}

const latest = [...localVersions, ...remoteVersions].sort().at(-1) ?? '<none>'
console.log(
  `[check-supabase-migration-drift] parsed migrations: local=${localVersions.size} remote=${remoteVersions.size} latest=${latest}`,
)

let driftCount = 0
for (let number = 0; number <= 999; number += 1) {
  const version = String(number).padStart(3, '0')
  if (localVersions.has(version) && !remoteVersions.has(version)) {
    driftCount += 1
    console.log(`local-only migration ${version} (apply it with ./scripts/safe-db-push.sh <label> before pushing main)`)
  }
  if (!localVersions.has(version) && remoteVersions.has(version)) {
    driftCount += 1
    console.log(`remote-only migration ${version} (recover the missing migration file before pushing main)`)
  }
}
for (const mismatch of rowMismatches) {
  driftCount += 1
  const [local, remote] = mismatch.split('|')
  console.log(`mismatched migration row local=${local} remote=${remote}`)
}

if (driftCount > 0) {
  process.exit(1)
}
NODE
)"
analysis_status=$?

if [[ $analysis_status -eq 2 ]]; then
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
fi
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
