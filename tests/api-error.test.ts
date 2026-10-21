import test from 'node:test'
import assert from 'node:assert/strict'
import { errorResponse, UserFacingError } from '../lib/api-error'

test('unexpected errors return a generic message and never the raw error text', async () => {
  const original = console.error
  const logged: unknown[][] = []
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    const response = errorResponse('test/route', new Error('student_grades yazılamadı (satır 3): duplicate key value violates unique constraint'), 'İçe aktarma başarısız.')
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'İçe aktarma başarısız.' })
    assert.match(String(logged[0]?.[1]), /duplicate key/)   // ayrıntı yalnızca sunucu günlüğünde
  } finally { console.error = original }
})

test('user-facing errors keep their message and status', async () => {
  const response = errorResponse('test/route', new UserFacingError('En az bir başlık ve bir veri satırı gerekli.'))
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'En az bir başlık ve bir veri satırı gerekli.' })
  assert.equal((await errorResponse('x', new UserFacingError('Yetkisiz', 403)).json()).error, 'Yetkisiz')
})

test('non-Error throwables are handled', async () => {
  const original = console.error
  console.error = () => {}
  try { assert.equal(errorResponse('x', 'string failure').status, 500) } finally { console.error = original }
})
