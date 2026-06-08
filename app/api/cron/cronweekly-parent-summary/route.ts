import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Vercel Cron: Her Pazar 08:00'de çalışır
// vercel.json: { "crons": [{ "path": "/api/cron/weekly-parent-summary", "schedule": "0 8 * * 0" }] }
export async function GET(req: NextRequest) {
  // Cron güvenlik kontrolü
  const cronSecret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const weekStart = oneWeekAgo.toISOString()

  // Tüm velileri çek (parent_children kaydı olanlar)
  const { data: parentLinks } = await supabase
    .from('parent_children')
    .select('parent_id, child_id, profiles!parent_children_parent_id_fkey(email, name), profiles!parent_children_child_id_fkey(name, grade)')

  if (!parentLinks?.length) return NextResponse.json({ sent: 0 })

  // Parent'ları grupla
  const parentMap: Record<string, { email: string; name: string; children: any[] }> = {}
  for (const link of parentLinks) {
    const pid = link.parent_id
    const parentProfile = (link as any).profiles as any
    if (!parentMap[pid]) {
      parentMap[pid] = { email: parentProfile?.email || '', name: parentProfile?.name || 'Veli', children: [] }
    }
    parentMap[pid].children.push({ id: link.child_id, ...(link as any).profiles })
  }

  let sentCount = 0
  const results: any[] = []

  for (const [parentId, parent] of Object.entries(parentMap)) {
    if (!parent.email) continue

    const childSummaries = []

    for (const child of parent.children) {
      // Bu haftaki quiz istatistikleri
      const { data: sessions } = await supabase
        .from('quiz_sessions')
        .select('score, pct, question_count, topic, created_at')
        .eq('user_id', child.id)
        .eq('completed', true)
        .gte('created_at', weekStart)
        .order('created_at', { ascending: false })

      if (!sessions?.length) {
        childSummaries.push({ ...child, testCount: 0, avgPct: null, weakestTopic: null, sessions: [] })
        continue
      }

      const avgPct = Math.round(sessions.reduce((a, s) => a + s.pct, 0) / sessions.length)

      // En zayıf konu
      const topicScores: Record<string, { total: number; sum: number }> = {}
      sessions.forEach(s => {
        if (!topicScores[s.topic]) topicScores[s.topic] = { total: 0, sum: 0 }
        topicScores[s.topic].total++
        topicScores[s.topic].sum += s.pct
      })
      const weakestTopic = Object.entries(topicScores)
        .map(([topic, s]) => ({ topic, avg: Math.round(s.sum / s.total) }))
        .sort((a, b) => a.avg - b.avg)[0]?.topic || null

      childSummaries.push({ ...child, testCount: sessions.length, avgPct, weakestTopic, sessions: sessions.slice(0, 3) })
    }

    // E-posta HTML içeriği oluştur
    const emailHtml = buildEmailHtml(parent.name, childSummaries)
    const emailText = buildEmailText(parent.name, childSummaries)

    // Resend ile gönder (ya da istersen SMTP)
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Pratium <ozet@pratium.com>',
          to: [parent.email],
          subject: `📊 Haftalık Özet — ${childSummaries.map(c => c.name).join(', ')}`,
          html: emailHtml,
          text: emailText,
        }),
      })

      if (emailRes.ok) {
        sentCount++
        // Bildirim kaydı
        await supabase.from('notifications').insert({
          user_id: parentId,
          type: 'weekly_summary',
          title: '📊 Haftalık özet gönderildi',
          body: `${childSummaries.length} çocuğun için haftalık özet e-postanı gönderdik.`,
          read: false,
        })
        results.push({ parentId, email: parent.email, status: 'sent' })
      } else {
        results.push({ parentId, email: parent.email, status: 'failed' })
      }
    } catch (e) {
      results.push({ parentId, email: parent.email, status: 'error', error: String(e) })
    }
  }

  return NextResponse.json({ sent: sentCount, total: Object.keys(parentMap).length, results })
}

function buildEmailHtml(parentName: string, children: any[]): string {
  const rows = children.map(child => {
    if (child.testCount === 0) {
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
          <strong>${child.name}</strong> (${child.grade})<br>
          <span style="color:#94a3b8;font-size:13px">Bu hafta quiz çözülmedi</span>
        </td>
      </tr>`
    }
    const color = child.avgPct >= 70 ? '#16a34a' : child.avgPct >= 50 ? '#d97706' : '#dc2626'
    return `<tr>
      <td style="padding:16px 0;border-bottom:1px solid #e2e8f0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong style="font-size:15px;color:#082465">${child.name}</strong>
            <span style="font-size:12px;color:#94a3b8;margin-left:8px">${child.grade}</span>
          </div>
          <div style="font-size:24px;font-weight:900;color:${color}">%${child.avgPct}</div>
        </div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">
          📝 ${child.testCount} test çözüldü
          ${child.weakestTopic ? `· ⚠️ En zayıf konu: <strong>${child.weakestTopic}</strong>` : ''}
        </div>
        ${child.sessions.length > 0 ? `
        <div style="margin-top:8px;font-size:12px;color:#94a3b8">
          Son testler: ${child.sessions.map((s: any) => `${s.topic} (%${s.pct})`).join(' · ')}
        </div>` : ''}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#082465,#1ECFB8);padding:32px 24px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📊</div>
      <div style="font-size:22px;font-weight:800;color:#fff">Haftalık Öğrenme Özeti</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:4px">Merhaba ${parentName}!</div>
    </div>
    <div style="padding:24px">
      <p style="color:#64748b;font-size:14px;margin:0 0 20px">Geçen haftaki öğrenme aktiviteleri aşağıda:</p>
      <table style="width:100%;border-collapse:collapse">
        ${rows}
      </table>
      <div style="margin-top:24px;text-align:center">
        <a href="https://pratium.com/parent" style="display:inline-block;padding:12px 24px;background:#082465;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">
          Detaylı Raporu Gör →
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;text-align:center;font-size:12px;color:#94a3b8">
      Pratium · pratium.com · <a href="https://pratium.com/unsubscribe" style="color:#94a3b8">E-postayı durdur</a>
    </div>
  </div>
</body>
</html>`
}

function buildEmailText(parentName: string, children: any[]): string {
  const lines = children.map(child => {
    if (child.testCount === 0) return `${child.name}: Bu hafta quiz çözülmedi.`
    return `${child.name}: ${child.testCount} test, %${child.avgPct} ortalama${child.weakestTopic ? `, zayıf konu: ${child.weakestTopic}` : ''}`
  })
  return `Merhaba ${parentName}!\n\nHaftalık özet:\n\n${lines.join('\n')}\n\nDetay: https://pratium.com/parent`
}
