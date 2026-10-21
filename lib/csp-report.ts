// CSP ihlal raporlarını (eski report-uri biçimi ve Reporting API biçimi) günlüğe yazılabilir kısa kayıtlara çevirir.
// Kişisel veri/token sızmaması için URL'lerden sorgu ve parça (#) atılır, alanlar kısaltılır.
export interface CspViolationSummary {
  directive: string
  blocked: string
  page: string
  source: string
  line: number | null
  disposition: string
}

function safeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  const text = value.slice(0, 300)
  try {
    const url = new URL(text)
    return `${url.origin}${url.pathname}`.slice(0, 200)
  } catch {
    return text.split(/[?#]/)[0].slice(0, 60)   // 'inline', 'eval', 'data' gibi anahtar sözcükler
  }
}

function summarizeOne(raw: unknown): CspViolationSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const directive = String(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? r.violatedDirective ?? '').slice(0, 60)
  if (!directive) return null
  const line = Number(r['line-number'] ?? r.lineNumber)
  return {
    directive,
    blocked: safeUrl(r['blocked-uri'] ?? r.blockedURL ?? r.blockedUri),
    page: safeUrl(r['document-uri'] ?? r.documentURL ?? r.documentUri),
    source: safeUrl(r['source-file'] ?? r.sourceFile),
    line: Number.isFinite(line) ? line : null,
    disposition: String(r.disposition ?? '').slice(0, 20),
  }
}

export function summarizeCspReports(payload: unknown): CspViolationSummary[] {
  const items = Array.isArray(payload) ? payload : [payload]
  const out: CspViolationSummary[] = []
  for (const item of items.slice(0, 10)) {
    const rec = item as Record<string, unknown> | null
    const body = rec?.['csp-report'] ?? rec?.body ?? rec
    const summary = summarizeOne(body)
    if (summary) out.push(summary)
  }
  return out
}
