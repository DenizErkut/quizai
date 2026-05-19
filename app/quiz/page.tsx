'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Question { q: string; opts: string[]; ans: number; exp: string }
interface Profile { name: string; grade: string; language: string; plan: string; monthly_test_count: number }

const TOPIC_MAP: Record<string, { topic: string; subject: string }[]> = {
  ilkokul: [
    { topic: 'Toplama ve cikarma', subject: 'Matematik' },
    { topic: 'Hayvanlar alemi', subject: 'Fen' },
    { topic: 'Mevsimler ve iklim', subject: 'Fen' },
    { topic: 'Turkiye haritasi', subject: 'Sosyal' },
    { topic: 'Carpim tablosu', subject: 'Matematik' },
  ],
  ortaokul: [
    { topic: 'Ondalik sayilar', subject: 'Matematik' },
    { topic: 'Hucre ve organeller', subject: 'Fen' },
    { topic: 'Osmanli Imparatorlugu kuruluu', subject: 'Tarih' },
    { topic: 'Denklemler ve esitsizlikler', subject: 'Matematik' },
    { topic: 'Tam sayilar ve islemler', subject: 'Matematik' },
  ],
  lise: [
    { topic: 'Turev ve integral temelleri', subject: 'Matematik' },
    { topic: 'Organik kimya', subject: 'Kimya' },
    { topic: 'Ataturk ilkeleri', subject: 'Tarih' },
    { topic: 'Logaritma', subject: 'Matematik' },
    { topic: 'Genetik ve DNA', subject: 'Biyoloji' },
  ],
  universite: [
    { topic: 'Ucagin kisimlar', subject: 'Havacilik' },
    { topic: 'Termodinamik yasalari', subject: 'Fizik' },
    { topic: 'Diferansiyel denklemler', subject: 'Matematik' },
    { topic: 'Makroekonomi temelleri', subject: 'Iktisat' },
    { topic: 'Veri yapilari ve algoritmalar', subject: 'Bilisim' },
  ],
}

type Screen = 'topic' | 'loading' | 'quiz' | 'result' | 'limit'

