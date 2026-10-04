import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
test('eşzamanlı istekler tek atomik sayaçtan geçer; kesinti sınırsız izin vermez', () => {
  const sql = readFileSync('supabase/migrations/20261004114217_atomic_daily_rate_limits.sql', 'utf8')
  assert.ok(sql.includes('WHERE limits.count<p_limit RETURNING count INTO v_count'))
  assert.ok(sql.includes('FROM PUBLIC,anon,authenticated'))
  const helper = readFileSync('lib/rate-limit.ts', 'utf8')
  assert.ok(helper.includes(".rpc('consume_daily_api_rate_limit_v1'"))
  assert.ok(helper.includes('allowed: false, remaining: 0'))
  assert.ok(helper.includes('result.unavailable ? 503 : 429'))
})
