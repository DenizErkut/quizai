'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ArchiveClient from './ArchiveClient'

export default function ArchivePage() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('quiz_sessions')
        .select('id, topic, grade, language, question_count, score, pct, completed, created_at, question_type, questions, answers')
        .eq('user_id', user.id)
        .eq('completed', true)
        .not('topic', 'is', null)
        .order('created_at', { ascending: false })

      // ✅ Client-side: score > 0 VEYA soru sayısı 0 olan (tamamlanmış ama boş)
      // kayıtları filtrele — bozuk %0 kayıtları gösterme
      // NOT: Kasıtlı %0 alan testler de gösterilsin (tüm soruları yanlış yapmak mümkün)
      // Sadece score=0 VE question_count>0 VE answers boş olan bozuk kayıtları gizle
      const cleaned = (data ?? []).filter((s: any) => {
        const hasAnswers = Array.isArray(s.answers) && s.answers.length > 0
        const isGenuineZero = s.pct === 0 && !hasAnswers && s.question_count > 0
        return !isGenuineZero
      })

      setSessions(cleaned)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '5rem' }}>
      <ArchiveClient sessions={sessions} />
    </main>
  )
}
