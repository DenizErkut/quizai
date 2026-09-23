'use client'
// app/ai-literacy/page.tsx — AI Okuryazarlığı Modu.
//
// 23 Eylül 2026 — bkz. lib/ai-literacy-generation.ts başlık yorumu.
// Akış: ders/konu seç → /api/ai-literacy POST ile bir "mücadele" üret
// (doğru cevap ASLA istemciye gönderilmez) → öğrenci A/B seçer + kısa
// gerekçe yazar → /api/ai-literacy PATCH ile gönder → doğruluk +
// flaw_explanation/correct_reasoning geri bildirimi göster.
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SUBJECT_MAP } from '@/lib/subject-map'

function levelFromGrade(grade: string | null | undefined): string {
  if (!grade) return 'ortaokul'
  const g = grade.toLocaleLowerCase('tr-TR')
  if (g.includes('ilkokul')) return 'ilkokul'
  if (g.includes('ortaokul')) return 'ortaokul'
  if (g.includes('lise')) return 'lise'
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'
  return 'ortaokul'
}

interface Challenge {
  id: string
  question: string
  answerA: string
  answerB: string
}

interface Feedback {
  isCorrect: boolean
  correctChoice: 'A' | 'B'
  flawExplanation: string
  correctReasoning: string
}

export default function AILiteracyPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [subjects, setSubjects] = useState<Record<string, string[]>>({})
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [choice, setChoice] = useState<'A' | 'B' | null>(null)
  const [reasoning, setReasoning] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('grade').eq('id', user.id).maybeSingle()
      const level = levelFromGrade(profile?.grade)
      const levelSubjects = SUBJECT_MAP[level] ?? SUBJECT_MAP.ortaokul
      setSubjects(levelSubjects)
      const firstSubject = Object.keys(levelSubjects)[0] || ''
      setSubject(firstSubject)
      setTopic((levelSubjects[firstSubject] || [])[0] || '')
      setLoadingProfile(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (!subject || !topic || generating) return
    setGenerating(true); setError(''); setChallenge(null); setFeedback(null); setChoice(null); setReasoning('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-literacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subject, topic }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Üretilemedi.'); setGenerating(false); return }
      setChallenge(data)
    } catch {
      setError('Bağlantı hatası, lütfen tekrar dene.')
    }
    setGenerating(false)
  }

  async function submit() {
    if (!challenge || !choice || submitting) return
    setSubmitting(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-literacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id: challenge.id, choice, reasoning }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Gönderilemedi.'); setSubmitting(false); return }
      setFeedback(data)
    } catch {
      setError('Bağlantı hatası, lütfen tekrar dene.')
    }
    setSubmitting(false)
  }

  const topics = subjects[subject] || []

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/dashboard" className="btn-ghost btn" style={{ padding: '6px 10px' }}>←</Link>
        <span style={{ fontSize: '22px' }}>🔍</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--primary)' }}>AI Okuryazarlığı</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>İki AI cevabından hangisi doğru? Neden?</div>
        </div>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.25rem' }}>
        {loadingProfile ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
        ) : !challenge ? (
          <div className="card">
            <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '16px' }}>
              Sana bir soru ve bu soruya "AI tarafından üretilmiş" iki farklı cevap göstereceğiz. Biri doğru, biri gerçekçi ama hatalı — hangisi hangisi, sana söylenmeyecek. Amaç doğru cevabı ezberlemek değil, bir AI cevabını her zaman sorgulamadan kabul etmemeyi alıştırmak.
            </p>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)' }}>Ders</label>
            <select value={subject} onChange={e => { setSubject(e.target.value); setTopic((subjects[e.target.value] || [])[0] || '') }}
              style={{ width: '100%', padding: '10px', marginTop: '4px', marginBottom: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              {Object.keys(subjects).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)' }}>Konu</label>
            <select value={topic} onChange={e => setTopic(e.target.value)}
              style={{ width: '100%', padding: '10px', marginTop: '4px', marginBottom: '16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {error && <p style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate} disabled={generating}>
              {generating ? 'Hazırlanıyor…' : 'Başla'}
            </button>
          </div>
        ) : (
          <div className="card">
            <p style={{ fontSize: '14.5px', fontWeight: 600, lineHeight: 1.6, marginBottom: '16px' }}>{challenge.question}</p>

            {(['A', 'B'] as const).map(letter => {
              const text = letter === 'A' ? challenge.answerA : challenge.answerB
              const isPicked = choice === letter
              const isCorrectAnswer = feedback && letter === feedback.correctChoice
              const isWrongPick = feedback && isPicked && !feedback.isCorrect
              return (
                <button
                  key={letter}
                  onClick={() => !feedback && setChoice(letter)}
                  disabled={!!feedback}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '14px', marginBottom: '10px',
                    borderRadius: '12px', cursor: feedback ? 'default' : 'pointer',
                    border: isPicked ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: feedback
                      ? (isCorrectAnswer ? 'rgba(22,163,74,0.08)' : isWrongPick ? 'rgba(220,38,38,0.08)' : 'transparent')
                      : (isPicked ? 'rgba(99,102,241,0.06)' : 'transparent'),
                  }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '4px' }}>
                    Cevap {letter} {feedback && isCorrectAnswer ? '✅' : ''}{feedback && isWrongPick ? '❌' : ''}
                  </div>
                  <div style={{ fontSize: '13.5px', lineHeight: 1.6 }}>{text}</div>
                </button>
              )
            })}

            {!feedback && (
              <>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginTop: '8px', display: 'block' }}>
                  Neden bu cevabı seçtin? (kısaca yaz)
                </label>
                <textarea value={reasoning} onChange={e => setReasoning(e.target.value)} rows={3}
                  placeholder="Örn: Diğer cevaptaki hesaplama bence yanlış çünkü..."
                  style={{ width: '100%', padding: '10px', marginTop: '4px', marginBottom: '12px', borderRadius: '10px', border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '13px' }} />
                {error && <p style={{ color: 'var(--red)', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit} disabled={!choice || submitting}>
                  {submitting ? 'Gönderiliyor…' : 'Cevabı Gönder'}
                </button>
              </>
            )}

            {feedback && (
              <div style={{ marginTop: '14px', padding: '14px', borderRadius: '12px', background: feedback.isCorrect ? 'rgba(22,163,74,0.08)' : 'rgba(217,119,6,0.08)' }}>
                <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '13.5px' }}>
                  {feedback.isCorrect ? '✅ Doğru seçtin!' : '🤔 Bu sefer AI\'nın hatalı cevabına kandın.'}
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '8px' }}><strong>Doğru cevap neden doğru:</strong> {feedback.correctReasoning}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}><strong>Hatalı cevaptaki sorun:</strong> {feedback.flawExplanation}</div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={generate}>Yeni Mücadele</button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
