// lib/parent-risk-alert.ts
// Faz 5 (Parent Agent) — roadmap karşılaştırma raporunun kalan açık
// maddesi: "riskli konu proaktif bildirim (haftalık özetten bağımsız,
// anlık push/email tetikleme)". app/api/save-quiz'den, her quiz
// tamamlandığında çağrılır — haftalık cron'u (pazar 08:00) beklemeden,
// bir konu "riskli" hâle gelir gelmez veliye hemen haber verir.
import { SupabaseClient } from '@supabase/supabase-js'
import { computeTopicMastery } from './mastery'
import { analyzeTrend } from './predictive-risk'
import { generateActionSentence } from './parent-action-sentence'
import { sendResendEmail } from './parent-summary'
import { getIdentityBySupabaseId, getIdentitiesBySupabaseIds } from './identity/client'

// export edildi: veli panelindeki "Erken Uyarılar" sekmesi (app/parent/page.tsx)
// aynı eşikleri kullanarak AYNI risk sınıflandırmasını (reaktif/öngörü) canlı
// gösteriyor — e-posta/bildirimle sınırlı kalmasın diye, tek kaynaktan.
export const RISK_THRESHOLD = 35    // bu mastery skorunun altı "riskli" sayılır
export const RECOVERY_THRESHOLD = 50 // bu skorun üstüne çıkınca "toparlandı" sayılır

// Bir quiz tamamlandıktan sonra çağrılır. İki AYRI tetikleyici yolu var:
//
// 1) REAKTİF (Faz 5): mastery skoru ZATEN riskli eşiğin altına düştü.
// 2) ÖNGÖRÜCÜ (Faz 11 — Predictive Learning): mastery henüz riskli eşiğe
//    düşmemiş olsa bile, SON TESTLERİN EĞİLİMİ kötüye gidiyorsa (roadmap:
//    "Son 10 test → Başarı düşüyor → ... → SYSTEM ALERT") erken uyarılır.
//    Bu, "zaten kötü" ile "kötüye gidiyor" arasındaki farkı yakalıyor —
//    ikincisi gerçek bir ÖNGÖRÜ, sorun oluşmadan önce müdahale imkanı verir.
//
// İkisi de AYNI risk_notified bayrağını paylaşır (tekrar tekrar bildirim
// göndermemek için) — öngörücü uyarı zaten gönderildiyse, durum sonradan
// gerçekten reaktif eşiğe düşse bile ikinci bir bildirim gitmez.
export async function checkAndNotifyRiskyTopic(
  supabase: SupabaseClient,
  studentId: string,
  topic: string
): Promise<void> {
  const { data: wt } = await supabase
    .from('weak_topics')
    .select('id, wrong_count, total_count, last_seen_at, risk_notified')
    .eq('user_id', studentId)
    .eq('topic', topic)
    .maybeSingle()
  if (!wt) return

  const mastery = computeTopicMastery(wt as any)
  if (mastery.totalCount < 3) return // çok az veriyle bildirim gürültülü olur

  // Toparlanma: risk artık geçmişse ve daha önce bildirilmişse sıfırla
  if (mastery.masteryScore >= RECOVERY_THRESHOLD) {
    if (wt.risk_notified) {
      await supabase.from('weak_topics').update({ risk_notified: false }).eq('id', wt.id)
    }
    return
  }

  if (wt.risk_notified) return // bu risk döneminde (reaktif ya da öngörücü) zaten bildirildi

  let alertKind: 'reaktif' | 'ongoru' | null = null
  if (mastery.masteryScore < RISK_THRESHOLD) {
    alertKind = 'reaktif'
  } else {
    // Faz 11: henüz reaktif eşiğe düşmedi ama TREND kötüye gidiyorsa erken uyar
    try {
      const trend = await analyzeTrend(supabase, studentId, topic)
      if (trend?.decliningTowardRisk) alertKind = 'ongoru'
    } catch { /* trend analizi opsiyonel, hata olursa sessiz geç */ }
  }
  if (!alertKind) return

  const { data: links } = await supabase
    .from('parent_children').select('parent_id').eq('child_id', studentId)
  if (!links?.length) return // velisi yoksa bildirilecek kimse yok

  try {
    const studentIdentity = await getIdentityBySupabaseId(studentId)
    const childName = studentIdentity?.full_name || 'Öğrenci'
    const parentIds = [...new Set(links.map((l: any) => l.parent_id))]
    const parentIdentities = await getIdentitiesBySupabaseIds(parentIds)

    const actionSentence = await generateActionSentence(childName, topic, mastery.masteryScore, mastery.forgettingRisk)
    const subject = alertKind === 'ongoru'
      ? `📉 ${childName} — ${topic} konusunda gidişat kötüleşiyor`
      : `⚠️ ${childName} — ${topic} konusunda destek zamanı`

    let anySent = false
    for (const parentId of parentIds) {
      const parentIdentity = (parentIdentities as any)[parentId]
      const parentEmail = parentIdentity?.email
      if (!parentEmail) continue

      const html = buildRiskAlertEmailHtml(childName, topic, actionSentence, alertKind)
      const ok = await sendResendEmail(parentEmail, subject, html)
      if (ok) {
        anySent = true
        await supabase.from('notifications').insert({
          user_id: parentId,
          type: alertKind === 'ongoru' ? 'predictive_alert' : 'risk_alert',
          title: subject,
          body: actionSentence,
          read: false,
          data: { href: '/parent' },
        })
      }
    }

    // En az bir veliye ulaşıldıysa bu risk dönemi için "bildirildi" işaretle
    // — hiçbirine ulaşılamadıysa (ör. e-posta yok) tekrar denenebilsin diye
    // işaretlemiyoruz.
    if (anySent) {
      await supabase.from('weak_topics').update({ risk_notified: true }).eq('id', wt.id)
    }
  } catch (e: any) {
    console.error('[parent-risk-alert] hata:', e.message)
    // Bildirim başarısız olsa bile quiz kaydını etkilememeli — save-quiz
    // çağıran taraf bu hatayı yutmalı (fire-and-forget mantığı).
  }
}

