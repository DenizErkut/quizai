import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { discountedPrice, resolveAutomaticDiscount } from '../lib/automatic-discount'

function mockDb(rows: Record<string, unknown>) {
  const visited: string[] = []
  const db = {
    from(table: string) {
      visited.push(table)
      const query = {
        select() { return query },
        eq() { return query },
        in() { return query },
        async maybeSingle() { return { data: rows[table] ?? null, error: null } },
        then(resolve: (value: { data: unknown; error: null }) => void) { resolve({ data: rows[table] ?? null, error: null }) },
      }
      return query
    },
  } as unknown as SupabaseClient
  return { db, visited }
}

test('aktif kurum öğrencisine kurum indirimi otomatik ve satıcıdan öncelikli uygulanır', async () => {
  const { db, visited } = mockDb({
    institution_users: [{ institution_id: 'institution-1' }],
    institutions: [{ id: 'institution-1', name: 'Örnek Okul', discount_rate: 20, active: true, seller_id: 'seller-1' }],
    profiles: { seller_id: 'other-seller' },
  })
  const result = await resolveAutomaticDiscount(db, 'student-1')
  assert.deepEqual(result, { discountRate: 20, sellerId: 'seller-1', source: 'institution', label: 'Örnek Okul kurumuna özel indirim', institutionName: 'Örnek Okul' })
  assert.deepEqual(visited, ['institution_users', 'institutions'])
  assert.equal(discountedPrice(2490, result.discountRate), 1992)
})

test('kurum indirimi yoksa kayıtlı aktif satıcı indirimine düşer', async () => {
  const { db } = mockDb({ profiles: { seller_id: 'seller-1' }, sellers: { id: 'seller-1', discount_rate: 12.5, active: true } })
  const result = await resolveAutomaticDiscount(db, 'student-1')
  assert.equal(result.source, 'seller')
  assert.equal(result.discountRate, 12.5)
  assert.equal(discountedPrice(4490, result.discountRate), 3928.75)
})

test('aktif olmayan kurum ve satıcı indirim vermez', async () => {
  const { db } = mockDb({ institution_users: [{ institution_id: 'institution-1' }], institutions: [{ id: 'institution-1', name: 'Okul', discount_rate: 30, active: false }], profiles: { seller_id: 'seller-1' }, sellers: { id: 'seller-1', discount_rate: 10, active: false } })
  assert.equal((await resolveAutomaticDiscount(db, 'student-1')).discountRate, 0)
})

test('birden fazla aktif kurumda en avantajlı oran seçilir', async () => {
  const { db } = mockDb({
    institution_users: [{ institution_id: 'institution-1' }, { institution_id: 'institution-2' }],
    institutions: [
      { id: 'institution-1', name: 'Okul A', discount_rate: 10, active: true },
      { id: 'institution-2', name: 'Okul B', discount_rate: 25, active: true },
    ],
  })
  const result = await resolveAutomaticDiscount(db, 'teacher-1')
  assert.equal(result.institutionName, 'Okul B')
  assert.equal(result.discountRate, 25)
})

test('fiyat kuruşa yuvarlanır ve geçersiz oran fiyatı düşürmez', () => {
  assert.equal(discountedPrice(2490, 17.3), 2059.23)
  assert.equal(discountedPrice(2490, Number.NaN), 2490)
  assert.equal(discountedPrice(2490, 110), 0)
})
