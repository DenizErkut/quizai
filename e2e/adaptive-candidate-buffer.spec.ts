import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('adaptive continuation requests a three-question validated reserve', () => {
  const page = readFileSync(join(process.cwd(), 'app/quiz/page.tsx'), 'utf8')
  expect(page).toContain('Math.min(3, Math.max(1, qCount - questions.length))')
  expect(page).toContain('adaptiveCandidateBatch: true')
  expect(page).toContain('if (secondChunk.length === 0 && sessionId)')
  expect(page).not.toContain('Bağlantıyı kontrol edip testi yeniden başlatabilirsin.')
})

test('quality gate accepts a verified seventy-percent subset without relaxing objectives', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/generate-quiz/route.ts'), 'utf8')
  expect(route).toContain("body?.adaptiveCandidateBatch === true")
  expect(route).toContain("typeof body?.continueSessionId === 'string'")
  expect(route).toContain('Math.ceil(safeQCount * 0.70)')
  expect(route).toContain('verifiedCandidateCount >= minimumVerifiedCount')
  expect(route).toContain('adaptiveCandidateBatch && questions.length > 0')
  expect(route).toContain('combinedMinimum = requiredVisualCount(existingQuestions.length + safeQCount)')
  expect(route).toContain('batchVisualMinimum = Math.max(0, combinedMinimum - existingVisualCount)')
})

test('a primary rejection receives an independent second opinion and is audited', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/verify-questions/route.ts'), 'utf8')
  expect(route).toContain('primaryCheck?.ok === false')
  expect(route).toContain('await verifyQuestionWithGemini(verifyPrompt)')
  expect(route).toContain('verifyQuestionWithClaude(verifyPrompt)')
  expect(route).toContain('objectiveCandidates.length === 1')
  expect(route).toContain('strictQualityPolicy && verified.length > 0')
  expect(route).toContain('two_provider_rejection')
  expect(route).toContain('rejection_details: rejectionDetails')
})

test('completed learning events schedule delayed transfer checks', () => {
  const events = readFileSync(join(process.cwd(), 'lib/learning-events.ts'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app/api/transfer-check/route.ts'), 'utf8')
  expect(events).toContain("schedule_transfer_checks_v1")
  expect(events).toContain('p_min_delay: 10')
  expect(route).toContain("eq('status', 'pending')")
  expect(route).toContain('due_after_event_count')
  expect(route).not.toContain("select('*')")
  expect(route).toContain('export async function POST')
  expect(route).toContain("['claim', 'complete']")
  expect(route).toContain(".eq('status', 'pending')")
  expect(route).toContain(".eq('status', 'served')")
  expect(route).toContain('transfer_result')
  expect(route).toContain('prompt_context?.sourceQuestionType')
})

test('transfer report separates independent transfer from baseline performance', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/student/transfer-report/route.ts'), 'utf8')
  expect(route).toContain("eq('status', 'completed')")
  expect(route).toContain("neq('source_type', 'transfer_check')")
  expect(route).toContain('independentRate')
  expect(route).toContain('impactDelta')
  expect(route).toContain('transferRate')
})

test('education AI safety scorecard uses live evidence and admin authorization', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/admin/ai-safety-scorecard/route.ts'), 'utf8')
  const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  expect(route).toContain("select('is_admin')")
  expect(route).toContain("from('agent_decision_audit')")
  expect(route).toContain("from('agent_action_approval_queue')")
  expect(route).toContain("from('learning_transfer_checks')")
  expect(route).toContain('privacy_access')
  expect(admin).toContain('<EducationAISafetyScorecard />')
})

test('provider observability reports real usage cost and qualified quality samples', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/admin/provider-observability/route.ts'), 'utf8')
  const admin = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf8')
  expect(route).toContain("from('ai_usage_logs')")
  expect(route).toContain('pricingCoverage')
  expect(route).toContain('observedSuccessRate')
  expect(route).toContain('qualitySample')
  expect(route).toContain("select('is_admin')")
  expect(admin).toContain('<ProviderObservability />')
})

test('database plan constraint accepts every checkout profile plan', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260927150931_allow_current_profile_plans.sql'), 'utf8')
  for (const plan of ['free', 'silver', 'premium', 'unlimited']) expect(migration).toContain(`'${plan}'::text`)
})

test('teacher booklets ground generation and approved exact questions re-enter the live bank', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/generate-quiz/route.ts'), 'utf8')
  const upload = readFileSync(join(process.cwd(), 'app/api/admin/exam-upload/route.ts'), 'utf8')
  const bank = readFileSync(join(process.cwd(), 'lib/question-bank.ts'), 'utf8')
  expect(route).toContain('ÖĞRETMEN İMZALI SORU KİTAPÇIĞI REFERANSI')
  expect(route).toContain('const bankEligible = bankWriteEligible && !continueSessionId')
  expect(route).toContain('validatedQuestionsForBank = questions.slice()')
  expect(route.indexOf('validatedQuestionsForBank = questions.slice()')).toBeGreaterThan(route.indexOf('questions = balanceAnswerPositions(questions)'))
  expect(upload).toContain("sourcePolicy: 'teacher_exact'")
  expect(upload).toContain("difficulty: q.difficulty === 'easy' ? 'kolay'")
  expect(bank).toContain("row.question?.sourcePolicy === 'teacher_exact'")
  expect(bank).toContain("contains('question', { sourcePolicy: 'teacher_exact' })")
  expect(bank).toContain('hasRealVisualAsset(clean)')
})

test('open-ended grading accepts age-appropriate concise student language', () => {
  const generate = readFileSync(join(process.cwd(), 'app/api/generate-open-ended/route.ts'), 'utf8')
  const grade = readFileSync(join(process.cwd(), 'app/api/grade-open-ended/route.ts'), 'utf8')
  const teacher = readFileSync(join(process.cwd(), 'app/api/teacher/create-open-ended/route.ts'), 'utf8')
  expect(generate).toContain('YAŞA UYGUN CEVAP STANDARDI — ZORUNLU')
  expect(generate).toContain('Ortaokul için 1-3 kısa ve açık cümle')
  expect(teacher).toContain('YAŞA UYGUN CEVAP STANDARDI — ZORUNLU')
  expect(grade).toContain('YAŞA UYGUN PUANLAMA KURALI — EN ÖNCELİKLİ KURAL')
  expect(grade).toContain("gradeKey.includes('lise') ? 20 : 12")
  expect(grade).not.toContain('en az 50 karakter olmalı')
  expect(grade).toContain('teknik sözcükleri birebir kullanma şartı arama')
})
