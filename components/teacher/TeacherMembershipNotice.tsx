'use client'
import { useT } from '@/lib/i18n/I18nProvider'
import { FREE_TEACHER_LIMITS, TEACHER_INVITE_TARGET } from '@/lib/teacher-entitlements'

/** Public announcement of the teacher membership rules; numbers come from the policy file. */
export default function TeacherMembershipNotice({ compact = false }: { compact?: boolean }) {
  const { t: tr } = useT()
  return (
    <section aria-label={tr('Öğretmen üyelik koşulları')} style={{ margin: compact ? '0 0 1.25rem' : '0 0 2rem', padding: compact ? '14px 16px' : '18px 20px', borderRadius: 16, border: '1px solid #e8d7b0', background: '#fff8e6', color: '#3a2f1c', fontSize: compact ? 13 : 14, lineHeight: 1.7 }}>
      <strong style={{ display: 'block', fontSize: compact ? 14 : 16, marginBottom: 6 }}>{tr('🎁 Öğretmen üyeliği: {n} öğrenci getir, 1 yıl Altın senin olsun', { n: TEACHER_INVITE_TARGET })}</strong>
      <p style={{ margin: '0 0 8px' }}>
        {tr('Kuruma bağlı olmayan öğretmenler ücretsiz başlar. Sınıfına davet ettiğin {n} öğrenci yıllık Altın üyelik alırsa, sen de 1 yıl boyunca Altın üye olursun ve tüm öğretmen özellikleri açılır. Altın planı doğrudan satın alarak da tam erişim kazanabilirsin.', { n: TEACHER_INVITE_TARGET })}
      </p>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{tr('Ücretsiz öğretmen hesabında:')}</p>
      <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
        <li>{tr('Yapay zekâ ile oluşturma: toplam {n} adet', { n: FREE_TEACHER_LIMITS.aiGenerations })}</li>
        <li>{tr('Canlı quiz: ayda {n} adet', { n: FREE_TEACHER_LIMITS.liveQuizzesPerMonth })}</li>
        <li>{tr('Sınıf paneli: en fazla {n} öğrenci ve temel raporlar', { n: FREE_TEACHER_LIMITS.dashboardStudents })}</li>
        <li>{tr('PDF/basılı çıktı ile kâğıt cevap ve not içe aktarma: Altın üyelikte açılır')}</li>
      </ul>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{tr('Sayılan öğrenciler: ödemesi yapılmış, aktif, yıllık Altın veya Platin üyeliği olan ve senin sınıfındaki farklı öğrencilerdir.')}</p>
    </section>
  )
}
