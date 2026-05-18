#!/usr/bin/env node
// PostToolUse:Edit|Write — when src/lib/**/*.ts is touched, run a quick
// project-wide `tsc --noEmit --skipLibCheck` to catch type drift early.
// Report only errors that mention the touched file; ignore unrelated noise.
// Async (configured in settings.json) so it doesn't block the agent.

'use strict'

const { execSync } = require('child_process')
const path = require('path')

const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    process.exit(0)
  }
  const filePath = (payload.tool_input && payload.tool_input.file_path) || ''
  if (!/\/src\/lib\/.+\.tsx?$/.test(filePath)) process.exit(0)

  const projectRoot = path.resolve(__dirname, '..', '..')
  const rel = path.relative(projectRoot, filePath)

  let output = ''
  try {
    execSync('npx --no-install tsc --noEmit --skipLibCheck', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
    console.log(`[tsc-lib] OK — ${rel} type-checks against the project.`)
    process.exit(0)
  } catch (e) {
    output = ((e.stdout || '') + (e.stderr || '')).toString()
  }

  const lines = output.split('\n')
  const relevant = lines.filter((l) => l.includes(rel) || /^src\//.test(l.trim()))
  if (relevant.length === 0) {
    console.log(`[tsc-lib] project has pre-existing tsc errors (not in ${rel}). Skipping noise.`)
    process.exit(0)
  }

  const sliced = relevant.slice(0, 15).join('\n')
  console.error(`[tsc-lib] tsc errors after editing ${rel}:\n${sliced}\n` + (relevant.length > 15 ? `… and ${relevant.length - 15} more lines` : ''))
  process.exit(2)
})
