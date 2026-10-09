import test from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, parseSince, toCsv } from '../lib/partner-csv'
import { needsDataProcessingAck, ALL_PARTNER_SCOPES } from '../lib/partner-scopes'

test('csv cells neutralise spreadsheet formulas and quote specials', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csvCell('+90 555'), "'+90 555")
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"')
})

test('toCsv unions columns and prefixes a BOM for Excel', () => {
  const csv = toCsv([{ a: 1 }, { a: 2, b: 'x' }])
  assert.ok(csv.startsWith('﻿a,b'))
  assert.equal(csv.trim().split('\r\n').length, 3)
})

test('parseSince accepts ISO and rejects junk', () => {
  assert.equal(parseSince(null), null)
  assert.equal(parseSince('not a date'), undefined)
  assert.equal(parseSince('2026-10-01T00:00:00Z'), '2026-10-01T00:00:00.000Z')
})

test('identified scopes need the acknowledgement, base scopes do not', () => {
  assert.equal(needsDataProcessingAck(['institution:read', 'students:read:pseudonymous']), false)
  assert.equal(needsDataProcessingAck(['institution:read', 'grades:write']), true)
  assert.ok(ALL_PARTNER_SCOPES.includes('students:link'))
})
