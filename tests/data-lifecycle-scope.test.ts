import test from 'node:test'
import assert from 'node:assert/strict'
import { lifecycleTables, lifecycleOwnerColumn } from '../lib/data-lifecycle-scope'

test('veri yaşam döngüsü önizlemesi gerçek sahiplik sütunlarını kullanır', () => {
  assert.deepEqual(Object.fromEntries(lifecycleTables.map(table => [table, lifecycleOwnerColumn(table)])), {
    profiles: 'id', quiz_sessions: 'user_id', learning_events: 'student_id',
    student_mastery: 'student_id', student_recommendations: 'student_id', parent_children: 'child_id',
  })
})
