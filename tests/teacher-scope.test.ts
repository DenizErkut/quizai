import test from 'node:test'
import assert from 'node:assert/strict'
import { studentInTeacherClassrooms, teacherOwnsClassroom } from '../lib/teacher-scope'

type Row = Record<string, string>
// Zincirleme sorguyu (select/eq/in/limit/maybeSingle) çalıştıran küçük sahte veritabanı.
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const chain = {
        select() { return chain },
        eq(column: string, value: string) { rows = rows.filter(row => row[column] === value); return chain },
        in(column: string, values: string[]) { rows = rows.filter(row => values.includes(row[column])); return chain },
        limit(count: number) { rows = rows.slice(0, count); return chain },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
      }
      return chain
    },
  }
}

const db = fakeDb({
  classrooms: [{ id: 'c1', teacher_id: 't1' }, { id: 'c2', teacher_id: 't2' }],
  classroom_students: [{ classroom_id: 'c1', student_id: 's1' }, { classroom_id: 'c2', student_id: 's2' }],
})

test('öğretmen yalnızca kendi sınıfına sahiptir', async () => {
  assert.equal(await teacherOwnsClassroom(db, 't1', 'c1'), true)
  assert.equal(await teacherOwnsClassroom(db, 't1', 'c2'), false) // başka öğretmenin sınıfı
  assert.equal(await teacherOwnsClassroom(db, 't1', 'yok'), false)
  assert.equal(await teacherOwnsClassroom(db, 't1', undefined), false)
})

test('öğrenci yalnızca öğretmenin kendi sınıflarında geçerlidir', async () => {
  assert.equal(await studentInTeacherClassrooms(db, 't1', 's1', 'c1'), true)
  assert.equal(await studentInTeacherClassrooms(db, 't1', 's1'), true)
  assert.equal(await studentInTeacherClassrooms(db, 't1', 's2', 'c2'), false) // sınıf başkasının
  assert.equal(await studentInTeacherClassrooms(db, 't1', 's2'), false) // classroom_id verilmese de başkasının öğrencisi
  assert.equal(await studentInTeacherClassrooms(db, 't1', 's2', 'c1'), false) // öğrenci o sınıfta değil
  assert.equal(await studentInTeacherClassrooms(db, 't3', 's1'), false) // sınıfı olmayan öğretmen
})
