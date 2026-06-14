'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LiveContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient() as any

  const [screen, setScreen] = useState<'join' | 'waiting' | 'question' | 'answer_sent' | 'results'>('join')
  const [code, setCode] = useState(searchParams.get('code')?.toUpperCase() || '')
  const [liveQuiz, setLiveQuiz] = useState<any>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (urlCode) setCode(urlCode.toUpperCase())
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function joinQuiz() {
    const trimCode = code.trim().toUpperCase()
    if (!trimCode) return
    setJoining(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: lq } = await supabase.from('live_quizzes')
      .select('id,topic,questions,time_per_question,status,current_question,classroom_id')
      .eq('join_code', trimCode)
      .neq('status', 'finished')
      .single()

    if (!lq) { setError('Bu koda ait aktif quiz bulunamadı.'); setJoining(false); return }

    setLiveQuiz(lq)
    setJoining(false)

    if (lq.status === 'active') {
      setCurrentQ(lq.current_question)
      setScreen('question')
      startTimer(lq.time_per_question)
    } else {
      setScreen('waiting')
    }

    // Realtime: quiz güncellemelerini dinle
    const channel = supabase.channel(`live_student:${lq.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_quizzes',
        filter: `id=eq.${lq.id}`,
      }, (payload: any) => {
        handleQuizUpdate(payload.new, lq)
      })
      .subscribe()
    channelRef.current = channel

    // Polling — Realtime gecikirse 2sn'de bir kontrol et
    const pollId = setInterval(async () => {
      const { data: updated } = await supabase
        .from('live_quizzes')
        .select('id, status, current_question, time_per_question')
        .eq('id', lq.id)
        .single()
      if (updated) handleQuizUpdate(updated, lq)
      // finished ise polling durdur
      if (updated?.status === 'finished') clearInterval(pollId)
    }, 2000)

    // 30dk sonra polling durdur
    setTimeout(() => clearInterval(pollId), 30 * 60 * 1000)
  }

  function handleQuizUpdate(updated: any, lq: any) {
    setLiveQuiz((p: any) => {
      const prev = p || {}
      // current_question değişti mi? — answer_sent veya question ekranındayken de geç
      if (updated.status === 'finished') {
        if (timerRef.current) clearInterval(timerRef.current)
        fetchLeaderboard(lq?.id)
        setScreen('results')
        return { ...prev, ...updated }
      }
    if (
        updated.status === 'active' &&
        updated.current_question !== undefined &&
        updated.current_question !== prev.current_question
      ) {
        setCurrentQ(updated.current_question)
        setChosen(null)
        setIsCorrect(null)
        setScreen('question')
        startTimer(updated.time_per_question || lq?.time_per_question || 30)
      }
      // İlk kez active oldu (waiting → question)
      if (updated.status === 'active' && prev.status !== 'active') {
        setCurrentQ(updated.current_question ?? 0)
        setChosen(null)
        setIsCorrect(null)
        setScreen('question')
        startTimer(updated.time_per_question || lq?.time_per_question || 30)
      }
      return { ...prev, ...updated }
    })
  }



  function startTimer(duration: number) {
    setTimeLeft(duration)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function submitAnswer(idx: number) {
    if (chosen !== null) return
    setChosen(idx)
    if (timerRef.current) clearInterval(timerRef.current)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/live-quiz', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ live_quiz_id: liveQuiz.id, question_index: currentQ, chosen_answer: idx }),
    })
    const data = await res.json()
    setIsCorrect(data.is_correct)
    setScore(prev => ({ correct: prev.correct + (data.is_correct ? 1 : 0), total: prev.total + 1 }))
    setScreen('answer_sent')
  }

  async function fetchLeaderboard(liveQuizId: string) {
    const { data: ans } = await supabase
      .from('live_quiz_answers')
      .select('user_id, is_correct, profiles(name)')
      .eq('live_quiz_id', liveQuizId)
    const scoreMap: Record<string, { name: string; correct: number; total: number }> = {}
    for (const a of (ans ?? [])) {
      if (!scoreMap[a.user_id]) scoreMap[a.user_id] = { name: a.profiles?.name || 'Öğrenci', correct: 0, total: 0 }
      scoreMap[a.user_id].total++
      if (a.is_correct) scoreMap[a.user_id].correct++
    }
    const lb = Object.values(scoreMap).map(s => ({ ...s, pct: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 }))
    lb.sort((a, b) => b.correct - a.correct)
    setLeaderboard(lb)
  }

  const q = liveQuiz?.questions?.[currentQ]
  const timerPct = liveQuiz ? (timeLeft / (liveQuiz.time_per_question || 30)) * 100 : 100

  // ── JOIN ──────────────────────────────────────────────────────────────────
  if (screen === 'join') return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #082465, #6366f1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎯</div>
      <div style={{ fontWeight: 900, fontSize: '28px', color: '#fff', marginBottom: '4px' }}>Canlı Quiz</div>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', marginBottom: '2rem' }}>Kodu gir, quize katıl!</div>

      <div style={{ background: '#fff', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && joinQuiz()}
          placeholder="KOD GİR"
          maxLength={8}
          style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '28px', fontWeight: 900, letterSpacing: '0.2em', textAlign: 'center', fontFamily: 'monospace', color: '#082465', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }}
        />
        {error && <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '10px', textAlign: 'center' }}>{error}</div>}
        <button onClick={joinQuiz} disabled={joining || code.length < 4}
          style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: joining ? '#e2e8f0' : '#6366f1', color: joining ? '#94a3b8' : '#fff', fontWeight: 800, fontSize: '16px', cursor: joining ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {joining ? 'Bağlanıyor...' : 'Katıl →'}
        </button>
      </div>
    </main>
  )

  // ── WAITING ───────────────────────────────────────────────────────────────
  if (screen === 'waiting') return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #082465, #6366f1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, border: '5px solid rgba(255,255,255,0.2)', borderTop: '5px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '1.5rem' }} />
      <div style={{ fontWeight: 800, fontSize: '22px', color: '#fff', marginBottom: '8px' }}>Hazır ol!</div>
      <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', marginBottom: '1rem' }}>{liveQuiz?.topic}</div>
      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Öğretmen quizi başlatana kadar bekle...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  )

  // ── QUESTION ──────────────────────────────────────────────────────────────
  if (screen === 'question' && q) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '40px' }}>
      <div style={{ background: '#082465', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Soru {currentQ + 1}/{liveQuiz.questions.length}</div>
        <div style={{ flex: 1, height: 6, borderRadius: '99px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '99px', background: timerPct > 30 ? '#1ECFB8' : '#ef4444', width: `${timerPct}%`, transition: 'width 1s linear' }} />
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '18px', color: timeLeft <= 5 ? '#fca5a5' : '#fff' }}>{timeLeft}</div>
      </div>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '1.25rem 1rem' }}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--primary)', lineHeight: 1.65, marginBottom: '1.25rem' }}>{q.q}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {q.opts.map((opt: string, i: number) => (
              <button key={i} onClick={() => submitAnswer(i)}
                style={{ textAlign: 'left', padding: '14px', borderRadius: '12px', border: '2px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500, display: 'flex', gap: '10px', transition: 'all 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}>
                <span style={{ fontWeight: 800, color: '#6366f1', flexShrink: 0 }}>{['A','B','C','D'][i]}</span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  )

  // ── ANSWER SENT (Öğretmeni bekle) ─────────────────────────────────────────
  if (screen === 'answer_sent') return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isCorrect ? 'linear-gradient(135deg, #14532d, #16a34a)' : 'linear-gradient(135deg, #7f1d1d, #dc2626)', textAlign: 'center', padding: '2rem 1rem' }}>
      <div style={{ fontSize: '72px', marginBottom: '16px' }}>{isCorrect ? '✓' : '✗'}</div>
      <div style={{ fontWeight: 900, fontSize: '28px', color: '#fff', marginBottom: '8px' }}>{isCorrect ? 'Doğru!' : 'Yanlış!'}</div>
      <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)', marginBottom: '2rem' }}>
        {isCorrect ? 'Harika! Bir sonraki soruyu bekle.' : 'Bir sonraki soruyu bekle.'}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '16px', padding: '16px 32px', backdropFilter: 'blur(10px)' }}>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>Toplam</div>
        <div style={{ fontSize: '32px', fontWeight: 900, color: '#fff' }}>{score.correct}/{score.total}</div>
      </div>
      <div style={{ marginTop: '2rem', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Sonraki soru geliyor...</div>
    </main>
  )

  // ── RESULTS ───────────────────────────────────────────────────────────────
  if (screen === 'results') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #082465, #6366f1)', padding: '2rem 1rem', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: '14px', opacity: 0.7, marginBottom: '4px' }}>Toplam sonucun</div>
        <div style={{ fontSize: '52px', fontWeight: 900 }}>{score.correct}/{liveQuiz?.questions?.length || score.total}</div>
        <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>
          {score.total > 0 ? `%${Math.round(score.correct / score.total * 100)}` : '%0'} başarı
        </div>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1.25rem 1rem' }}>
        <div className="card">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>🏆 Sıralama</div>
          {leaderboard.map((entry, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontWeight: 800, fontSize: '16px', width: 28, textAlign: 'center' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </div>
              <div style={{ flex: 1, fontWeight: 500, fontSize: '14px', color: 'var(--primary)' }}>{entry.name}</div>
              <div style={{ fontWeight: 800, fontSize: '15px', color: entry.pct >= 70 ? '#16a34a' : entry.pct >= 50 ? '#d97706' : '#dc2626' }}>
                %{entry.pct}
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => router.push('/quiz')} style={{ width: '100%', marginTop: '1rem', padding: '13px', borderRadius: '12px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          Ana Sayfaya Dön
        </button>
      </div>
    </main>
  )

  return null
}
