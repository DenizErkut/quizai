'use client'
import Link from 'next/link'
import { useTeacherEntitlement } from './useTeacherEntitlement'

export default function TeacherPlanBanner() {
  const { entitlement, limited } = useTeacherEntitlement()
  if (!entitlement) return null
  if (!limited) {
    if (entitlement.source !== 'invite_gold' && entitlement.source !== 'grant') return null
    return entitlement.expiresAt ? (
      <div role="status" style={{ margin: '10px auto', maxWidth: 1100, padding: '8px 14px', borderRadius: 12, background: 'var(--green-bg, #e4f1ec)', color: 'var(--green, #1f6f55)', fontSize: 13 }}>
        ✨ Altın öğretmen üyeliğin açık — {new Date(entitlement.expiresAt).toLocaleDateString('tr-TR')} tarihine kadar tüm özellikler kullanılabilir.
      </div>
    ) : null
  }
  const { usage, limits } = entitlement
  const progress = Math.min(100, Math.round((entitlement.qualifyingStudents / entitlement.inviteTarget) * 100))
  return (
    <div role="status" style={{ margin: '10px auto', maxWidth: 1100, padding: '12px 16px', borderRadius: 14, background: 'var(--amber-bg, #fff4dc)', color: 'var(--text, #29241f)', fontSize: 13, lineHeight: 1.55 }}>
      <strong>Ücretsiz öğretmen hesabı</strong> · Yapay zekâ ile oluşturma {Math.min(usage.aiTotal, limits.aiGenerations)}/{limits.aiGenerations} · Canlı quiz bu ay {Math.min(usage.liveThisMonth, limits.liveQuizzesPerMonth)}/{limits.liveQuizzesPerMonth} · Panel {limits.dashboardStudents} öğrenci · PDF ve içe/dışa aktarma kapalı
      <div style={{ margin: '8px 0 4px', height: 8, borderRadius: 99, background: 'rgba(0,0,0,.08)', overflow: 'hidden' }} aria-hidden>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent, #df5c3f)' }} />
      </div>
      <span>🎁 Öğrencilerin yıllık Altın üyelik alırsa: <strong>{entitlement.qualifyingStudents}/{entitlement.inviteTarget}</strong> — {entitlement.inviteTarget} olunca sen de 1 yıl Altın olursun (tüm özellikler açık). </span>
      <Link href="/pricing" style={{ fontWeight: 700, textDecoration: 'underline' }}>Altın&apos;a geç</Link>
    </div>
  )
}
