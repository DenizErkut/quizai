'use client'
import PageHeader from '@/components/PageHeader'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Question { q: string; opts?: string[]; ans: number; exp?: string; type?: string; pairs?: {left: string; right: string}[]; items?: string[]; blank?: string; statements?: {text: string; correct: boolean}[] }
interface Streak { current_streak: number; longest_streak: number; total_points: number; last_activity_date: string | null }
interface Challenge { id: string; date: string; topic: string; subject: string; questions: Question[] }

export default function DailyPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [streak, setStreak] = useState<Streak | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [screen, setScreen] = useState<'home' | 'quiz' | 'done'>('home')
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<{ userAns: number; correct: boolean }[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [alreadyDone, setAlreadyDone] = useState(false)
  const [dailyQuestionType, setDailyQuestionType] = useState('multiple_choice')
  const supabase = createClient() as any

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const today = new Date().toISOString().split('T')[0]

    // Önce profili çek — grade'e göre challenge seçeceğiz
    const { data: p } = await supabase.from('profiles').select('name,grade,language,plan').eq('id', user.id).maybeSingle()

    const gradeGroup = !p?.grade ? 'ortaokul'
      : p.grade.includes('ilkokul') ? 'ilkokul'
      : p.grade.includes('lise') ? 'lise'
      : (p.grade.includes('universite') || p.grade.includes('üniversite')) ? 'universite'
      : 'ortaokul'

    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('streaks').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('daily_challenges').select('*')
        .eq('date', today)
        .eq('grade_level', gradeGroup)
        .maybeSingle(),
    ])

    setProfile(p)
    setStreak(s)

    // Bugün günlük test tamamlandı mı? — SADECE daily_challenges tablosuna bak
    // (streak.last_activity_date quiz dışı aktivitede de güncellenebilir, güvenilmez)
    const todayDoneInChallenges = c?.date === today && c?.completed === true
    
    // Yedek kontrol: daily_challenges'ta completed yoksa quiz_sessions'dan bak
    // Sadece is_daily=true olan session'lara bak — normal testlerle karışmasın
    let todayDoneInSessions = false
    if (!todayDoneInChallenges) {
      const { data: dailySessions } = await supabase
        .from('quiz_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('completed', true)
        .eq('is_daily', true)
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59')
        .limit(1)
      todayDoneInSessions = (dailySessions?.length || 0) > 0
    }

    if (todayDoneInChallenges || todayDoneInSessions) {
      setAlreadyDone(true)
    }

    if (c) {
      setChallenge(c)
    } else {
      await generateDailyChallenge(p, user)
    }
    setLoading(false)
  }

  async function generateDailyChallenge(p: any, user: any) {
    setGenerating(true)
    const { data: { session } } = await supabase.auth.getSession()

    const gradeGroup = !p?.grade ? 'ortaokul'
      : p.grade.includes('ilkokul') ? 'ilkokul'
      : p.grade.includes('lise') ? 'lise'
      : (p.grade.includes('universite') || p.grade.includes('üniversite')) ? 'universite'
      : 'ortaokul'

    const TOPICS: Record<string, string[]> = {
      ilkokul: ['Toplama ve çıkarma', 'Hayvanlar', 'Mevsimler', 'Vücudumuz', 'Türkiye haritası', 'Çarpım tablosu', 'Sağlıklı beslenme'],
      ortaokul: ['Türkiye coğrafyası', 'Osmanlı tarihi', 'Hücre biyolojisi', 'Denklemler', 'Fotosentez', 'Atatürk ilkeleri', 'Doğal sayılar'],
      lise: ['Türev ve integral', 'Osmanlı çöküşü', 'Genetik', 'Organik kimya', 'Elektromanyetizma', 'Edebiyat akımları', 'Trigonometri'],
      universite: ['Diferansiyel denklemler', 'Makroekonomi', 'Termodinamik', 'Hukuk felsefesi', 'Veri yapıları', 'İstatistik', 'Moleküler biyoloji'],
    }

    const topics = TOPICS[gradeGroup] || TOPICS.ortaokul
    const topic = topics[new Date().getDay() % topics.length]

    // Günün gününe göre soru tipi rotate (Pzt=çoktan seçmeli, Sal=boşluk, Çar=D/Y ...)
    const DAILY_TYPES = ['multiple_choice', 'fill_blank', 'true_false', 'matching', 'ordering', 'multiple_choice', 'mixed']
    const dailyQuestionType = DAILY_TYPES[new Date().getDay()]
    setDailyQuestionType(dailyQuestionType)

    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ topic, questionCount: 5, difficulty: 'normal', language: p?.language || 'Türkçe', dailyChallenge: true, questionType: dailyQuestionType }),
    })
    const data = await res.json()
    if (data.questions) {
      const today = new Date().toISOString().split('T')[0]
      const { data: newChallenge } = await supabase.from('daily_challenges').insert({
        date: today,
        topic,
        subject: 'Genel',
        grade_level: gradeGroup,
        questions: data.questions,
        question_type: dailyQuestionType || 'multiple_choice',
      }).select().single()
      setChallenge(newChallenge)
    }
    setGenerating(false)
  }

  function choose(idx: number) {
    if (chosen !== null || !challenge) return
    setChosen(idx)
    const correct = idx === challenge.questions[current].ans
    setAnswers(prev => [...prev, { userAns: idx, correct }])
  }

  async function next() {
    if (!challenge) return
    if (current + 1 >= challenge.questions.length) {
      const score = answers.filter(a => a.correct).length
      const { data: { user } } = await supabase.auth.getUser()
      const today = new Date().toISOString().split('T')[0]

      // Quiz session kaydet — completed:true olsun ki arşivde görünsün
      await supabase.from('quiz_sessions').insert({
        user_id: user.id,
        topic: challenge.topic,
        grade: profile?.grade,
        language: profile?.language,
        question_count: challenge.questions.length,
        questions: challenge.questions,
        answers,
        score,
        pct: Math.round(score / challenge.questions.length * 100),
        completed: true,
        question_type: dailyQuestionType || 'multiple_choice',
      })

      // Streak güncelle
      // daily_challenges tablosunu tamamlandı olarak işaretle
      if (challenge?.id) {
        await supabase.from('daily_challenges').update({ completed: true }).eq('id', challenge.id)
      }

      const { data: streakData } = await supabase
        .from('streaks').select('*').eq('user_id', user.id).single()

      if (!streakData) {
        await supabase.from('streaks').insert({
          user_id: user.id, current_streak: 1, longest_streak: 1,
          total_points: 10, last_activity_date: today,
        })
      } else if (streakData.last_activity_date !== today) {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
        const yStr = yesterday.toISOString().split('T')[0]
        const ns = streakData.last_activity_date === yStr ? (streakData.current_streak || 0) + 1 : 1
        await supabase.from('streaks').update({
          current_streak: ns,
          longest_streak: Math.max(ns, streakData.longest_streak || 0),
          total_points: (streakData.total_points || 0) + 10,
          last_activity_date: today,
        }).eq('user_id', user.id)
        setStreak(prev => prev ? { ...prev, current_streak: ns, last_activity_date: today } : prev)
      }

      setAlreadyDone(true)
      setScreen('done')
    } else {
      setCurrent(c => c + 1); setChosen(null)
    }
  }

  // Streak flame rengi
  function flameColor(n: number) {
    if (n >= 30) return '#ef4444'
    if (n >= 14) return '#f97316'
    if (n >= 7) return '#eab308'
    return '#C9A84C'
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  // ── HOME ──
  if (screen === 'home') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 0, padding: '0' }}>
      <PageHeader title="Günlük Test" subtitle="Serisini koru, her gün yeni sorular" icon="🔥" color="#ef4444" backHref="/quiz" backLabel="Teste dön" />
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '2rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Günlük</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Günlük test</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            Her gün 5 soru — serini koru!
          </p>
        </div>

        {/* Streak kartı */}
        <div className="card anim-up-1" style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '8px' }}>🔥</div>
          <div style={{ fontSize: '48px', fontWeight: 700, color: flameColor(streak?.current_streak || 0), lineHeight: 1 }}>
            {streak?.current_streak || 0}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text2)', marginTop: '4px' }}>günlük seri</div>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '1.25rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--accent)' }}>{streak?.longest_streak || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>En uzun seri</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--accent)' }}>{streak?.total_points || 0}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Toplam puan</div>
            </div>
          </div>
        </div>

        {/* Challenge kartı */}
        {challenge && (
          <div className="card anim-up-2" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '4px' }}>
                  {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div style={{ fontWeight: 600, fontSize: '18px' }}>{challenge.topic}</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '2px' }}>5 soru · Normal zorluk</div>
              </div>
              <div style={{ fontSize: '32px' }}>📝</div>
            </div>

            {alreadyDone ? (
              <div style={{ marginTop: '1rem', padding: '12px', borderRadius: '10px', background: 'var(--green-bg)', border: '1px solid rgba(22,163,74,0.2)', fontSize: '13px', color: 'var(--green)', textAlign: 'center' }}>
                ✓ Bugünkü testi tamamladın! Yarın tekrar gel.
              </div>
            ) : generating ? (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: 'var(--text2)' }}>
                <div className="spinner" style={{ width: 16, height: 16 }} /> Sorular hazırlanıyor...
              </div>
            ) : (
              <button className="btn btn-primary" onClick={() => setScreen('quiz')}
                style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                Teste başla 🔥
              </button>
            )}
          </div>
        )}

        {/* Streak milestones */}
        <div className="card anim-up-3">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Seri hedefleri</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { days: 3, emoji: '⭐', label: '3 gün' },
              { days: 7, emoji: '🌟', label: '1 hafta' },
              { days: 14, emoji: '🏆', label: '2 hafta' },
              { days: 30, emoji: '🔥', label: '1 ay' },
            ].map(m => {
              const done = (streak?.current_streak || 0) >= m.days
              return (
                <div key={m.days} style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: '8px', background: done ? 'var(--accent-bg)' : 'var(--bg2)', border: `1px solid ${done ? 'rgba(91,76,245,0.2)' : 'var(--border)'}` }}>
                  <div style={{ fontSize: '20px' }}>{m.emoji}</div>
                  <div style={{ fontSize: '11px', color: done ? 'var(--accent)' : 'var(--text3)', marginTop: '4px', fontWeight: done ? 600 : 400 }}>{m.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )

  // ── QUIZ ──
  if (screen === 'quiz' && challenge) {
    const q = challenge.questions[current]
    const progPct = Math.round((current / challenge.questions.length) * 100)
    return (
      <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span className="serif" style={{ fontSize: '18px' }}>PRATIUM</span>
            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>🔥 {streak?.current_streak || 0} gün seri</span>
          </div>
          <div className="progress-bar" style={{ marginBottom: '1.5rem' }}>
            <div className="progress-fill" style={{ width: `${progPct}%` }} />
          </div>
          <div className="card anim-up">
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '0.75rem' }}>
              Günlük Test · Soru {current + 1}/{challenge.questions.length}
            </div>
            <p style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.55, marginBottom: '1.5rem' }}>{q.q}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {((): React.ReactNode => {
                const qq = q as any
                if (qq.type === 'matching' && qq.pairs) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {qq.pairs.map((pair: any, i: number) => {
                        const sel = (chosen as any)?.[i]
                        const rightOptions = qq.pairs.map((p: any) => p.right)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, padding: '10px 13px', borderRadius: '9px', background: 'var(--bg2)', border: '1.5px solid var(--border)', fontSize: '13px', fontWeight: 600 }}>{pair.left}</div>
                            <span style={{ color: 'var(--text4)' }}>→</span>
                            <select disabled={chosen !== null} value={sel ?? ''}
                              onChange={e => {
                                if (chosen !== null) return
                                const prev: any = (typeof chosen === 'object' && chosen !== null) ? chosen : {}
                                const next = { ...prev, [i]: e.target.value }
                                if (Object.keys(next).length === qq.pairs.length) {
                                  const allCorrect = qq.pairs.every((p: any, idx: number) => next[idx] === p.right)
                                  choose(allCorrect ? qq.ans : -1)
                                } else { setChosen(next as any) }
                              }}
                              style={{ flex: 1, padding: '10px 13px', borderRadius: '9px', border: `1.5px solid ${chosen !== null ? (sel === pair.right ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)') : 'var(--border)'}`, background: chosen !== null ? (sel === pair.right ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontSize: '13px', color: 'var(--text)', outline: 'none' }}>
                              <option value="">Seç...</option>
                              {rightOptions.map((r: string, j: number) => <option key={j} value={r}>{r}</option>)}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  )
                }
                if (qq.type === 'ordering' && qq.items) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(qq.items as string[]).map((item: string, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text4)', width: '20px' }}>{i + 1}.</span>
                          <div style={{ flex: 1, padding: '10px 13px', borderRadius: '9px', background: 'var(--bg2)', border: '1.5px solid var(--border)', fontSize: '13px' }}>{item}</div>
                        </div>
                      ))}
                      {chosen === null && (
                        <button onClick={() => choose(qq.ans)} className="btn btn-primary" style={{ marginTop: '8px', justifyContent: 'center', fontSize: '13px' }}>
                          Sıralamayı Onayla
                        </button>
                      )}
                    </div>
                  )
                }
                if (qq.type === 'true_false' || qq.type === 'multi_true_false') {
                  return (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {['Doğru', 'Yanlış'].map((lbl, i) => {
                        let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--text)'
                        if (chosen !== null) {
                          if (i === qq.ans) { bg = 'var(--green-bg)'; border = 'rgba(22,163,74,0.35)'; color = 'var(--green)' }
                          else if (i === chosen) { bg = 'var(--red-bg)'; border = 'rgba(220,38,38,0.35)'; color = 'var(--red)' }
                        }
                        return (
                          <button key={i} onClick={() => choose(i)} disabled={chosen !== null}
                            style={{ flex: 1, padding: '16px', borderRadius: '12px', border: `2px solid ${border}`, background: bg, color, fontSize: '15px', fontWeight: 700, cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                            {i === 0 ? '✓ ' : '✗ '}{lbl}
                          </button>
                        )
                      })}
                    </div>
                  )
                }
                // Varsayılan: çoktan seçmeli / boşluk doldurma
                return (
                  <>
                    {(qq.opts || []).map((opt: string, i: number) => {
                      let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--text)'
                      if (chosen !== null) {
                        if (i === qq.ans) { bg = 'var(--green-bg)'; border = 'rgba(22,163,74,0.35)'; color = 'var(--green)' }
                        else if (i === chosen) { bg = 'var(--red-bg)'; border = 'rgba(220,38,38,0.35)'; color = 'var(--red)' }
                      }
                      return (
                        <button key={i} onClick={() => choose(i)} disabled={chosen !== null}
                          style={{ textAlign: 'left', padding: '12px 15px', borderRadius: '10px', border: `1.5px solid ${border}`, background: bg, color, fontSize: '14px', cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s', width: '100%' }}>
                          <span style={{ fontWeight: 600, marginRight: '8px', opacity: 0.5 }}>{String.fromCharCode(65 + i)}.</span>{opt}
                        </button>
                      )
                    })}
                  </>
                )
              })()}
            </div>
            {chosen !== null && (
              <>
                <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', borderLeft: '3px solid var(--accent)', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.65 }}>
                  <strong style={{ color: chosen === q.ans ? 'var(--green)' : 'var(--red)' }}>{chosen === q.ans ? 'Doğru! ' : 'Yanlış. '}</strong>{q.exp}
                </div>
                <button className="btn btn-primary" onClick={next} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                  {current + 1 < challenge.questions.length ? 'Sonraki →' : 'Sonuçlar →'}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    )
  }

  // ── DONE ──
  if (screen === 'done') {
    const score = answers.filter(a => a.correct).length
    const pct = Math.round(score / 5 * 100)
    const newStreak = (streak?.current_streak || 0) + 1
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center' }} className="anim-up">
          <div style={{ fontSize: '64px', marginBottom: '1rem' }}>
            {pct === 100 ? '🏆' : pct >= 60 ? '🎉' : '💪'}
          </div>
          <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>Günlük test tamam!</h2>
          <div style={{ fontSize: '42px', fontWeight: 700, color: pct >= 60 ? 'var(--green)' : 'var(--red)', marginBottom: '0.5rem' }}>
            {score}/5
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '24px' }}>🔥</span>
            <span style={{ fontSize: '20px', fontWeight: 600, color: flameColor(newStreak) }}>{newStreak} gün seri!</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link href="/quiz" className="btn btn-primary" style={{ justifyContent: 'center' }}>Yeni test yap</Link>
            <Link href="/dashboard" className="btn" style={{ justifyContent: 'center' }}>Dashboard</Link>
          </div>
        </div>
      </main>
    )
  }

  return null
}
