import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function findListLoaderEffectDeps(source: string, actionName: string): string[][] {
  const file = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const deps: string[][] = []

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useEffect' &&
      node.arguments.length >= 2
    ) {
      const [callback, dependencyArray] = node.arguments
      if (
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        ts.isArrayLiteralExpression(dependencyArray)
      ) {
        let callsAction = false
        const scanCallback = (inner: ts.Node) => {
          if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression) && inner.expression.text === actionName) {
            callsAction = true
          }
          ts.forEachChild(inner, scanCallback)
        }
        scanCallback(callback)
        if (callsAction) deps.push(dependencyArray.elements.map((element) => element.getText(file)))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  return deps
}

describe('slot template modal loaders', () => {
  it('does not refetch slot template lists on translation-only rerenders', () => {
    const summaryComponents = [
      'src/components/LoadSlotTemplateButton.tsx',
      'src/components/SaveSlotAsTemplateButton.tsx',
    ]

    const summaryDependencies = summaryComponents.flatMap((component) => {
      const source = readFileSync(join(process.cwd(), component), 'utf8')
      return findListLoaderEffectDeps(source, 'listSlotTemplates')
    })
    const paletteSource = readFileSync(
      join(process.cwd(), 'src/components/BuildTemplatePalette.tsx'),
      'utf8',
    )

    expect(summaryDependencies).toEqual([['open'], ['open']])
    expect(findListLoaderEffectDeps(paletteSource, 'listSlotTemplateCards')).toEqual([[]])
  })
})