export default function QuizPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [screen, setScreen] = useState<Screen>('topic')
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [qCount, setQCount] = useState(10)
  const [questions, setQuestions] = useState<Question[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<{ userAns: number; correct: boolean }[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [loadMsg, setLoadMsg] = useState('Profilin analiz ediliyor...')
  const [topicErr, setTopicErr] = useState('')
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('profiles')
        .select('name,grade,language,plan,monthly_test_count')
        .eq('id', user.id).single()
      if (!data) { router.push('/profile'); return }
      setProfile(data)
    }
    load()
  }, [])

  function getLevel(grade: string) {
    return grade.startsWith('ilk') ? 'ilkokul'
      : grade.startsWith('orta') ? 'ortaokul'
      : grade.startsWith('lise') ? 'lise'
      : 'universite'
  }

  async function startQuiz() {
    const topic = customTopic.trim() || selectedTopic
    if (!topic) { setTopicErr('Bir konu seç veya yaz.'); return }
    setTopicErr('')

    // Freemium limit kontrolu
    if (profile?.plan === 'free' && (profile?.monthly_test_count || 0) >= 10) {
      setScreen('limit')
      return
    }

    setScreen('loading')
    const msgs = ['Profilin analiz ediliyor...', 'Mufredat kontrol ediliyor...', 'Sorular olusturuluyor...', 'Zorluk ayarlaniyor...', 'Son kontroller...']
    let mi = 0
    const iv = setInterval(() => { mi = (mi + 1) % msgs.length; setLoadMsg(msgs[mi]) }, 900)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ topic, questionCount: qCount }),
      })
      const data = await res.json()
      clearInterval(iv)
      if (!res.ok) throw new Error(data.error)

      // Profil sayacini guncelle
      setProfile(prev => prev ? { ...prev, monthly_test_count: (prev.monthly_test_count || 0) + 1 } : prev)

      setQuestions(data.questions)
      setSessionId(data.sessionId)
      setCurrent(0); setAnswers([]); setChosen(null)
      setScreen('quiz')
    } catch {
      clearInterval(iv)
      setLoadMsg('Hata olustu, tekrar deneyin.')
      setTimeout(() => setScreen('topic'), 2000)
    }
  }

  function choose(idx: number) {
    if (chosen !== null) return
    setChosen(idx)
    const correct = idx === questions[current].ans
    setAnswers(prev => [...prev, { userAns: idx, correct }])
  }

  async function next() {
    if (current + 1 >= questions.length) {
      const score = answers.filter(a => a.correct).length
      if (sessionId) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/generate-quiz', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ sessionId, answers, score }),
        })
      }
      setScreen('result')
    } else {
      setCurrent(c => c + 1); setChosen(null)
    }
  }

  const level = profile ? getLevel(profile.grade) : 'ortaokul'
  const suggestions = TOPIC_MAP[level] || TOPIC_MAP['ortaokul']
  const testsLeft = profile?.plan === 'free' ? 10 - (profile?.monthly_test_count || 0) : null

  // ── LIMIT SCREEN ──
  if (screen === 'limit') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📚</div>
        <h2 className="serif" style={{ fontSize: '26px', marginBottom: '0.75rem' }}>Bu ayki test hakkın doldu</h2>
        <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.7 }}>
          Ücretsiz planda ayda 10 test hakkın var. Sınırsız test için Premium'a geç veya arkadaşlarını davet ederek ücretsiz premium kazan.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link href="/pricing" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
            Premium'a geç →
          </Link>
          <Link href="/pricing#referral" className="btn btn-lg" style={{ justifyContent: 'center' }}>
            Arkadaşlarını davet et (ücretsiz premium)
          </Link>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '1rem' }}>
          Ay başında test hakkın sıfırlanır.
        </p>
      </div>
    </main>
  )

  // ── TOPIC SCREEN ──
  if (screen === 'topic') return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <span className="serif" style={{ fontSize: '20px' }}>Quiz<span style={{ color: 'var(--accent)' }}>AI</span></span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {testsLeft !== null && (
              <span style={{
                fontSize: '12px', padding: '4px 10px', borderRadius: '99px',
                background: testsLeft <= 2 ? 'var(--red-bg)' : 'var(--bg2)',
                color: testsLeft <= 2 ? 'var(--red)' : 'var(--text2)',
                border: `1px solid ${testsLeft <= 2 ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
              }}>
                {testsLeft} test kaldı
              </span>
            )}
            <Link href="/pricing" className="btn btn-sm" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
              {profile?.plan === 'premium' ? '★ Premium' : 'Yükselt'}
            </Link>
            <Link href="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await supabase.auth.signOut(); router.push('/') }}>Çıkış</button>
          </div>
        </nav>

        {profile && (
          <div className="anim-up" style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'var(--accent-bg)', border: '1.5px solid var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)', fontWeight: 600, fontSize: '15px',
              }}>
                {profile.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>Merhaba, {profile.name.split(' ')[0]}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{profile.grade} · {profile.language}</div>
              </div>
            </div>
          </div>
        )}

        <div className="card anim-up-1">
          <h2 className="serif" style={{ fontSize: '24px', marginBottom: '0.25rem' }}>Hangi konuyu test edelim?</h2>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.5rem' }}>
            Hazır konulardan birini seç ya da kendi konunu yaz.
          </p>

          <label className="field-label">Önerilen konular</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', marginBottom: '1rem' }}>
            {suggestions.map(s => (
              <button key={s.topic} className={`tag ${selectedTopic === s.topic ? 'active' : ''}`}
                onClick={() => { setSelectedTopic(s.topic); setCustomTopic('') }}>
                <span style={{ fontSize: '10px', color: 'var(--text3)', marginRight: '4px' }}>{s.subject}</span>
                {s.topic}
              </button>
            ))}
          </div>

          <label className="field-label">Veya kendi konunu yaz</label>
          <textarea className="input" rows={2}
            placeholder="Örn: Güneş sistemi, Osmanlı kuruluşu, Fotosentez..."
            value={customTopic}
            onChange={e => { setCustomTopic(e.target.value); setSelectedTopic('') }}
            style={{ resize: 'none' }}
          />

          <label className="field-label" style={{ marginTop: '16px' }}>Soru sayısı</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            {[5, 10, ...(profile?.plan === 'premium' ? [15, 20] : [15])].map(n => (
              <button key={n} className={`btn btn-sm ${qCount === n ? 'btn-primary' : ''}`}
                onClick={() => setQCount(n)}>
                {n} soru
              </button>
            ))}
          </div>

          {topicErr && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)' }}>{topicErr}</div>}

          <button className="btn btn-primary btn-lg" onClick={startQuiz}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}>
            Test oluştur ⚡
          </button>
        </div>
      </div>
    </main>
  )

  // ── LOADING ──
  if (screen === 'loading') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1.25rem' }} />
        <div style={{ fontWeight: 500, marginBottom: '0.4rem' }}>Sorular hazırlanıyor...</div>
        <div style={{ color: 'var(--text2)', fontSize: '13px' }}>{loadMsg}</div>
      </div>
    </main>
  )

  // ── QUIZ ──
  if (screen === 'quiz' && questions.length > 0) {
    const q = questions[current]
    const progPct = Math.round((current / questions.length) * 100)
    return (
      <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <span className="serif" style={{ fontSize: '18px' }}>Quiz<span style={{ color: 'var(--accent)' }}>AI</span></span>
            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>
              {answers.filter(a => a.correct).length} / {current} doğru
            </span>
          </div>
          <div className="progress-bar" style={{ marginBottom: '1.5rem' }}>
            <div className="progress-fill" style={{ width: `${progPct}%` }} />
          </div>

          <div className="card anim-up">
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '0.5rem', fontWeight: 500 }}>
              Soru {current + 1} / {questions.length}
            </div>
            <p style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.55, marginBottom: '1.5rem' }}>{q.q}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {q.opts.map((opt, i) => {
                let bg = 'var(--bg2)'
                let border = 'var(--border)'
                let color = 'var(--text)'
                if (chosen !== null) {
                  if (i === q.ans) { bg = 'var(--green-bg)'; border = 'rgba(22,163,74,0.35)'; color = 'var(--green)' }
                  else if (i === chosen) { bg = 'var(--red-bg)'; border = 'rgba(220,38,38,0.35)'; color = 'var(--red)' }
                }
                return (
                  <button key={i} onClick={() => choose(i)} disabled={chosen !== null}
                    style={{
                      textAlign: 'left', padding: '12px 15px', borderRadius: '10px',
                      border: `1.5px solid ${border}`, background: bg, color,
                      font: '14px/1.45 "DM Sans", sans-serif',
                      cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s',
                    }}>
                    <span style={{ fontWeight: 600, marginRight: '8px', opacity: 0.5 }}>{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                )
              })}
            </div>

            {chosen !== null && (
              <>
                <div style={{
                  marginTop: '1rem', padding: '12px 14px', borderRadius: '10px',
                  background: 'var(--bg2)', borderLeft: '3px solid var(--accent)',
                  fontSize: '13px', color: 'var(--text2)', lineHeight: 1.65,
                }}>
                  <strong style={{ color: chosen === q.ans ? 'var(--green)' : 'var(--red)' }}>
                    {chosen === q.ans ? 'Doğru! ' : 'Yanlış. '}
                  </strong>
                  {q.exp}
                </div>
                <button className="btn btn-primary" onClick={next}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                  {current + 1 < questions.length ? 'Sonraki soru →' : 'Sonuçları gör →'}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    )
  }

  // ── RESULT ──
  if (screen === 'result') {
    const finalScore = answers.filter(a => a.correct).length
    const finalPct = Math.round((finalScore / questions.length) * 100)
    const msg = finalPct === 100 ? 'Mükemmel! Tüm sorular doğru.' :
      finalPct >= 80 ? 'Çok iyi! Konuya hakimsin.' :
      finalPct >= 60 ? 'Fena değil, biraz daha pratik yaparsan harika olur.' :
      'Tekrar çalışmak isteyebilirsin.'

    return (
      <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="card anim-up" style={{ marginBottom: '1rem' }}>
            <div className="badge badge-purple" style={{ marginBottom: '1rem' }}>Test tamamlandı</div>
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div className="serif" style={{ fontSize: '64px', lineHeight: 1 }}>
                {finalScore}<span style={{ fontSize: '32px', color: 'var(--text2)' }}>/{questions.length}</span>
              </div>
              <div style={{ fontSize: '28px', color: finalPct >= 60 ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: '4px' }}>%{finalPct}</div>
              <div style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '0.75rem' }}>{msg}</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setScreen('topic'); setSelectedTopic(''); setCustomTopic('') }}
                style={{ flex: 1, justifyContent: 'center' }}>Yeni test</button>
              <Link href="/dashboard" className="btn" style={{ flex: 1, justifyContent: 'center' }}>Dashboard</Link>
            </div>
          </div>

          <div className="card anim-up-1">
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Cevap özeti
            </div>
            {questions.map((q, i) => (
              <div key={i} style={{ padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: answers[i]?.correct ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                    {answers[i]?.correct ? '✓' : '✗'}
                  </span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>{q.q}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                      Doğru: {String.fromCharCode(65 + q.ans)}. {q.opts[q.ans]}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return null
}
