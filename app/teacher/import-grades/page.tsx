'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import GradeImportWizard from '@/components/GradeImportWizard'
import { createClient } from '@/lib/supabase/client'

export default function TeacherImportGradesPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login/teacher'); return }
      // .single() yerine .maybeSingle() — kayıt yoksa hata FIRLATMAZ, null
      // döner. Sorgu GEÇİCİ bir sebeple (ağ/oturum senkron sorunu) hata
      // verirse yanlışlıkla /teacher'a atmadan önce bir kez daha deniyoruz.
      let { data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle()
      if (error) {
        console.error('[teacher/import-grades] teachers sorgusu basarisiz, tekrar deneniyor:', error)
        await new Promise(r => setTimeout(r, 600))
        ;({ data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle())
      }
      if (!t?.approved) { router.push('/teacher'); return }
      setLoading(false)
    }
    check()
  }, [])

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader
        icon="📥"
        title="Not İçe Aktar"
        subtitle="Excel/PDF'den öğrenci notu içeri aktar"
        backHref="/teacher"
        backLabel="Öğretmen paneli"
      />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem' }}>
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1.25rem' }}>
          MOZAİK, e-Okul veya kendi hazırladığın Excel/CSV dosyalarındaki öğrenci numarası, sınıf,
          isim ve ders notlarını sınıflarındaki öğrencilerle eşleştirip içeri aktar.
        </p>
        <GradeImportWizard scope="teacher" rosterEndpoint="/api/teacher/students-roster" commitEndpoint="/api/teacher/import-grades" />
      </div>
    </main>
  )
}
