import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('AI booklet questions are kept in a separate Education Eval pool', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260928145650_education_eval_ai_question_pool.sql'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/admin/education-eval/benchmark/route.ts'), 'utf8')

  expect(migration).toContain('education_eval_ai_question_items')
  expect(migration).toContain("status IN ('needs_objective', 'ready')")
  expect(migration).toContain('Never included in the teacher-approved 50-item MEB benchmark metric')
  expect(migration).toContain('resource_match_count = 1')
  expect(route).toContain("body.action === 'add-ai'")
  expect(route).toContain("body.action === 'map-ai'")
  expect(route).toContain("objective.verification_status !== 'verified'")
})

test('AI booklet reprocessing requires an approved AI instant-test booklet', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  expect(route).toContain("body?.action === 'reprocess-ai-booklet'")
  expect(route).toContain("row.source_type !== 'ai' || row.purpose !== 'instant_test' || row.review_status !== 'approved'")
  expect(route).toContain("adminDb.from('education_eval_ai_question_items')")
})
