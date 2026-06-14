// app/api/parent/send-summary/route.ts
// Veli kendi isteğiyle haftalık özet e-postası isteyebilir
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Velinin e-postasını al
  const { data: parentProfile } = await adminDb
    .from('profiles').select('name, email').eq('id', user.id).single()
  if (!parentProfile?.email) return NextResponse.json({ error: 'E-posta bulunamadı' }, { status: 400 })

  // Çocukları al
  const { data: links } = await adminDb
    .from('parent_children').select('child_id, profiles!parent_children_child_id_fkey(name, grade)')
    .eq('parent_id', user.id)

  if (!links?.length) return NextResponse.json({ error: 'Çocuk bulunamadı' }, { status: 400 })

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const childSummaries = []
  for (const link of links) {
    const childProfile = (link as any).profiles
    const { data: sessions } = await adminDb
      .from('quiz_sessions').select('score, pct, question_count, topic, created_at')
      .eq('user_id', link.child_id).eq('completed', true)
      .gte('created_at', oneWeekAgo.toISOString())
      .order('created_at', { ascending: false })

    if (!sessions?.length) {
      childSummaries.push({ name: childProfile?.name, grade: childProfile?.grade, testCount: 0, avgPct: null, weakestTopic: null, sessions: [] })
      continue
    }

    const avgPct = Math.round(sessions.reduce((a, s) => a + s.pct, 0) / sessions.length)
    const topicScores: Record<string, {total: number; sum: number}> = {}
    sessions.forEach(s => {
      if (!topicScores[s.topic]) topicScores[s.topic] = { total: 0, sum: 0 }
      topicScores[s.topic].total++; topicScores[s.topic].sum += s.pct
    })
    const weakestTopic = Object.entries(topicScores)
      .map(([topic, s]) => ({ topic, avg: Math.round(s.sum/s.total) }))
      .sort((a,b) => a.avg - b.avg)[0]?.topic || null

    childSummaries.push({ name: childProfile?.name, grade: childProfile?.grade, testCount: sessions.length, avgPct, weakestTopic, sessions: sessions.slice(0,3) })
  }

  // E-posta gönder
  const emailHtml = buildEmailHtml(parentProfile.name, childSummaries)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'Pratium <ozet@pratium.com>',
      to: [parentProfile.email],
      subject: `📊 Haftalık Özet — ${childSummaries.map(c => c.name).join(', ')}`,
      html: emailHtml,
    })
  })

  if (!res.ok) return NextResponse.json({ error: 'E-posta gönderilemedi' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function buildEmailHtml(parentName: string, children: any[]): string {
  const rows = children.map(child => {
    if (child.testCount === 0) return `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0"><strong>${child.name}</strong><br><span style="color:#94a3b8;font-size:13px">Bu hafta quiz çözülmedi</span></td></tr>`
    const color = child.avgPct >= 75 ? '#16a34a' : child.avgPct >= 50 ? '#d97706' : '#dc2626'
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong style="font-size:15px;color:#082465">${child.name}</strong><span style="font-size:12px;color:#94a3b8;margin-left:8px">${child.grade}</span></div>
        <div style="font-size:28px;font-weight:900;color:${color}">%${child.avgPct}</div>
      </div>
      <div style="margin-top:8px;font-size:13px;color:#64748b">📝 ${child.testCount} test${child.weakestTopic ? ` · ⚠️ Zayıf konu: <strong>${child.weakestTopic}</strong>` : ''}</div>
      ${child.sessions.length ? `<div style="margin-top:6px;font-size:12px;color:#94a3b8">Son testler: ${child.sessions.map((s: any) => `${s.topic} (%${s.pct})`).join(' · ')}</div>` : ''}
    </td></tr>`
  }).join('')

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#082465,#1ECFB8);padding:32px 24px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📊</div>
      <div style="font-size:22px;font-weight:800;color:#fff">Haftalık Öğrenme Özeti</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:4px">Merhaba ${parentName}!</div>
    </div>
    <div style="padding:24px">
      <p style="color:#64748b;font-size:14px;margin:0 0 20px">Geçen haftaki öğrenme aktiviteleri:</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="margin-top:24px;text-align:center">
        <a href="https://pratium.com/parent" style="display:inline-block;padding:12px 24px;background:#082465;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Detaylı Raporu Gör →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;text-align:center;font-size:12px;color:#94a3b8">
      Pratium · pratium.com
    </div>
  </div></body></html>`
}
