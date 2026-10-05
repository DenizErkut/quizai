import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookletBatches, readBookletResponse, finishBookletProcessing } from '../lib/booklet-processing'

test('200 Soru headings are bounded and inline answers remain with every question', () => {
  const raw = Array.from({ length: 200 }, (_, i) => `Soru ${String(i + 1).padStart(3, '0')} | Kolay\nQuestion ${i + 1}\nA) a B) b C) c D) d\nCevap: B\nKısa açıklama: because`).join('\n')
  const batches = bookletBatches(raw)
  assert.equal(batches.length, 25)
  assert.equal(batches.join('\n').match(/Cevap: B/g)?.length, 200)
  assert.equal(batches.join('\n').match(/Soru \d+/g)?.length, 200)
  assert.ok(batches.every(batch => (batch.match(/Soru \d+/g) || []).length <= 8))
})

test('numbered questions retain a separate global answer key', () => {
  const raw = Array.from({ length: 20 }, (_, i) => `${i + 1}. Soru metni\nA) a B) b C) c D) d`).join('\n') + '\nCEVAP ANAHTARI\n1 B 2 C 3 D'
  const batches = bookletBatches(raw)
  assert.equal(batches.length, 3)
  assert.ok(batches.every(batch => batch.includes('CEVAP ANAHTARI\n1 B 2 C 3 D')))
})

test('unstructured huge input is not silently truncated into invented questions', () => {
  assert.throws(() => bookletBatches('x'.repeat(30000)), /ayrılamadı/)
})

test('host 504 HTML/text produces recovery guidance, never a raw JSON syntax exception', async () => {
  await assert.rejects(readBookletResponse(new Response('An error occurred', { status: 504 })), /tekrar PDF yüklemeniz gerekmez/)
  await assert.rejects(readBookletResponse(new Response(JSON.stringify({ error: 'Yetki yok' }), { status: 403 })), /Yetki yok/)
})

test('client continues pending steps and stops on persisted completion', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => new Response(JSON.stringify({ done: ++calls === 3, promoted: 7, progress: `${calls}/3` }))
  try {
    const messages: string[] = []
    const result = await finishBookletProcessing('resource', message => messages.push(message))
    assert.equal(calls, 3)
    assert.equal(result.promoted, 7)
    assert.equal(messages.length, 3)
  } finally { globalThis.fetch = original }
})
