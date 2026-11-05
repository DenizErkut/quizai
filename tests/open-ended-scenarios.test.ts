import test from 'node:test'
import assert from 'node:assert/strict'
import { exampleBlock, pickExamples, scenarioLabel, validateScenarioExample } from '../lib/open-ended-scenarios'

const base = () => ({
  gradeNumber: '7. sınıf', subject: 'Fen Bilimleri', term: 1, scenarioNo: 1,
  scenario: 'Bir öğrenci evde buzun erimesini gözlemliyor ve süre tutuyor.', question: 'Buzun erime süresini etkileyen bir etken yazınız.',
  rubric: [{ criterion: 'Etken', maxPoints: 60, description: 'Sıcaklık gibi bir etken' }, { criterion: 'Gerekçe', maxPoints: 40, description: 'Neden-sonuç' }],
})

test('validateScenarioExample accepts a complete example', () => {
  const result = validateScenarioExample(base())
  assert.equal(result.ok && result.value.gradeNumber, 7)
})

test('validateScenarioExample enforces rubric total 100 and ranges', () => {
  assert.equal(validateScenarioExample({ ...base(), rubric: [{ criterion: 'a', maxPoints: 50, description: '' }] }).ok, false)
  assert.equal(validateScenarioExample({ ...base(), scenarioNo: 0 }).ok, false)
  assert.equal(validateScenarioExample({ ...base(), term: 3 }).ok, false)
  assert.equal(validateScenarioExample({ ...base(), scenario: 'kısa' }).ok, false)
})

test('scenarioLabel and exampleBlock', () => {
  assert.equal(scenarioLabel(1, 3), '1. dönem 3. senaryo')
  assert.match(exampleBlock([{ scenario: 'S', question: 'Q', rubric: [{ criterion: 'K', maxPoints: 100, description: 'D' }] }]), /ÖRNEK 1:/)
})

test('pickExamples returns at most count items without duplicates', () => {
  const picked = pickExamples([1, 2, 3, 4, 5], 3)
  assert.equal(picked.length, 3)
  assert.equal(new Set(picked).size, 3)
  assert.equal(pickExamples([1], 3).length, 1)
})
