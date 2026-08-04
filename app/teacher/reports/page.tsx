'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import ReportsHub from '@/components/ReportsHub'
import { createClient } from '@/lib/supabase/client'

export default function TeacherReportsPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login/teacher'); return }
      // .single() yerine .maybeSingle() — kayıt yoksa hata FIRLATMAZ, null
      // döner. Ayrıca sorgu GEÇİCİ bir sebeple (ağ/oturum senkron sorunu —
      // özellikle Link ile client-side gezinmede oluyor) hata verirse
      // yanlışlıkla "onaylı değil" sanıp /teacher'a atmak yerine bir kez
      // daha deniyoruz.
      let { data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle()
      if (error) {
        console.error('[teacher/reports] teachers sorgusu basarisiz, tekrar deneniyor:', error)
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
        icon="📋"
        title="Raporlar"
        subtitle="Sınıflarındaki öğrencilerin notları, ilerlemesi ve Pratium sonuçları"
        backHref="/teacher"
        backLabel="Öğretmen paneli"
      />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        <ReportsHub scope="teacher" gradesEndpoint="/api/teacher/reports" sectionalEndpoint="/api/teacher/reports" hubEndpoint="/api/teacher/reports-hub" />
      </div>
    </main>
  )
}
