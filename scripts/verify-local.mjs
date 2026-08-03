#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const STEPS = [
  ['typecheck', ['run', 'typecheck']],
  ['lint', ['run', 'lint']],
  ['coverage', ['run', 'test:coverage']],
  ['integration', ['run', 'test:integration:required']],
  ['build', ['run', 'build']],
]

function runNpm(args) {
  return new Promise((resolveRun) => {
    const child = spawn('npm', args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
    child.on('error', () => resolveRun(1))
    child.on('close', (code) => resolveRun(code ?? 1))
  })
}

export async function runLocalVerification(steps = STEPS) {
  for (const [label, args] of steps) {
    process.stdout.write(`[verify-local] ${label}\n`)
    const code = await runNpm(args)
    if (code !== 0) return { passed: false, failedStep: label }
  }
  return { passed: true, failedStep: null }
}

async function main() {
  const result = await runLocalVerification()
  if (!result.passed) {
    process.stderr.write(`[verify-local] failed: ${result.failedStep}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('[verify-local] all required checks passed\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
