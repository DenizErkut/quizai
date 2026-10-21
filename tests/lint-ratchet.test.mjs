import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBaseline, compareToBaseline, errorCountsFromEslintJson } from '../scripts/lint-ratchet-lib.mjs'

test('only severity-2 messages count and paths are made repo-relative', () => {
  const counts = errorCountsFromEslintJson([
    { filePath: '/repo/app/a.ts', messages: [{ severity: 2 }, { severity: 1 }, { severity: 2 }] },
    { filePath: '/repo/lib/b.ts', messages: [{ severity: 1 }] },
  ], '/repo')
  assert.deepEqual(counts, { 'app/a.ts': 2, 'lib/b.ts': 0 })
})

test('a file may not exceed its baseline; unknown files must have zero errors', () => {
  const baseline = { 'app/a.ts': 3 }
  const { regressions, improvements } = compareToBaseline({ 'app/a.ts': 4, 'app/new.ts': 1, 'app/c.ts': 0 }, baseline)
  assert.deepEqual(regressions, [{ file: 'app/a.ts', errors: 4, allowed: 3 }, { file: 'app/new.ts', errors: 1, allowed: 0 }])
  assert.deepEqual(improvements, [])
  assert.deepEqual(compareToBaseline({ 'app/a.ts': 1 }, baseline).improvements, [{ file: 'app/a.ts', errors: 1, allowed: 3 }])
})

test('baseline keeps only files with errors, sorted by name', () => {
  assert.deepEqual(buildBaseline({ 'b.ts': 2, 'a.ts': 1, 'c.ts': 0 }), { 'a.ts': 1, 'b.ts': 2 })
  assert.deepEqual(Object.keys(buildBaseline({ 'b.ts': 2, 'a.ts': 1 })), ['a.ts', 'b.ts'])
})
