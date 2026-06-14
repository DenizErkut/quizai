'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/client'

export default function TeacherLivePage() {
  const router = useRouter()
  const supabase = createClient() as any

  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [screen, setScreen] = useState<'setup' | 'waiting' | 'active' | 'results'>('setup')
  const [form, setForm] = useState({ classroom_id: '', topic: '', question_count: 5, difficulty: 'normal', time_per_question: 30 })
  const [creating, setCreating] = useState(false)
  const [liveQuiz, setLiveQuiz] = useState<any>(null)
  const [joinCode, setJoinCode] = useState('')
  const [currentQ, setCurrentQ] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [participants, setParticipants] = useState<any[]>([])
  const [answers, setAnswers] = useState<any[]>([])
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const realtimeRef = useRef<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login/teacher'); return }
      const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
      if (!t?.approved) { router.push('/teacher'); return }
      setTeacher(t)
      const { data: cls } = await supabase.from('classrooms').select('*, classroom_students(count)').eq('teacher_id', t.id)
      setClassrooms(cls ?? [])
      if (cls?.length) setForm(p => ({ ...p, classroom_id: cls[0].id }))
    }
    load()
    return () => {
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Realtime: cevapları dinle
  function subscribeToAnswers(liveQuizId: string) {
    const channel = supabase.channel(`live_quiz:${liveQuizId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_quiz_answers',
        filter: `live_quiz_id=eq.${liveQuizId}`,
      }, () => { fetchAnswers(liveQuizId); fetchParticipants(liveQuizId) })
      .subscribe()
    realtimeRef.current = channel
    fetchAnswers(liveQuizId)
    // Polling — Realtime gecikirse katılımcıları 3sn'de bir güncelle
    const pollInterval = setInterval(() => fetchParticipants(liveQuizId), 3000)
    setTimeout(() => clearInterval(pollInterval), 300000) // 5dk sonra durdur
  }

  async function fetchAnswers(liveQuizId: string) {
    const { data: ans } = await supabase
      .from('live_quiz_answers')
      .select('user_id, question_index, chosen_answer, is_correct, answered_at, profiles(name, avatar_url)')
      .eq('live_quiz_id', liveQuizId)
    setAnswers(ans ?? [])

    // Liderboard hesapla
    const scoreMap: Record<string, { name: string; avatar: string | null; correct: number; total: number }> = {}
    for (const a of (ans ?? [])) {
      if (!scoreMap[a.user_id]) scoreMap[a.user_id] = { name: a.profiles?.name || 'Öğrenci', avatar: a.profiles?.avatar_url || null, correct: 0, total: 0 }
      scoreMap[a.user_id].total++
      if (a.is_correct) scoreMap[a.user_id].correct++
    }
    const lb = Object.entries(scoreMap).map(([uid, s]) => ({ uid, ...s, pct: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0 }))
    lb.sort((a, b) => b.correct - a.correct)
    setLeaderboard(lb)
  }

  // Katılımcıları izle
  async function fetchParticipants(liveQuizId: string) {
    const { data } = await supabase
      .from('live_quiz_answers')
      .select('user_id, profiles(name)')
      .eq('live_quiz_id', liveQuizId)
    const unique = [...new Map((data ?? []).map((d: any) => [d.user_id, d])).values()]
    setParticipants(unique)
  }

  async function createLiveQuiz() {
    if (!form.classroom_id || !form.topic.trim()) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/live-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setCreating(false); return }
    setLiveQuiz({ id: data.liveQuizId, questions: [] })
    setJoinCode(data.joinCode)
    setCreating(false)
    setScreen('waiting')
    subscribeToAnswers(data.liveQuizId)

    // Soruları çek
    const { data: lq } = await supabase.from('live_quizzes').select('questions').eq('id', data.liveQuizId).single()
    setLiveQuiz((p: any) => ({ ...p, questions: lq?.questions || [] }))
  }

  async function startQuiz() {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/live-quiz', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ live_quiz_id: liveQuiz.id, action: 'start' }),
    })
    setCurrentQ(0)
    setScreen('active')
    startTimer()
  }

  function startTimer() {
    setTimeLeft(form.time_per_question)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function nextQuestion() {
    const nextQ = currentQ + 1
    if (nextQ >= (liveQuiz.questions?.length || 0)) {
      await finishQuiz()
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/live-quiz', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ live_quiz_id: liveQuiz.id, action: 'next', current_question: nextQ }),
    })
    setCurrentQ(nextQ)
    startTimer()
  }

  async function finishQuiz() {
    if (timerRef.current) clearInterval(timerRef.current)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/live-quiz', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ live_quiz_id: liveQuiz.id, action: 'finish' }),
    })
    setScreen('results')
  }

  const q = liveQuiz?.questions?.[currentQ]
  const currentQAnswers = answers.filter(a => a.question_index === currentQ)
  const correctCount = currentQAnswers.filter(a => a.is_correct).length

  // ── SETUP ──────────────────────────────────────────────────────────────────
  if (screen === 'setup') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <PageHeader title="Canlı Quiz" subtitle="Sınıfa anlık quiz gönder" icon="🎯" color="#6366f1" backHref="/teacher" backLabel="Öğretmen paneli" />
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1rem' }}>
        <div className="card">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Quiz ayarları</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', display: 'block' }}>Sınıf</label>
              <select value={form.classroom_id} onChange={e => setForm(p => ({ ...p, classroom_id: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.name} ({c.classroom_students?.[0]?.count || 0} öğrenci)</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', display: 'block' }}>Konu</label>
              <input value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} placeholder="Örn: Osmanlı tarihi, Fotosentez..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '14px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', display: 'block' }}>Soru sayısı</label>
                <select value={form.question_count} onChange={e => setForm(p => ({ ...p, question_count: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
                  {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n} soru</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', display: 'block' }}>Soru başına süre</label>
                <select value={form.time_per_question} onChange={e => setForm(p => ({ ...p, time_per_question: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
                  {[15, 20, 30, 45, 60].map(n => <option key={n} value={n}>{n} saniye</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', display: 'block' }}>Zorluk</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['kolay', 'normal', 'zor'].map(d => (
                  <button key={d} onClick={() => setForm(p => ({ ...p, difficulty: d }))}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1.5px solid ${form.difficulty === d ? '#6366f1' : 'var(--border)'}`, background: form.difficulty === d ? 'rgba(99,102,241,0.1)' : 'var(--bg2)', color: form.difficulty === d ? '#6366f1' : 'var(--text2)', fontSize: '13px', fontWeight: form.difficulty === d ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-sans)', textTransform: 'capitalize' }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={createLiveQuiz} disabled={creating || !form.topic.trim() || !form.classroom_id}
              style={{ padding: '13px', borderRadius: '12px', border: 'none', background: creating ? 'var(--bg2)' : '#6366f1', color: creating ? 'var(--text3)' : '#fff', fontWeight: 700, fontSize: '15px', cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}>
              {creating ? '⏳ Sorular hazırlanıyor...' : '🚀 Quiz Oluştur ve Gönder'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )

  // ── WAITING (Katılım bekleniyor) ───────────────────────────────────────────
  if (screen === 'waiting') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <PageHeader title="Katılım Bekleniyor" subtitle="Öğrenciler bağlanıyor..." icon="⏳" color="#6366f1" backHref="/teacher/live" backLabel="İptal" />
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 1rem', textAlign: 'center' }}>

        {/* Katılım kodu */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>Katılım kodu</div>
          <div style={{ fontSize: '56px', fontWeight: 900, letterSpacing: '0.15em', color: '#6366f1', fontFamily: 'monospace' }}>{joinCode}</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>Öğrenciler pratium.com/live adresine gidip bu kodu girecek</div>
        </div>

        {/* Katılan öğrenciler */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '12px' }}>
            Katılanlar ({participants.length})
          </div>
          {participants.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '1rem' }}>Henüz kimse katılmadı...</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {participants.map((p: any) => (
                <div key={p.user_id} style={{ padding: '5px 12px', borderRadius: '99px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '13px', color: '#6366f1', fontWeight: 500 }}>
                  {p.profiles?.name || 'Öğrenci'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Katılımcı sayısı */}
        <div style={{ marginBottom: '1rem', padding: '10px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '13px', color: '#6366f1', textAlign: 'center' }}>
          {participants.length === 0
            ? '⏳ Öğrenciler bağlanıyor...'
            : `✅ ${participants.length} öğrenci hazır`}
        </div>

        <button onClick={startQuiz}
          style={{ width: '100%', padding: '18px', borderRadius: '14px', border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff', fontWeight: 800, fontSize: '18px', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
            transition: 'all 0.2s', letterSpacing: '0.02em' }}>
          ▶ Sınavı Başlat — {liveQuiz?.questions?.length || 0} Soru
        </button>
        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
          {participants.length > 0 ? `✅ ${participants.length} öğrenci hazır` : 'Öğrenci olmasa da başlatabilirsin'}
        </p>
      </div>
    </main>
  )

  // ── ACTIVE (Quiz canlı) ────────────────────────────────────────────────────
  if (screen === 'active' && q) {
    const totalParticipants = new Set(answers.map(a => a.user_id)).size
    const answeredThisQ = currentQAnswers.length
    const timerPct = (timeLeft / form.time_per_question) * 100

    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
        {/* Üst bar */}
        <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#082465', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>Soru {currentQ + 1}/{liveQuiz.questions.length}</div>
          <div style={{ flex: 1, height: 6, borderRadius: '99px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: '99px', background: timerPct > 30 ? '#1ECFB8' : '#ef4444', width: `${timerPct}%`, transition: 'width 1s linear' }} />
          </div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '18px', color: timeLeft <= 5 ? '#fca5a5' : '#fff', minWidth: 28 }}>{timeLeft}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{answeredThisQ}/{totalParticipants} cevapladı</div>
        </div>

        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.25rem 1rem' }}>
          {/* Soru */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--primary)', lineHeight: 1.6, marginBottom: '1.25rem' }}>{q.q}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px,100%), 1fr))', gap: '8px' }}>
              {q.opts.map((opt: string, i: number) => {
                const optAnswers = currentQAnswers.filter(a => a.chosen_answer === i)
                const pct = answeredThisQ > 0 ? Math.round(optAnswers.length / answeredThisQ * 100) : 0
                const isCorrect = i === q.ans
                return (
                  <div key={i} style={{ padding: '12px', borderRadius: '10px', border: `1.5px solid ${isCorrect ? '#16a34a' : 'var(--border)'}`, background: isCorrect ? 'rgba(22,163,74,0.08)' : 'var(--bg2)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: isCorrect ? 'rgba(22,163,74,0.15)' : 'rgba(99,102,241,0.1)', transition: 'width 0.4s' }} />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: isCorrect ? '#15803d' : 'var(--primary)' }}>
                        <strong>{['A','B','C','D'][i]}.</strong> {opt}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: isCorrect ? '#16a34a' : '#6366f1' }}>{pct}%</span>
                    </div>
                    <div style={{ position: 'relative', zIndex: 1, fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{optAnswers.length} kişi</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Anlık cevap sayacı */}
          <div className="card" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a' }}>{correctCount}</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Doğru</div></div>
            <div><div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626' }}>{answeredThisQ - correctCount}</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Yanlış</div></div>
            <div><div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text2)' }}>{Math.max(0, totalParticipants - answeredThisQ)}</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Bekliyor</div></div>
          </div>

          <button onClick={nextQuestion}
            style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: currentQ >= (liveQuiz.questions.length - 1) ? '#dc2626' : '#6366f1', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            {currentQ >= (liveQuiz.questions.length - 1) ? '🏁 Quizi Bitir' : 'Sonraki Soru →'}
          </button>
        </div>
      </main>
    )
  }

  // ── RESULTS (Sonuçlar) ─────────────────────────────────────────────────────
  if (screen === 'results') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <PageHeader title="Quiz Sonuçları" subtitle={form.topic} icon="🏆" color="#f59e0b" backHref="/teacher" backLabel="Öğretmen paneli" />
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1rem' }}>

        {/* Sınıf özeti */}
        <div className="card" style={{ marginBottom: '1rem', textAlign: 'center', background: 'linear-gradient(135deg, #082465, #6366f1)', color: '#fff' }}>
          <div style={{ fontSize: '13px', opacity: 0.7, marginBottom: '4px' }}>Katılımcı</div>
          <div style={{ fontSize: '40px', fontWeight: 900 }}>{leaderboard.length}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '12px', fontSize: '13px', opacity: 0.8 }}>
            <span>📝 {liveQuiz?.questions?.length || 0} soru</span>
            <span>⏱ {form.time_per_question}sn/soru</span>
          </div>
        </div>

        {/* Liderboard */}
        <div className="card">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Sıralama</div>
          {leaderboard.map((entry, i) => (
            <div key={entry.uid} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, background: i === 0 ? '#fdd31d' : i === 1 ? '#e2e8f0' : i === 2 ? '#f59e0b' : 'var(--bg2)', color: i < 3 ? '#082465' : 'var(--text2)', flexShrink: 0 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{entry.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{entry.correct} doğru / {entry.total} soru</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: entry.pct >= 70 ? '#16a34a' : entry.pct >= 50 ? '#d97706' : '#dc2626' }}>
                %{entry.pct}
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '1rem' }}>Henüz kimse katılmadı.</div>}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => { setScreen('setup'); setLiveQuiz(null) }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            🔄 Yeni Quiz
          </button>
          <button onClick={() => router.push('/teacher')} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            📊 Panele Dön
          </button>
        </div>
      </div>
    </main>
  )

  return null
}
