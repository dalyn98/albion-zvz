import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const actionsDir = join(process.cwd(), 'src', 'app', 'actions')
const actionSources = readdirSync(actionsDir)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({
    name,
    source: readFileSync(join(actionsDir, name), 'utf8'),
  }))

describe('Server Action client-safety contract', () => {
  it('never returns raw Error or provider messages directly', () => {
    const violations = actionSources.flatMap(({ name, source }) =>
      source.split('\n').flatMap((line, index) => {
        const exposesMessageInClientField =
          /(?:error|fatalError|membersError|guestsError|withdrawnError|rosterError|reason):\s*(?:[A-Za-z_$][\w$]*\s+instanceof[^?]+\?\s*)?[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.message/.test(
            line,
          )
        const passesMessageToPreview =
          /previewError\([^)\n]*\.message/.test(line)
        const returnsMessageProperty =
          /^\s*return\s+[A-Za-z_$][\w$]*\??\.message\b/.test(line)
        const returnsTaintedAlias =
          /return\s+\{\s*(?:error|fatalError):\s*(?:msg|message|writeErr)\s*[,}]/.test(
            line,
          )
        const returnsProviderMessage = /^\s*return\s+(?:msg|message|writeErr)\s*$/.test(line)
        return exposesMessageInClientField ||
          passesMessageToPreview ||
          returnsMessageProperty ||
          returnsTaintedAlias ||
          returnsProviderMessage
          ? [`${name}:${index + 1}`]
          : []
      }),
    )

    expect(violations).toEqual([])
  })

  it('localizes shared authorization, validation, and server failures', () => {
    const violations = actionSources.flatMap(({ name, source }) =>
      source
        .split('\n')
        .flatMap((line, index) =>
          /error:\s*['"](?:Unauthorized|Invalid input|Server error)['"]/.test(line)
            ? [`${name}:${index + 1}`]
            : [],
        ),
    )

    expect(violations).toEqual([])
  })

  it('always releases manually controlled loading state', () => {
    const componentsDir = join(process.cwd(), 'src', 'components')
    const violations = readdirSync(componentsDir)
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) => {
        const source = readFileSync(join(componentsDir, name), 'utf8')
        return /set(?:Loading|Saving)\(true\)/.test(source) && !source.includes('finally')
      })

    expect(violations).toEqual([])
  })
})
