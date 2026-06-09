import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import koMessages from '@/messages/ko.json'

const SOURCE_ROOTS = ['src/app', 'src/components', 'src/lib'] as const

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(file, out)
      continue
    }
    if (/\.(test|integration)\.tsx?$/.test(entry.name)) continue
    if (/\.(ts|tsx)$/.test(entry.name)) out.push(file)
  }
  return out
}

function flattenMessages(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenMessages(child, prefix ? `${prefix}.${key}` : key),
  )
}

function placeholderVars(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const vars = new Set<string>()

  function visit(elements: readonly MessageFormatElement[]): void {
    for (const element of elements) {
      if (
        element.type === TYPE.argument ||
        element.type === TYPE.number ||
        element.type === TYPE.date ||
        element.type === TYPE.time ||
        element.type === TYPE.select ||
        element.type === TYPE.plural
      ) {
        vars.add(element.value)
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        Object.values(element.options).forEach((option) => visit(option.value))
      }
      if (element.type === TYPE.tag) visit(element.children)
    }
  }

  visit(parse(value))
  return [...vars].sort()
}

function parseSource(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function isStringLike(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function namespaceFromCall(call: ts.CallExpression): string | null {
  const [arg] = call.arguments
  if (!arg) return ''
  if (isStringLike(arg)) return arg.text
  if (!ts.isObjectLiteralExpression(arg)) return null
  for (const prop of arg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'namespace' &&
      isStringLike(prop.initializer)
    ) {
      return prop.initializer.text
    }
  }
  return null
}

function unwrapAwait(expression: ts.Expression): ts.Expression {
  return ts.isAwaitExpression(expression) ? expression.expression : expression
}

function namespaceFromInitializer(initializer: ts.Expression | undefined): string | null | undefined {
  if (!initializer) return undefined
  const expression = unwrapAwait(initializer)
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return undefined
  if (expression.expression.text !== 'useTranslations' && expression.expression.text !== 'getTranslations') {
    return undefined
  }
  return namespaceFromCall(expression)
}

function promiseAllElements(expression: ts.Expression): readonly ts.Expression[] | null {
  const unwrapped = unwrapAwait(expression)
  if (!ts.isCallExpression(unwrapped) || unwrapped.expression.getText() !== 'Promise.all') return null
  const [arg] = unwrapped.arguments
  return arg && ts.isArrayLiteralExpression(arg) ? arg.elements : null
}

function typeNamespace(typeNode: ts.TypeNode | undefined, aliases: Map<string, string>): string | undefined {
  if (!typeNode) return undefined
  const direct = typeNode.getText().match(/getTranslations\s*<\s*['"]([^'"]+)['"]\s*>/)
  if (direct) return direct[1]
  if (!ts.isTypeReferenceNode(typeNode)) return undefined
  return aliases.get(typeNode.typeName.getText())
}

function collectValueKeys(arg: ts.Expression | undefined): { keys: Set<string>; hasSpread: boolean; invalid: boolean } {
  if (!arg) return { keys: new Set(), hasSpread: false, invalid: false }
  if (!ts.isObjectLiteralExpression(arg)) return { keys: new Set(), hasSpread: false, invalid: true }
  const keys = new Set<string>()
  let hasSpread = false
  for (const prop of arg.properties) {
    if (ts.isSpreadAssignment(prop)) {
      hasSpread = true
      continue
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      keys.add(prop.name.text)
      continue
    }
    if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
      if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) keys.add(prop.name.text)
    }
  }
  return { keys, hasSpread, invalid: false }
}

