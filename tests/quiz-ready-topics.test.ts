import test from 'node:test'
import assert from 'node:assert/strict'
import { keepQuizReadyTopics } from '../lib/quiz-ready-topics'

const db = {} as never
const catalog = new Set(['Matematik|Geometrik Nicelikler (1)'])
const fetcher = async (_: never, ctx: { subject?: string | null; topic?: string | null }) =>
  catalog.has(`${ctx.subject}|${ctx.topic}`) ? [{}] : []

test('drops topics outside the grade catalog and keeps the rest in order', async () => {
  const items = [{ subject: 'Fen Bilimleri', topic: 'DNA ve genetik kod' }, { subject: 'Matematik', topic: 'Geometrik Nicelikler (1)' }]
  assert.deepEqual(await keepQuizReadyTopics(db, 'ortaokul 6. sinif', items, fetcher as never), [items[1]])
})

test('university, unknown grade and lookup errors fail open', async () => {
  const items = [{ subject: 'X', topic: 'Y' }]
  assert.equal((await keepQuizReadyTopics(db, 'üniversite', items, fetcher as never)).length, 1)
  assert.equal((await keepQuizReadyTopics(db, null, items, fetcher as never)).length, 1)
  assert.equal((await keepQuizReadyTopics(db, 'lise 9. sinif', items, (async () => { throw new Error('x') }) as never)).length, 1)
})
