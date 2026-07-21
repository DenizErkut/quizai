'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import SectionalReportTable from '@/components/SectionalReportTable'
import { createClient } from '@/lib/supabase/client'

export default function TeacherSectionalReportsPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login/teacher'); return }
      const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
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
        icon="📚"
        title="Ders Bazlı Rapor"
        subtitle="Okul notları ve Pratium sonuçları ders ders yan yana"
        backHref="/teacher"
        backLabel="Öğretmen paneli"
      />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        <SectionalReportTable fetchEndpoint="/api/teacher/reports" />
      </div>
    </main>
  )
}
