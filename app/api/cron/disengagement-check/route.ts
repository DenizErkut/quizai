// app/api/cron/disengagement-check/route.ts
// Faz 11'in kalan tahmin modeli: öğrenci disengagement riski. Diğer
// risk kontrollerinden (parent-risk-alert.ts) FARKLI olarak bu, quiz
// tamamlandığında değil PERİYODİK olarak çalışmalı — mantık gereği:
// eğer öğrenci disengaging oluyorsa, zaten quiz TAMAMLAMIYOR demektir,
// "quiz tamamlanınca kontrol et" tetikleyicisi hiç çalışmaz. Bu yüzden
// vercel.json'da ayrı, zamanlanmış bir cron olarak kuruldu (haftada 2,
// weekly-parent-summary/weekly-plan-refresh'ten farklı günlerde).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkDisengagement } from '@/lib/disengagement-risk'
import { sendResendEmail } from '@/lib/parent-summary'
import { getIdentityBySupabaseId, getIdentitiesBySupabaseIds } from '@/lib/identity/client'

export const maxDuration = 120
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RENOTIFY_AFTER_DAYS = 14

function buildDisengagementEmailHtml(childName: string, daysSinceLastActivity: number, priorWeeklyAvg: number): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#082465,#1ECFB8);padding:28px 24px;text-align:center">
      <div style="font-size:28px;margin-bottom:6px">📉</div>
      <div style="font-size:19px;font-weight:800;color:#fff">${childName} Bir Süredir Görünmüyor</div>
    </div>
    <div style="padding:24px">
      <p style="color:#334155;font-size:14.5px;line-height:1.6;margin:0 0 16px">
        ${childName}, daha önce düzenli pratik yapıyordu (haftada ortalama ${priorWeeklyAvg} test) ama
        <strong>${daysSinceLastActivity} gündür</strong> Pratium'a hiç giriş yapmadı. Bu, akademik bir sorun değil —
        sadece rutinin bozulmuş olabileceğine dair erken bir sinyal.
      </p>
      <div style="padding:14px 16px;background:#eff6ff;border-radius:10px;font-size:14px;color:#1e3a8a;margin-bottom:20px">
        💡 Kısa bir hatırlatma veya birlikte 5 dakikalık bir test çözmek, rutini yeniden başlatmaya yardımcı olabilir.
      </div>
      <a href="https://pratium.com/parent" style="display:inline-block;padding:12px 24px;background:#082465;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Durumu Gör →</a>
    </div>
    <div style="background:#f8fafc;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8">Pratium · Bu bildirimi en fazla 14 günde bir alırsınız.</div>
  </div></body></html>`
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  try {
    // Sadece velisi olan öğrenciler kontrol edilir — velisi yoksa
    // bildirilecek kimse yok, gereksiz hesaplama yapılmaz.
    const { data: links } = await supabaseAdmin
      .from('parent_children')
      .select('child_id, parent_id')

    if (!links || links.length === 0) {
      return NextResponse.json({ checked: 0, flagged: 0, note: 'Veli bağlantısı olan öğrenci yok.' })
    }

    const childToParents = new Map<string, string[]>()
    for (const l of links as any[]) {
      const arr = childToParents.get(l.child_id) || []
      arr.push(l.parent_id)
      childToParents.set(l.child_id, arr)
    }
    const childIds = [...childToParents.keys()]

    // disengagement_notified_at'i son 14 günden yakın olanları hariç
    // tutmak için hepsini tek sorguda çek.
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, disengagement_notified_at')
      .in('id', childIds)

    const notifiedMap = new Map<string, string | null>()
    for (const p of profiles || []) notifiedMap.set(p.id, (p as any).disengagement_notified_at)

    let checked = 0
    let flagged = 0
    let recovered = 0

    for (const childId of childIds) {
      checked++
      const signal = await checkDisengagement(supabaseAdmin, childId)

      const lastNotified = notifiedMap.get(childId)
      const daysSinceNotified = lastNotified ? Math.floor((Date.now() - new Date(lastNotified).getTime()) / (24 * 60 * 60 * 1000)) : Infinity

      if (!signal.isDisengaging) {
        // Toparlanmış — daha önce bildirildiyse bayrağı sıfırla ki
        // ileride tekrar disengaging olursa yeniden bildirebilelim.
        if (lastNotified) {
          await supabaseAdmin.from('profiles').update({ disengagement_notified_at: null }).eq('id', childId)
          recovered++
        }
        continue
      }

      if (daysSinceNotified < RENOTIFY_AFTER_DAYS) continue // yakın zamanda zaten bildirildi

      const parentIds = childToParents.get(childId) || []
      if (!parentIds.length) continue

      try {
        const childIdentity = await getIdentityBySupabaseId(childId)
        const childName = childIdentity?.full_name || 'Öğrenci'
        const parentIdentities = await getIdentitiesBySupabaseIds(parentIds)
        const subject = `📉 ${childName} bir süredir görünmüyor`
        const html = buildDisengagementEmailHtml(childName, signal.daysSinceLastActivity, signal.priorWeeklyAvg)

        let anySent = false
        for (const parentId of parentIds) {
          const parentEmail = (parentIdentities as any)[parentId]?.email
          if (!parentEmail) continue
          const ok = await sendResendEmail(parentEmail, subject, html)
          if (ok) {
            anySent = true
            await supabaseAdmin.from('notifications').insert({
              user_id: parentId,
              type: 'disengagement_alert',
              title: subject,
              body: `${childName}, ${signal.daysSinceLastActivity} gündür pratik yapmadı (önceki dönemde haftada ortalama ${signal.priorWeeklyAvg} test çözüyordu).`,
              read: false,
              data: { href: '/parent' },
            })
          }
        }

        if (anySent) {
          await supabaseAdmin.from('profiles').update({ disengagement_notified_at: new Date().toISOString() }).eq('id', childId)
          flagged++
        }
      } catch (e) {
        console.warn(`[disengagement-check] Öğrenci ${childId} için bildirim başarısız:`, e)
      }

      // Art arda çok hızlı e-posta göndermemek için küçük bekleme
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json({ checked, flagged, recovered })
  } catch (e: any) {
    console.error('[disengagement-check] Hata:', e)
    return NextResponse.json({ error: e.message || 'Kontrol başarısız.' }, { status: 500 })
  }
}
