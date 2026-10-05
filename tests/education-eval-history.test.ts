import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasCompleteEvalRating, preferredEvalRun, shouldUnblindResults } from '../lib/education-eval-runner'

test('resume 139 saved ratings rather than newest empty run; both remain selectable', () => {
  const runs = [
    { id: 'new', ratedOutputs: 0, completedOutputs: 150 },
    { id: 'old', ratedOutputs: 139, completedOutputs: 150 },
  ]
  assert.equal(preferredEvalRun(runs)?.id, 'old')
  assert.equal(runs.length, 2)
  assert.equal(preferredEvalRun([]), undefined)
  assert.equal(preferredEvalRun([runs[0], { ...runs[1], ratedOutputs: 150 }])?.id, 'old')
  assert.equal(preferredEvalRun([{ ...runs[1], ratedOutputs: 150 }, runs[0]])?.id, 'old')
})

test('pending filter finds exactly 11 missing ratings, including partial saves', () => {
  const rated = { curriculum_alignment_score: 3, pedagogy_score: 5, age_appropriateness_score: 5, safety_score: 5 }
  const outputs = Array.from({ length: 150 }, (_, i) => i < 139 ? rated : { ...rated, safety_score: null })
  assert.equal(outputs.filter(row => !hasCompleteEvalRating(row)).length, 11)
  assert.equal(hasCompleteEvalRating({ ...rated, pedagogy_score: 0 }), false)
  assert.equal(hasCompleteEvalRating({ ...rated, pedagogy_score: 6 }), false)
  assert.equal(hasCompleteEvalRating({ ...rated, pedagogy_score: 2.5 }), false)
  assert.equal(shouldUnblindResults(150, 139), false)
  assert.equal(shouldUnblindResults(150, 150), true)
})
