import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeCspReports } from '../lib/csp-report'

test('legacy report-uri payload is summarized without query strings or fragments', () => {
  const [report] = summarizeCspReports({
    'csp-report': {
      'document-uri': 'https://pratium.com/profile/edit?token=secret#x',
      'effective-directive': 'img-src',
      'blocked-uri': 'https://evil.example.com/p.png?u=123',
      'source-file': 'https://pratium.com/_next/static/a.js',
      'line-number': 12,
      disposition: 'report',
    },
  })
  assert.deepEqual(report, { directive: 'img-src', blocked: 'https://evil.example.com/p.png', page: 'https://pratium.com/profile/edit', source: 'https://pratium.com/_next/static/a.js', line: 12, disposition: 'report' })
})

test('Reporting API array payload and keyword blocked values are handled; junk is ignored', () => {
  const reports = summarizeCspReports([
    { type: 'csp-violation', body: { documentURL: 'https://pratium.com/quiz?x=1', effectiveDirective: 'script-src', blockedURL: 'inline', lineNumber: 3, disposition: 'report' } },
    { type: 'other', body: {} },
    'not-an-object',
    null,
  ])
  assert.equal(reports.length, 1)
  assert.equal(reports[0].blocked, 'inline')
  assert.equal(reports[0].page, 'https://pratium.com/quiz')
  assert.deepEqual(summarizeCspReports(undefined), [])
})
