import test from 'node:test'
import assert from 'node:assert/strict'
import { canApproveWithoutObjective } from '../lib/question-bank-approval'
import { hasVerifiedObjectiveMapping } from '../lib/objective-mapping-verification'

test('kazanımsız soru onaylanamaz, imzalı kitapçık soruları hariç', () => {
  const unmapped = { q: 'x', learningObjectiveCode: 'MAT.7.2.3' } // model iddiası, doğrulanmamış
  assert.equal(canApproveWithoutObjective(unmapped) || hasVerifiedObjectiveMapping(unmapped), false)
  assert.equal(canApproveWithoutObjective({ sourcePolicy: 'teacher_exact' }), true)
  assert.equal(canApproveWithoutObjective({ sourcePolicy: 'ai_exact' }), true)
  assert.equal(hasVerifiedObjectiveMapping({ objectiveMappingStatus: 'human_approved' }), true)
  assert.equal(canApproveWithoutObjective(null), false)
})
