import test from 'node:test'
import assert from 'node:assert/strict'
import { enableGoogleTag, disableGoogleTag, prepareGoogleTag, GOOGLE_TAG_ID } from '../lib/google-tag'

function fakeDom() {
  const appended: Array<{ id: string; src: string; async: boolean }> = []
  const doc = {
    getElementById: (id: string) => appended.find(item => item.id === id) || null,
    createElement: () => ({ id: '', src: '', async: false }),
    head: { appendChild: (node: { id: string; src: string; async: boolean }) => { appended.push(node) } },
  }
  const win: Record<string, unknown> = {}
  return { doc: doc as unknown as Document, win: win as unknown as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }, appended }
}

test('rıza yokken hazırlık yalnızca Consent Mode varsayılanını reddedildi yapar; Google betiği eklenmez', () => {
  const { win, appended } = fakeDom()
  prepareGoogleTag(win)
  assert.equal(appended.length, 0)
  const first = Array.from(win.dataLayer![0] as ArrayLike<unknown>)
  assert.deepEqual(first.slice(0, 2), ['consent', 'default'])
  assert.equal((first[2] as Record<string, string>).analytics_storage, 'denied')
  assert.equal((first[2] as Record<string, string>).ad_storage, 'denied')
})

test('analiz izni verilince betik bir kez yüklenir ve analytics_storage açılır', () => {
  const { doc, win, appended } = fakeDom()
  enableGoogleTag(doc, win)
  enableGoogleTag(doc, win)
  assert.equal(appended.length, 1)
  assert.equal(appended[0].src, `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_ID}`)
  assert.equal(appended[0].async, true)
  const updates = (win.dataLayer as unknown[]).map(entry => Array.from(entry as ArrayLike<unknown>)).filter(entry => entry[0] === 'consent' && entry[1] === 'update')
  assert.ok(updates.some(entry => (entry[2] as Record<string, string>).analytics_storage === 'granted'))
})

test('rıza geri alınınca analytics_storage reddedilir', () => {
  const { doc, win } = fakeDom()
  enableGoogleTag(doc, win)
  disableGoogleTag(win)
  const last = Array.from((win.dataLayer as unknown[])[(win.dataLayer as unknown[]).length - 1] as ArrayLike<unknown>)
  assert.deepEqual(last.slice(0, 2), ['consent', 'update'])
  assert.equal((last[2] as Record<string, string>).analytics_storage, 'denied')
})

test('Google etiket kimliği varsayılan olarak ekran görüntüsündeki GTM kapsayıcısıdır', () => {
  assert.equal(GOOGLE_TAG_ID, process.env.NEXT_PUBLIC_GTM_ID || 'GTM-57G6ST83')
})
