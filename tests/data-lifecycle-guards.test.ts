import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('erişim/düzeltme/kısıtlama talepleri hesap silme yoluna giremez', () => {
  const source = readFileSync('app/api/admin/data-lifecycle-requests/[id]/execute/route.ts', 'utf8')
  const guard = source.indexOf("request.request_kind !== 'deletion' || request.scope !== 'all_student_data'")
  assert.ok(guard > 0 && guard < source.indexOf('db.auth.admin.deleteUser'))
})
test('genel durum düzenleyicisi ikinci silme onayını atlayamaz', () => {
  const source = readFileSync('app/api/admin/data-lifecycle-requests/route.ts', 'utf8')
  assert.ok(source.indexOf("body.status === 'in_progress'") < source.indexOf(".update(update)"))
})
