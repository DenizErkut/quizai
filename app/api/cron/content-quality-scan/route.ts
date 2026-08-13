// app/api/cron/content-quality-scan/route.ts
// Vercel Cron — günlük çalışır (bkz. vercel.json). Sistematik içerik
// kalite örneklemesi (Faz sonrası öneri #4): son 24 saatte tamamlanmış
// quiz oturumlarından bir örneklem alır, GPT-4o (Claude'un ürettiğini
// bağımsız bir modelle) bilinen kural ihlallerine (görünmeyen metne
// atıf, ders kitabı künyesi, konu dışı kaçış, zincirli soru referansı,
// kelime seviyesi, cevap tutarsızlığı) karşı tarar. Bulunan sorunlar
// error_reports'a source='system_scan' olarak eklenir — öğretmenin
// "Hata Bildirimleri" panelinde, kullanıcı bildirimleriyle YAN YANA
// görünür, ayrı bir sistem gerekmez.
//
// Maliyet kontrolü: en fazla 15 oturum, oturum başına en fazla 6 soru
// (=en fazla 90 soru/gün) taranır — sonsuz büyüyen bir maliyet riski
// yaratmadan, gerçek bir örneklem sağlar.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanQuestionsForQualityIssues, QualityIssue } from '@/lib/content-quality-scan'

export const maxDuration = 120
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_SESSIONS = 15
const MAX_QUESTIONS_PER_SESSION = 6

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Son 24 saatte tamamlanmış oturumlardan rastgele bir örneklem.
    // Not: PostgREST'te native RANDOM() ORDER BY yok — yeterince büyük
    // bir havuzdan (limit 200) çekip JS tarafında karıştırıyoruz.
    const { data: pool } = await supabaseAdmin
      .from('quiz_sessions')
      .select('id, topic, grade, questions, created_at')
      .eq('completed', true)
      .gte('created_at', since)
      .not('questions', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!pool || pool.length === 0) {
      return NextResponse.json({ scanned: 0, flagged: 0, note: 'Son 24 saatte taranacak oturum yok.' })
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const sample = shuffled.slice(0, MAX_SESSIONS)

    let totalScanned = 0
    let totalFlagged = 0
    const flaggedSummary: string[] = []

    for (const session of sample) {
      const questions = Array.isArray(session.questions) ? session.questions : []
      if (!questions.length) continue

      const forScan = questions.slice(0, MAX_QUESTIONS_PER_SESSION).map((q: any, i: number) => ({
        index: i, q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, type: q.type,
      }))
      totalScanned += forScan.length

      let issues: QualityIssue[] = []
      try {
        issues = await scanQuestionsForQualityIssues(session.topic || '', session.grade || '', forScan)
      } catch (e) {
        console.warn(`[content-quality-scan] Oturum ${session.id} taranamadı:`, e)
        continue
      }

      for (const issue of issues) {
        const q = questions[issue.questionIndex]
        if (!q) continue
        await supabaseAdmin.from('error_reports').insert({
          user_id: null,
          question_text: q.q,
          correct_answer: q.exp || null,
          user_answer: null,
          topic: session.topic,
          status: 'pending',
          source: 'system_scan',
          issue_type: issue.issueType,
          admin_note: `[${issue.severity === 'high' ? '🔴 Yüksek' : '🟡 Orta'}] ${issue.reason}`,
        })
        totalFlagged++
        flaggedSummary.push(`${session.topic}: ${issue.issueType}`)
      }

      // API'yi art arda çok hızlı çağırmamak için küçük bir bekleme
      await new Promise(r => setTimeout(r, 300))
    }

    // Sorun bulunduysa admin(ler)e bildirim bırak
    if (totalFlagged > 0) {
      const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true)
      for (const admin of admins || []) {
        await supabaseAdmin.from('notifications').insert({
          user_id: admin.id,
          type: 'content_quality_scan',
          title: '🔍 Otomatik içerik taraması sorun buldu',
          body: `Günlük tarama ${totalScanned} soru içinden ${totalFlagged} tanesinde olası kalite sorunu buldu. Hata Bildirimleri panelinden inceleyebilirsin.`,
          read: false,
          data: { href: '/admin' },
        })
      }
    }

    return NextResponse.json({
      scanned: totalScanned,
      sessionsChecked: sample.length,
      flagged: totalFlagged,
      summary: flaggedSummary,
    })
  } catch (e: any) {
    console.error('[content-quality-scan] Hata:', e)
    return NextResponse.json({ error: e.message || 'Tarama başarısız.' }, { status: 500 })
  }
}
