'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SessionDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error || !data) {
        console.error('Session load error:', error, 'id:', id)
        setNotFound(true)
        setLoading(false)
        return
      }
      setSession(data)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  if (notFound) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '1rem' }}>😕</div>
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>Test bulunamadı</div>
        <Link href="/archive" className="btn btn-primary" style={{ justifyContent: 'center' }}>← Arşive dön</Link>
      </div>
    </main>
  )

  // questions: {q, opts, ans, exp} formatı
  const questions: { q: string; opts: string[]; ans: number; exp?: string }[] = session.questions || []
  const rawAnswers = session.answers || []

  const getAnswer = (i: number): number => {
    const a = rawAnswers[i]
    if (a === null || a === undefined) return -1
    if (typeof a === 'number') return a
    if (typeof a === 'object') return a.userAns ?? a.user_ans ?? -1
    return -1
  }

  const getCorrect = (i: number): boolean => {
    const a = rawAnswers[i]
    if (a === null || a === undefined) return false
    if (typeof a === 'object' && 'correct' in a) return Boolean(a.correct)
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text3)' }}>
              {new Date(session.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text3)' }}>{session.question_count} soru</span>
            <span style={{
              fontSize: '13px', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
              background: session.pct >= 70 ? 'var(--green-bg)' : 'var(--red-bg)',
              color: session.pct >= 70 ? 'var(--green)' : 'var(--red)',
              border: `1px solid ${session.pct >= 70 ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`,
            }}>%{session.pct}</span>
          </div>
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
              const correct = getCorrect(i)
              return (
                <div key={i} style={{
                  padding: '16px', borderRadius: '14px',
                  border: `2px solid ${correct ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
                  background: correct ? 'var(--green-bg)' : 'var(--red-bg)',
                }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 700, color: correct ? 'var(--green)' : 'var(--red)', flexShrink: 0, fontSize: '16px' }}>
                      {correct ? '✓' : '✗'}
                    </span>
                    <p style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.55, color: 'var(--primary)', margin: 0 }}>
                      {i + 1}. {q.q}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '26px' }}>
                    {(q.opts || []).map((opt, j) => {
                      const isUser = j === userAns
                      const isCorrectOpt = j === q.ans
                      return (
                        <div key={j} style={{
                          padding: '9px 13px', borderRadius: '9px', fontSize: '13px',
                          background: isCorrectOpt ? 'rgba(22,163,74,0.12)' : isUser && !correct ? 'rgba(220,38,38,0.12)' : 'var(--bg)',
                          color: isCorrectOpt ? 'var(--green)' : isUser && !correct ? 'var(--red)' : 'var(--text2)',
                          fontWeight: isCorrectOpt ? 700 : 400,
                          textDecoration: isUser && !correct ? 'line-through' : 'none',
                          border: `1px solid ${isCorrectOpt ? 'rgba(22,163,74,0.3)' : isUser && !correct ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
                        }}>
                          <span style={{ opacity: 0.45, marginRight: '8px', fontSize: '11px', fontWeight: 700 }}>
                            {String.fromCharCode(65 + j)})
                          </span>
                          {opt}
                        </div>
                      )
                    })}
                  </div>
                  {q.exp && !correct && (
                    <div style={{ marginTop: '10px', paddingLeft: '26px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, borderTop: '1px solid rgba(220,38,38,0.12)', paddingTop: '10px' }}>
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
