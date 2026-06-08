'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ChallengePage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const supabase = createClient() as any

  const [challenge, setChallenge] = useState<any>(null)
  const [screen, setScreen] = useState<'info' | 'quiz' | 'results'>('info')
  const [questions, setQuestions] = useState<any[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<{ chosen: number; correct: boolean }[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/challenge?code=${code}`)
      if (!res.ok) { setError('Challenge bulunamadı veya süresi dolmuş.'); setLoading(false); return }
      const data = await res.json()
      setChallenge(data)
      setLoading(false)
    }
    load()
  }, [code])

  async function startChallenge() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Challenge sorularını çek
    const { data: ch } = await supabase.from('challenges')
      .select('questions,id').eq('share_code', code).single()
    if (!ch) return
    setChallenge((p: any) => ({ ...p, id: ch.id }))
    setQuestions(ch.questions || [])
    setScreen('quiz')
  }

  function selectAnswer(idx: number) {
    if (chosen !== null) return
    const q = questions[current]
    const isCorrect = idx === q.ans
    setChosen(idx)
    setAnswers(prev => [...prev, { chosen: idx, correct: isCorrect }])
    setTimeout(() => {
      if (current + 1 >= questions.length) { finishChallenge([...answers, { chosen: idx, correct: isCorrect }]); return }
      setCurrent(c => c + 1)
      setChosen(null)
    }, 1200)
  }

  async function finishChallenge(finalAnswers: typeof answers) {
    setSubmitting(true)
    const correct = finalAnswers.filter(a => a.correct).length
    const pct = Math.round((correct / questions.length) * 100)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/challenge', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ challenge_id: challenge.id, score: correct, pct }),
    })
    const data = await res.json()
    setLeaderboard(data.leaderboard || [])
    setSubmitting(false)
    setScreen('results')
  }

  const q = questions[current]
  const myScore = answers.filter(a => a.correct).length

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )
  if (error) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '40px' }}>😕</div>
      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{error}</div>
      <button onClick={() => router.push('/quiz')} style={{ padding: '10px 20px', borderRadius: '10px', background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Ana Sayfaya Dön</button>
    </main>
  )

  // INFO
  if (screen === 'info') return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #082465, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ background: '#fff', borderRadius: '24px', padding: '2rem', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>⚔️</div>
        <div style={{ fontWeight: 900, fontSize: '22px', color: '#082465', marginBottom: '4px' }}>Challenge!</div>
        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '1.5rem' }}>
          <strong style={{ color: '#6366f1' }}>{challenge?.profiles?.name || 'Biri'}</strong> sizi quiz yarışmasına davet ediyor!
        </div>

        <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px', marginBottom: '1.5rem', textAlign: 'left' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#082465', marginBottom: '8px' }}>📚 {challenge?.topic}</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: '#64748b' }}>
            <span>📝 {challenge?.question_count} soru</span>
            <span>🏆 Onların skoru: %{challenge?.creator_pct}</span>
            <span>👥 {challenge?.participant_count} katılımcı</span>
          </div>
        </div>

        <button onClick={startChallenge} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: '16px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
          ⚔️ Yarışmayı Kabul Et
        </button>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#94a3b8' }}>pratium.com ile güçlendirildi</div>
      </div>
    </main>
  )

  // QUIZ
  if (screen === 'quiz' && q) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '40px' }}>
      <div style={{ background: '#082465', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>⚔️ Challenge · Soru {current + 1}/{questions.length}</div>
        <div style={{ flex: 1, height: 5, borderRadius: '99px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#fdd31d', width: `${((current) / questions.length) * 100}%`, borderRadius: '99px' }} />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fdd31d' }}>{myScore} doğru</div>
      </div>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '1.25rem 1rem' }}>
        <div className="card">
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--primary)', lineHeight: 1.65, marginBottom: '1.25rem' }}>{q.q}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {q.opts.map((opt: string, i: number) => {
              const isChosen = chosen === i
              const isCorrect = i === q.ans
              let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--primary)'
              if (chosen !== null) {
                if (isCorrect) { bg = 'rgba(22,163,74,0.1)'; border = '#16a34a'; color = '#15803d' }
                else if (isChosen) { bg = 'rgba(220,38,38,0.1)'; border = '#dc2626'; color = '#dc2626' }
              }
              return (
                <button key={i} onClick={() => selectAnswer(i)} disabled={chosen !== null}
                  style={{ textAlign: 'left', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${border}`, background: bg, color, cursor: chosen !== null ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px', display: 'flex', gap: '10px', transition: 'all 0.15s' }}>
                  <span style={{ fontWeight: 700 }}>{['A','B','C','D'][i]}</span>
                  {opt}
                  {chosen !== null && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
                  {chosen !== null && isChosen && !isCorrect && <span style={{ marginLeft: 'auto' }}>✗</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )

  // RESULTS
  if (screen === 'results') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #082465, #6366f1)', padding: '2rem 1rem', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '4px' }}>Senin skoru</div>
        <div style={{ fontSize: '52px', fontWeight: 900 }}>{myScore}/{questions.length}</div>
        <div style={{ fontSize: '16px', opacity: 0.8, marginTop: '4px' }}>
          {myScore > 0 && challenge?.creator_pct && Math.round(myScore / questions.length * 100) > challenge.creator_pct
            ? '🏆 Kazandın!' : myScore / questions.length * 100 === challenge?.creator_pct ? '🤝 Berabere!' : '😅 Kaybettin!'}
        </div>
        <div style={{ marginTop: '8px', fontSize: '13px', opacity: 0.6 }}>
          Rakip skoru: %{challenge?.creator_pct}
        </div>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1.25rem 1rem' }}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem' }}>🏆 Sıralama</div>
          {leaderboard.slice(0, 5).map((e: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <span style={{ fontWeight: 800, fontSize: '16px', width: 24 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
              <span style={{ flex: 1, fontSize: '14px', color: 'var(--primary)' }}>{e.profiles?.name || 'Öğrenci'}</span>
              <span style={{ fontWeight: 700, color: e.pct >= 70 ? '#16a34a' : '#d97706' }}>%{e.pct}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { navigator.clipboard.writeText(`https://pratium.com/challenge/${code}`); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            🔗 Linki Kopyala
          </button>
          <button onClick={() => router.push('/quiz')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            Yeni Test
          </button>
        </div>
      </div>
    </main>
  )

  return null
}
