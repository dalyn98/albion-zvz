#!/usr/bin/env node
// PreToolUse:Edit|Write — block writes that look like they contain raw secrets.
// Stdin: JSON { tool_name, tool_input: { file_path, new_string?, content? } }
// Exit 2 with stderr → blocks the write.

'use strict'

const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    process.exit(0)
  }
  const input = payload.tool_input || {}
  const text = [input.new_string, input.content].filter((v) => typeof v === 'string').join('\n')
  if (!text) process.exit(0)

  const patterns = [
    { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
    { name: 'OpenAI key', re: /sk-(?:proj-)?[A-Za-z0-9]{20,}/ },
    { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
    { name: 'GitHub PAT', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
    { name: 'Supabase service role', re: /eyJhbGciOi[A-Za-z0-9_.-]{60,}/ },
    { name: 'PEM private key', re: /-----BEGIN (?:RSA|EC|OPENSSH|PGP|ENCRYPTED) PRIVATE KEY-----/ },
    { name: 'Slack token', re: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
    { name: 'Hardcoded password assignment', re: /\b(?:password|passwd|pwd)\s*[:=]\s*["'][^"'$\s{][^"'\n]{6,}["']/i },
  ]

  const hits = []
  for (const p of patterns) {
    const m = text.match(p.re)
    if (m) hits.push(`${p.name}: ${m[0].slice(0, 24)}…`)
  }

  if (hits.length === 0) process.exit(0)

  const filePath = input.file_path || '(unknown file)'
  console.error(
    `[secrets-scan] BLOCKED — write to ${filePath} matched ${hits.length} secret pattern(s):\n` +
      hits.map((h) => '  • ' + h).join('\n') +
      '\n→ Move secret to env var (.env.local / process.env.X), use placeholder in code, or rotate if already committed.'
  )
  process.exit(2)
})
