// app/api/cron/weekly-parent-summary/route.ts
// Vercel Cron: her pazar 08:00'de çalışır (bkz. vercel.json)
// EKSİK OLAN, HİÇ ÇALIŞMAYAN route buydu — vercel.json'da zamanlanmış ama
// karşılığı hiç yazılmamıştı, bu yüzden hiçbir veliye otomatik haftalık özet
// gitmiyordu. computeParentWeeklySummary/buildParentSummaryEmailHtml,
// app/api/parent/send-summary (manuel/tek-veli tetikleme) ile paylaşılıyor —
// bkz. lib/parent-summary.ts.
//
// Davranış notu: bu hafta hiç test çözmeyen (testCount=0, TÜM çocuklar için)
// veliye e-posta GÖNDERİLMİYOR — boş/aktivitesiz haftalarda spam gibi
// hissettirmemek için bilinçli bir tercih. Veli isterse zaten
// /api/parent/send-summary ile manuel isteyebiliyor (o her zaman gönderir).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { computeParentWeeklySummary, buildParentSummaryEmailHtml, sendResendEmail } from '@/lib/parent-summary'

export const maxDuration = 120
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  // Çocuğu olan tüm velileri bul (distinct parent_id)
  const { data: parentLinks } = await supabaseAdmin
    .from('parent_children')
    .select('parent_id')

  const parentIds = [...new Set((parentLinks ?? []).map((l: any) => l.parent_id))]
  if (!parentIds.length) {
    return NextResponse.json({ ok: true, parentsChecked: 0, emailsSent: 0, skipped: 0, failed: 0 })
  }

  // Tüm velilerin ve tüm çocukların kimliklerini TEK seferde toplu çöz
  // (N+1 sorgu yerine — çok sayıda veli olduğunda cron süresini kısa tutar)
  const { data: allChildLinks } = await supabaseAdmin
    .from('parent_children')
    .select('parent_id, child_id')
  const allChildIds = [...new Set((allChildLinks ?? []).map((l: any) => l.child_id))]

  const [parentIdentities, childIdentities] = await Promise.all([
    getIdentitiesBySupabaseIds(parentIds),
    getIdentitiesBySupabaseIds(allChildIds),
  ])

  const childNames: Record<string, string> = {}
  for (const [id, identity] of Object.entries(childIdentities)) {
    childNames[id] = (identity as any)?.full_name || 'Öğrenci'
  }

  let emailsSent = 0, skipped = 0, failed = 0

  for (const parentId of parentIds) {
    try {
      const parentIdentity = (parentIdentities as any)[parentId]
      const parentEmail = parentIdentity?.email
      const parentName = parentIdentity?.full_name || 'Veli'
      if (!parentEmail) { skipped++; continue }

      const childSummaries = await computeParentWeeklySummary(supabaseAdmin, parentId, childNames)
      const hasActivity = childSummaries.some(c => c.testCount > 0)
      if (!hasActivity) { skipped++; continue }

      const html = buildParentSummaryEmailHtml(parentName, childSummaries)
      const ok = await sendResendEmail(
        parentEmail,
        `📊 Haftalık Özet — ${childSummaries.map(c => c.name).join(', ')}`,
        html
      )
      if (ok) {
        emailsSent++
        // Uygulama içi bildirim — veli girişte "özet gönderildi" görsün
        await supabaseAdmin.from('notifications').insert({
          user_id: parentId,
          type: 'weekly_summary',
          title: '📊 Haftalık özet gönderildi',
          body: `${childSummaries.length} çocuğun için haftalık özet e-postanı gönderdik.`,
          read: false,
          data: { href: '/parent' },
        })
      }
      else failed++
    } catch (e: any) {
      console.error('[weekly-parent-summary] parent hatasi:', parentId, e.message)
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    parentsChecked: parentIds.length,
    emailsSent,
    skipped,
    failed,
  })
}
