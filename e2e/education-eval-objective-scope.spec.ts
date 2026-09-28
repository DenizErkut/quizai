import { expect, test } from '@playwright/test'
import { isEducationEvalObjectiveInScope } from '../lib/education-eval-grade'

test('objective scope accepts equivalent Turkish grade and subject labels', () => {
  expect(isEducationEvalObjectiveInScope({
    grade: '5. Sınıf', subject: 'FEN BİLİMLERİ', curriculum_version_id: 'meb-2026',
  }, { grade: '5', subject: 'Fen Bilimleri', curriculumVersionId: 'meb-2026' })).toBe(true)
})

test('objective scope still rejects a different grade, subject, or curriculum version', () => {
  const scope = { grade: '7. sınıf', subject: 'Matematik', curriculumVersionId: 'meb-2026' }
  expect(isEducationEvalObjectiveInScope({ grade: '8', subject: 'Matematik', curriculum_version_id: 'meb-2026' }, scope)).toBe(false)
  expect(isEducationEvalObjectiveInScope({ grade: '7', subject: 'Fen Bilimleri', curriculum_version_id: 'meb-2026' }, scope)).toBe(false)
  expect(isEducationEvalObjectiveInScope({ grade: '7', subject: 'Matematik', curriculum_version_id: 'meb-2025' }, scope)).toBe(false)
})
