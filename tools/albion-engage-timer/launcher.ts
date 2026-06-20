import scriptText from './AlbionEngageTimer.ps1' with { type: 'text' }

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APP_NAME = 'AlbionEngageTimer'

function getRuntimeDir(): string {
  const root = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? process.cwd()
  return join(root, APP_NAME, 'runtime')
}

function writeLauncherLog(message: string): void {
  try {
    const runtimeDir = getRuntimeDir()
    if (!existsSync(runtimeDir)) {
      mkdirSync(runtimeDir, { recursive: true })
    }

    const line = `${new Date().toISOString()} ${message}\n`
    writeFileSync(join(runtimeDir, 'launcher.log'), line, { encoding: 'utf8', flag: 'a' })
  } catch {
    // A failed log write should not block startup.
  }
}

function main(): void {
  const runtimeDir = getRuntimeDir()
  if (!existsSync(runtimeDir)) {
    mkdirSync(runtimeDir, { recursive: true })
  }

  const scriptPath = join(runtimeDir, 'AlbionEngageTimer.ps1')
  writeFileSync(scriptPath, scriptText, { encoding: 'utf8' })

  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-STA',
      '-WindowStyle',
      'Hidden',
      '-File',
      scriptPath,
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  )

  child.on('error', (error) => {
    writeLauncherLog(`Failed to start powershell.exe: ${error.message}`)
  })

  child.unref()
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  writeLauncherLog(`Fatal launcher error: ${message}`)
  process.exitCode = 1
}
