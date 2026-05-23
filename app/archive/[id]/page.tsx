'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('quiz_sessions')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single()

      if (!data) { router.push('/archive'); return }
      setSession(data)
      setLoading(false)
    }
    load()
  }, [params.id])

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  const questions: { question: string; options: string[]; correct: number }[] = session.questions
  const answers: number[] = session.answers

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem' }}>
        <Link href="/archive" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
          ← Arşive dön
        </Link>

        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>{session.topic}</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>
            {new Date(session.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{session.question_count} soru{' · '}
            <span style={{ fontWeight: 600, color: session.pct >= 70 ? 'var(--green)' : 'var(--red)' }}>%{session.pct}</span>
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {questions.map((q, i) => {
            const userAnswer = answers[i]
            const isCorrect = userAnswer === q.correct
            return (
              <div key={i} style={{
                padding: '16px', borderRadius: '12px', border: `2px solid ${isCorrect ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
                background: isCorrect ? 'var(--green-bg)' : 'var(--red-bg)',
              }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 700, color: isCorrect ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                    {isCorrect ? '✓' : '✗'}
                  </span>
                  <p style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.55 }}>{i + 1}. {q.question}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '20px' }}>
                  {q.options.map((opt, j) => {
                    const isUserChoice = j === userAnswer
                    const isCorrectChoice = j === q.correct
                    return (
                      <div key={j} style={{
                        padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                        background: isCorrectChoice ? 'rgba(22,163,74,0.15)' : isUserChoice && !isCorrect ? 'rgba(220,38,38,0.15)' : 'var(--bg2)',
                        color: isCorrectChoice ? 'var(--green)' : isUserChoice && !isCorrect ? 'var(--red)' : 'var(--text2)',
                        fontWeight: isCorrectChoice ? 600 : 400,
                        textDecoration: isUserChoice && !isCorrect ? 'line-through' : 'none',
                        border: '1px solid var(--border)',
                      }}>
                        <span style={{ opacity: 0.5, marginRight: '6px', fontSize: '11px' }}>{String.fromCharCode(65 + j)})</span>
                        {opt}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '2rem' }}>
          <Link href={`/quiz/retry/${session.id}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
            🔁 Yanlışları Tekrar Çöz
          </Link>
          <Link href="/quiz" className="btn" style={{ flex: 1, justifyContent: 'center' }}>
            ⚡ Yeni Test
          </Link>
        </div>
      </div>
    </main>
  )
}
