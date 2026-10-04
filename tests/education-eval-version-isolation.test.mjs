import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/admin/education-eval/run/route.ts', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../components/admin/EducationEvalRunner.tsx', import.meta.url), 'utf8')
test('run loading and creation use the selected version, never fixed v1', () => {
  assert.ok(route.includes("query.eq('benchmark_version', version)"))
  assert.ok(route.includes('loadRun(runId, version)'))
  assert.ok(route.includes('const version = Number(body.version)'))
  assert.ok(!route.includes(".eq('version', 1)"))
  assert.ok(route.includes('benchmark_version: set.version'))
})
test('runner exposes version selection and start after a completed previous run', () => {
  assert.ok(ui.includes('Çalıştırılacak benchmark sürümü'))
  assert.ok(ui.includes("action: 'start', version: data?.selectedVersion"))
  assert.ok(!ui.includes("data.run?.status !== 'completed' &&"))
  assert.ok(route.includes(".eq('id', body.resultId).eq('run_id', body.runId)"))
})
