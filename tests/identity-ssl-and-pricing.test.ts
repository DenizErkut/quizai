import test from 'node:test'
import assert from 'node:assert/strict'
import { identityDbSsl } from '../lib/identity/ssl'
import { computeCostUsd } from '../lib/ai-usage'

test('identity DB TLS is off unless TR_IDENTITY_DB_SSL=true', () => {
  assert.equal(identityDbSsl({}), false)
})

test('identity DB TLS verifies the certificate when a CA or VERIFY flag is configured', () => {
  const withCa = identityDbSsl({ TR_IDENTITY_DB_SSL: 'true', TR_IDENTITY_DB_CA: 'line1\\nline2' }) as { rejectUnauthorized: boolean; ca: string }
  assert.equal(withCa.rejectUnauthorized, true)
  assert.equal(withCa.ca, 'line1\nline2')
  assert.deepEqual(identityDbSsl({ TR_IDENTITY_DB_SSL: 'true', TR_IDENTITY_DB_SSL_VERIFY: 'true' }), { rejectUnauthorized: true })
})

test('identity DB TLS keeps the legacy behaviour when nothing else is configured', () => {
  assert.deepEqual(identityDbSsl({ TR_IDENTITY_DB_SSL: 'true' }), { rejectUnauthorized: false })
})

test('mistral-small-latest is priced instead of silently costing zero', () => {
  const cost = computeCostUsd({ operation: 'x', provider: 'mistral', model: 'mistral-small-latest', inputTokens: 1_000_000, outputTokens: 1_000_000 } as any)
  assert.ok(cost > 0)
})

test('an unknown model still returns zero cost', () => {
  assert.equal(computeCostUsd({ operation: 'x', provider: 'mistral', model: 'no-such-model', inputTokens: 10, outputTokens: 10 } as any), 0)
})
