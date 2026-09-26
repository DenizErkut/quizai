import { expect, test } from '@playwright/test'
import { isSameGradeSource } from '../lib/meb-source-scope'

test('accepts equivalent grade labels only for the same grade', () => {
  expect(isSameGradeSource('lise 9. sinif', '9. sınıf')).toBe(true)
  expect(isSameGradeSource('Ortaokul 7. sınıf', '7')).toBe(true)
})

test('rejects other-grade and missing-grade sources', () => {
  expect(isSameGradeSource('lise 9. sinif', '7. sınıf')).toBe(false)
  expect(isSameGradeSource('lise 9. sinif', '')).toBe(false)
  expect(isSameGradeSource('', '9. sınıf')).toBe(false)
})