function buildRiskAlertEmailHtml(childName: string, topic: string, actionSentence: string, alertKind: 'reaktif' | 'ongoru'): string {
  const headline = alertKind === 'ongoru' ? `${childName} İçin Erken Uyarı` : `${childName} İçin Destek Zamanı`
  const bodyText = alertKind === 'ongoru'
    ? `<strong>${topic}</strong> konusundaki son test sonuçlarına bakıldığında performansının düşme eğiliminde olduğu görülüyor — henüz kritik seviyede değil, ama gidişat bu şekilde devam ederse önümüzdeki günlerde bu konuda zorlanma riski artabilir.`
    : `<strong>${topic}</strong> konusunda son çözdüğü sorularda zorlandığı görülüyor.`
  const icon = alertKind === 'ongoru' ? '📉' : '⚠️'

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#dc2626,#f59e0b);padding:28px 24px;text-align:center">
      <div style="font-size:28px;margin-bottom:6px">${icon}</div>
      <div style="font-size:19px;font-weight:800;color:#fff">${headline}</div>
    </div>
    <div style="padding:24px">
      <p style="color:#334155;font-size:14.5px;line-height:1.6;margin:0 0 16px">${bodyText}</p>
      <div style="padding:14px 16px;background:#fef3c7;border-radius:10px;font-size:14px;color:#78350f;margin-bottom:20px">💡 ${actionSentence}</div>
      <a href="https://pratium.com/parent" style="display:inline-block;padding:12px 24px;background:#082465;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Detaylı Raporu Gör →</a>
    </div>
    <div style="background:#f8fafc;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8">Pratium · Bu, haftalık özetten bağımsız, anlık bir uyarıdır.</div>
  </div></body></html>`
}
