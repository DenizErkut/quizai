import { NextRequest, NextResponse } from 'next/server'
import { allowByIp } from '@/lib/ip-throttle'
import { summarizeCspReports } from '@/lib/csp-report'

// Tarayıcıların CSP ihlal raporlarını topladığı uç (kimlik doğrulaması yoktur; tarayıcı çerezsiz gönderir).
// Yalnızca kısaltılmış kayıtlar Vercel günlüğüne yazılır; her zaman 204 döner.
export async function POST(req: NextRequest) {
  if (!allowByIp(req, 'csp-report', 60)) return new NextResponse(null, { status: 204 })
  try {
    const text = (await req.text()).slice(0, 16_000)
    const reports = summarizeCspReports(JSON.parse(text))
    for (const report of reports) console.warn('[csp-report]', JSON.stringify(report))
  } catch { /* geçersiz gövde yok sayılır */ }
  return new NextResponse(null, { status: 204 })
}
