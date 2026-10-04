import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const screens = [
  'app/daily/page.tsx', 'app/exam/page.tsx', 'app/live/LiveContent.tsx',
  'app/teacher/live/page.tsx', 'app/review/page.tsx', 'app/reading/page.tsx',
  'app/challenge/[code]/page.tsx', 'app/archive/[id]/page.tsx',
  'app/verified-learning/page.tsx', 'app/koc/pratik/page.tsx', 'app/transfer-checks/page.tsx',
  'app/acik-uclu/page.tsx', 'app/teacher/performance/page.tsx',
  'components/quiz/QuizQuestion.tsx', 'components/admin/ObjectiveMappingReview.tsx',
  'components/admin/EducationEvalRunner.tsx', 'components/admin/EducationEvalBenchmark.tsx',
]

test('educational question screens do not render primary math fields as raw JSX text', () => {
  for (const file of screens) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /import MathText/)
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const raw: string[] = []
    function visit(node: ts.Node) {
      if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
        const expression = node.expression.getText(ast)
        if (/^(?:q|practice|card|question)\.(?:q|exp|question|explanation|text|passage)$/.test(expression) || /^(opt|option)$/.test(expression)) raw.push(expression)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.deepEqual(raw, [], file)
  }
})

test('client directives remain first executable statements', () => {
  for (const file of screens) {
    const source = fs.readFileSync(file, 'utf8')
    if (!source.includes("'use client'")) continue
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const first = ast.statements[0]
    assert.ok(ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client', file)
  }
})
