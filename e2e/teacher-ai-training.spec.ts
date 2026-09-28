import { expect, test } from '@playwright/test'
import { scoreTeacherTrainingModule } from '../lib/teacher-ai-training-assessment'
import { TEACHER_AI_TRAINING_MODULES } from '../lib/teacher-ai-training-course'

test('teacher pilot has four short modules with a four-question check each', () => {
  expect(TEACHER_AI_TRAINING_MODULES.map(module => module.id)).toEqual(['verify', 'curriculum', 'pedagogy', 'safety'])
  expect(TEACHER_AI_TRAINING_MODULES.every(module => module.lessons.length >= 3 && module.questions.length === 4)).toBe(true)
})

test('teacher module assessment requires all four valid answers and a 3-of-4 pass', () => {
  expect(scoreTeacherTrainingModule('verify', { v1: 'B', v2: 'C', v3: 'B', v4: 'C' })?.passed).toBe(true)
  expect(scoreTeacherTrainingModule('verify', { v1: 'B', v2: 'C', v3: 'A', v4: 'A' })?.score).toBe(2)
  expect(scoreTeacherTrainingModule('verify', { v1: 'B', v2: 'C', v3: 'B' })).toBeNull()
  expect(scoreTeacherTrainingModule('unknown', { v1: 'A' })).toBeNull()
})
