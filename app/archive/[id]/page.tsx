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

      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single()

      if (error || !data) { router.push('/archive'); return }
      setSession(data)
      setLoading(false)
    }
    load()
  }, [params.id])

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  // questions kolonu {q, opts, ans, exp} formatında geliyor
  const questions: { q: string; opts: string[]; ans: number; exp?: string }[] = session.questions || []
  // answers kolonu [{userAns, correct}] veya düz number[] olabilir
  const rawAnswers = session.answers || []
  const getAnswer = (i: number): number => {
    const a = rawAnswers[i]
    if (typeof a === 'number') return a
    if (typeof a === 'object' && a !== null) return a.userAns ?? a.user_ans ?? -1
    return -1
  }
  const isCorrect = (i: number): boolean => {
    const a = rawAnswers[i]
    if (typeof a === 'object' && a !== null && 'correct' in a) return a.correct
    return getAnswer(i) === questions[i]?.ans
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem' }}>

        <Link href="/archive" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
          ← Arşive dön
        </Link>

        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '6px' }}>
            {session.topic}
          </h1>
          <p style={{ color: 'var(--text3)', fontSize: '13px' }}>
            {new Date(session.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{session.question_count} soru{' · '}
            <span style={{ fontWeight: 700, color: session.pct >= 70 ? 'var(--green)' : 'var(--red)' }}>%{session.pct}</span>
          </p>
        </div>

        {questions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
            <div style={{ color: 'var(--text3)' }}>Soru verisi bulunamadı.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {questions.map((q, i) => {
              const userAns = getAnswer(i)
              const correct = isCorrect(i)
              return (
                <div key={i} style={{
                  padding: '16px', borderRadius: '14px',
                  border: `2px solid ${correct ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
                  background: correct ? 'var(--green-bg)' : 'var(--red-bg)',
                }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 700, color: correct ? 'var(--green)' : 'var(--red)', flexShrink: 0, fontSize: '16px' }}>
                      {correct ? '✓' : '✗'}
                    </span>
                    <p style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.55, color: 'var(--primary)' }}>
                      {i + 1}. {q.q}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '22px' }}>
                    {q.opts.map((opt, j) => {
                      const isUserChoice = j === userAns
                      const isCorrectChoice = j === q.ans
                      return (
                        <div key={j} style={{
                          padding: '9px 13px', borderRadius: '8px', fontSize: '13px',
                          background: isCorrectChoice
                            ? 'rgba(22,163,74,0.12)'
                            : isUserChoice && !correct
                            ? 'rgba(220,38,38,0.12)'
                            : 'var(--bg)',
                          color: isCorrectChoice ? 'var(--green)' : isUserChoice && !correct ? 'var(--red)' : 'var(--text2)',
                          fontWeight: isCorrectChoice ? 700 : 400,
                          textDecoration: isUserChoice && !correct ? 'line-through' : 'none',
                          border: `1px solid ${isCorrectChoice ? 'rgba(22,163,74,0.3)' : isUserChoice && !correct ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
                        }}>
                          <span style={{ opacity: 0.5, marginRight: '8px', fontSize: '11px', fontWeight: 700 }}>{String.fromCharCode(65 + j)})</span>
                          {opt}
                        </div>
                      )
                    })}
                  </div>
                  {q.exp && !correct && (
                    <div style={{ marginTop: '10px', paddingLeft: '22px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, borderTop: '1px solid rgba(220,38,38,0.15)', paddingTop: '10px' }}>
                      💡 {q.exp}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '2rem' }}>
          <Link href="/quiz" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
            ⚡ Yeni Test
          </Link>
          <Link href="/archive" className="btn" style={{ flex: 1, justifyContent: 'center' }}>
            ← Arşive dön
          </Link>
        </div>
      </div>
    </main>
  )
}
