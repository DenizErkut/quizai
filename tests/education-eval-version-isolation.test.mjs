import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/admin/education-eval/run/route.ts', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../components/admin/EducationEvalRunner.tsx', import.meta.url), 'utf8')
test('run loading and creation use the selected version, never fixed v1', () => {
  assert.ok(route.includes("query.eq('benchmark_version', version)"))
  assert.ok(route.includes('loadRun(runId || preferredEvalRun(runHistory)?.id, version)'))
  assert.ok(route.includes('const version = Number(body.version)'))
  assert.ok(!route.includes(".eq('version', 1)"))
  assert.ok(route.includes('benchmark_version: set.version'))
})

test('history and unrated filter preserve access to earlier rated runs', () => {
  assert.ok(route.includes('runHistory'))
  assert.ok(ui.includes('Değerlendirme çalışması / geçmiş'))
  assert.ok(ui.includes('Yalnız değerlendirilmemiş çıktıları göster'))
  assert.ok(ui.includes('window.confirm('))
  assert.ok(ui.includes('await load(run.id)'))
})
test('runner exposes version selection and start after a completed previous run', () => {
  assert.ok(ui.includes('Çalıştırılacak benchmark sürümü'))
  assert.ok(ui.includes("action: 'start', version: data?.selectedVersion"))
  assert.ok(!ui.includes("data.run?.status !== 'completed' &&"))
  assert.ok(route.includes(".eq('id', body.resultId).eq('run_id', body.runId)"))
})
