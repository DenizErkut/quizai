import { expect, test } from '@playwright/test'
import { matchVerifiedObjectiveCode, parseLearningObjectiveCodes } from '../lib/learning-objective-codes'

test('parses comma, semicolon and newline separated MEB outcome codes without duplicates', () => {
  expect(parseLearningObjectiveCodes('mat.7.1.1, MAT.7.1.2\nmat.7.1.1; FB.5.2.3')).toEqual([
    'MAT.7.1.1', 'MAT.7.1.2', 'FB.5.2.3',
  ])
})

test('rejects malformed and non-string outcome codes', () => {
  expect(parseLearningObjectiveCodes('MAT.7.1.1, invalid code, <script>,')).toEqual(['MAT.7.1.1'])
  expect(parseLearningObjectiveCodes([null, 5, 'FB.5.1.2'])).toEqual(['FB.5.1.2'])
})

test('only maps a generated question to an exact verified code from the booklet list', () => {
  const verifiedCodes = ['MAT.7.1.1', 'MAT.7.1.2']
  expect(matchVerifiedObjectiveCode('mat.7.1.2', verifiedCodes)).toBe('MAT.7.1.2')
  expect(matchVerifiedObjectiveCode('MAT.7.9.9', verifiedCodes)).toBeNull()
  expect(matchVerifiedObjectiveCode(null, verifiedCodes)).toBeNull()
})