function location(sourceFile: ts.SourceFile, node: ts.Node): string {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${sourceFile.fileName.replace(`${process.cwd()}/`, '')}:${pos.line + 1}:${pos.character + 1}`
}

describe('i18n callsites', () => {
  it('passes values for placeholders on statically-known translation calls', () => {
    const messages = new Map(flattenMessages(koMessages))
    const offenders: string[] = []

    for (const filePath of SOURCE_ROOTS.flatMap((root) => walkTsFiles(join(process.cwd(), root)))) {
      const sourceFile = parseSource(filePath)
      const aliases = new Map<string, string>()
      const scopes: Array<Map<string, string>> = [new Map()]

      function setTranslator(name: string, namespace: string | null | undefined): void {
        if (namespace == null) return
        scopes[scopes.length - 1].set(name, namespace)
      }

      function lookupTranslator(name: string): string | undefined {
        for (let i = scopes.length - 1; i >= 0; i -= 1) {
          const namespace = scopes[i].get(name)
          if (namespace !== undefined) return namespace
        }
        return undefined
      }

      function collectAliases(node: ts.Node): void {
        if (ts.isTypeAliasDeclaration(node)) {
          const namespace = typeNamespace(node.type, aliases)
          if (namespace) aliases.set(node.name.text, namespace)
        }
        ts.forEachChild(node, collectAliases)
      }

      function bindParam(param: ts.ParameterDeclaration): void {
        if (ts.isIdentifier(param.name)) {
          setTranslator(param.name.text, typeNamespace(param.type, aliases))
          return
        }
        if (!ts.isObjectBindingPattern(param.name) || !param.type || !ts.isTypeLiteralNode(param.type)) return
        const propTypes = new Map<string, string>()
        for (const member of param.type.members) {
          if (
            ts.isPropertySignature(member) &&
            member.type &&
            member.name &&
            (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
          ) {
            const namespace = typeNamespace(member.type, aliases)
            if (namespace) propTypes.set(member.name.text, namespace)
          }
        }
        for (const element of param.name.elements) {
          if (!ts.isIdentifier(element.name)) continue
          const propName =
            element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
              ? element.propertyName.text
              : element.name.text
          setTranslator(element.name.text, propTypes.get(propName))
        }
      }

      function visit(node: ts.Node): void {
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
          scopes.push(new Map())
          for (const param of node.parameters) bindParam(param)
          ts.forEachChild(node, visit)
          scopes.pop()
          return
        }

        if (ts.isVariableDeclaration(node)) {
          if (ts.isIdentifier(node.name)) {
            setTranslator(node.name.text, namespaceFromInitializer(node.initializer))
            setTranslator(node.name.text, typeNamespace(node.type, aliases))
          } else if (ts.isArrayBindingPattern(node.name) && node.initializer) {
            const elements = promiseAllElements(node.initializer)
            if (elements) {
              node.name.elements.forEach((binding, index) => {
                if (!ts.isBindingElement(binding) || !ts.isIdentifier(binding.name)) return
                setTranslator(binding.name.text, namespaceFromInitializer(elements[index]))
              })
            }
          }
        }

        if (ts.isCallExpression(node)) {
          const expression = node.expression
          const translatorName = ts.isIdentifier(expression)
            ? expression.text
            : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
              ? expression.expression.text
              : null
          if (translatorName) {
            const namespace = lookupTranslator(translatorName)
            const [keyArg, valueArg] = node.arguments
            if (namespace !== undefined && keyArg && isStringLike(keyArg)) {
              const fullKey = namespace ? `${namespace}.${keyArg.text}` : keyArg.text
              const message = messages.get(fullKey)
              if (message === undefined) {
                offenders.push(`${location(sourceFile, node)} missing key ${fullKey}`)
              } else if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== 'raw') {
                const required = placeholderVars(message)
                const supplied = collectValueKeys(valueArg)
                const missing = supplied.hasSpread ? [] : required.filter((key) => !supplied.keys.has(key))
                if (missing.length || (required.length > 0 && supplied.invalid)) {
                  offenders.push(`${location(sourceFile, node)} ${fullKey} missing values: ${missing.join(', ')}`)
                }
              }
            }
          }
        }

        ts.forEachChild(node, visit)
      }

      collectAliases(sourceFile)
      visit(sourceFile)
    }

    expect(offenders).toEqual([])
  })
})
