'use client'
import Link from 'next/link'
import { useTeacherEntitlement } from './useTeacherEntitlement'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'

export default function TeacherPlanBanner() {
  const { entitlement, limited } = useTeacherEntitlement()
  const { t, locale } = useT()
  if (!entitlement) return null
  if (!limited) {
    if (entitlement.source !== 'invite_gold' && entitlement.source !== 'grant') return null
    return entitlement.expiresAt ? (
      <div role="status" style={{ margin: '10px auto', maxWidth: 1100, padding: '8px 14px', borderRadius: 12, background: 'var(--green-bg, #e4f1ec)', color: 'var(--green, #1f6f55)', fontSize: 13 }}>
        {t('✨ Altın öğretmen üyeliğin açık — {date} tarihine kadar tüm özellikler kullanılabilir.', { date: new Date(entitlement.expiresAt).toLocaleDateString(intlLocale(locale)) })}
      </div>
    ) : null
  }
  const { usage, limits } = entitlement
  const progress = Math.min(100, Math.round((entitlement.qualifyingStudents / entitlement.inviteTarget) * 100))
  return (
    <div role="status" style={{ margin: '10px auto', maxWidth: 1100, padding: '12px 16px', borderRadius: 14, background: 'var(--amber-bg, #fff4dc)', color: 'var(--text, #29241f)', fontSize: 13, lineHeight: 1.55 }}>
      {t('Ücretsiz öğretmen hesabı · Yapay zekâ ile oluşturma {a}/{b} · Canlı quiz bu ay {c}/{d} · Panel {n} öğrenci · PDF ve içe/dışa aktarma kapalı', { a: Math.min(usage.aiTotal, limits.aiGenerations), b: limits.aiGenerations, c: Math.min(usage.liveThisMonth, limits.liveQuizzesPerMonth), d: limits.liveQuizzesPerMonth, n: limits.dashboardStudents })}
      <div style={{ margin: '8px 0 4px', height: 8, borderRadius: 99, background: 'rgba(0,0,0,.08)', overflow: 'hidden' }} aria-hidden>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent, #df5c3f)' }} />
      </div>
      <span>{t('🎁 Öğrencilerin yıllık Altın üyelik alırsa: {cur}/{target} — {target} olunca sen de 1 yıl Altın olursun (tüm özellikler açık).', { cur: entitlement.qualifyingStudents, target: entitlement.inviteTarget })} </span>
      <Link href="/pricing" style={{ fontWeight: 700, textDecoration: 'underline' }}>{t("Altın'a geç")}</Link>
    </div>
  )
}
