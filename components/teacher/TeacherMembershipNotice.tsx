import { FREE_TEACHER_LIMITS, TEACHER_INVITE_TARGET } from '@/lib/teacher-entitlements'

/** Public announcement of the teacher membership rules; numbers come from the policy file. */
export default function TeacherMembershipNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-label="Öğretmen üyelik koşulları" style={{ margin: compact ? '0 0 1.25rem' : '0 0 2rem', padding: compact ? '14px 16px' : '18px 20px', borderRadius: 16, border: '1px solid #e8d7b0', background: '#fff8e6', color: '#3a2f1c', fontSize: compact ? 13 : 14, lineHeight: 1.7 }}>
      <strong style={{ display: 'block', fontSize: compact ? 14 : 16, marginBottom: 6 }}>🎁 Öğretmen üyeliği: {TEACHER_INVITE_TARGET} öğrenci getir, 1 yıl Altın senin olsun</strong>
      <p style={{ margin: '0 0 8px' }}>
        Kuruma bağlı olmayan öğretmenler ücretsiz başlar. Sınıfına davet ettiğin <strong>{TEACHER_INVITE_TARGET} öğrenci yıllık Altın üyelik</strong> alırsa,
        sen de <strong>1 yıl boyunca Altın üye</strong> olursun ve tüm öğretmen özellikleri açılır. Altın planı doğrudan satın alarak da tam erişim kazanabilirsin.
      </p>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Ücretsiz öğretmen hesabında:</p>
      <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
        <li>Yapay zekâ ile oluşturma: toplam {FREE_TEACHER_LIMITS.aiGenerations} adet</li>
        <li>Canlı quiz: ayda {FREE_TEACHER_LIMITS.liveQuizzesPerMonth} adet</li>
        <li>Sınıf paneli: en fazla {FREE_TEACHER_LIMITS.dashboardStudents} öğrenci ve temel raporlar</li>
        <li>PDF/basılı çıktı ile kâğıt cevap ve not içe aktarma: Altın üyelikte açılır</li>
      </ul>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Sayılan öğrenciler: ödemesi yapılmış, aktif, yıllık Altın veya Platin üyeliği olan ve senin sınıfındaki farklı öğrencilerdir.</p>
    </section>
  )
}
