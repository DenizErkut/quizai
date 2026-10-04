import test from 'node:test'
import assert from 'node:assert/strict'
import { matchImportStudent } from '../lib/grade-import-matching'
const roster = [
  { id: 'a', schoolNo: '12', fullName: 'Çağrı Erkut', classroomName: '6-D' },
  { id: 'b', schoolNo: '12', fullName: 'Çağrı Erkut', classroomName: '7-A' },
]
test('aynı isim veya numarada rastgele son öğrenciye not atanmaz', () => {
  assert.equal(matchImportStudent(roster, '12', '', '').studentId, null)
  assert.equal(matchImportStudent(roster, '', 'Cagri Erkut', '').studentId, null)
  assert.equal(matchImportStudent(roster, '12', 'Çağrı Erkut', '6 D').studentId, 'a')
})
test('çelişkili numara, isim veya sınıf insan seçimi gerektirir', () => {
  assert.equal(matchImportStudent(roster, '99', 'Çağrı Erkut', '6-D').studentId, null)
  assert.equal(matchImportStudent(roster, '12', 'Başka Öğrenci', '6-D').studentId, null)
  assert.equal(matchImportStudent(roster, '12', '', '8-A').studentId, null)
})
