'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SUBJECT_MAP } from '@/lib/subject-map'

function levelFromGrade(grade: string): string {
  const g = (grade || '').toLowerCase()
  if (g.includes('ilkokul')) return 'ilkokul'
  if (g.includes('ortaokul')) return 'ortaokul'
  if (g.includes('lise')) return 'lise'
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'
  return 'ortaokul'
}

interface RubricItem { criterion: string; maxPoints: number; description: string }
interface CriteriaResult { criterion: string; maxPoints: number; earnedPoints: number; feedback: string }

export default function AcikUcluPage() {
  const router = useRouter()
  const supabase = createClient() as any

  const [loading, setLoading] = useState(true)
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')

  const [step, setStep] = useState<'setup' | 'question' | 'graded'>('setup')
  const [generating, setGenerating] = useState(false)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState('')

  const [sessionId, setSessionId] = useState('')
  const [scenario, setScenario] = useState('')
  const [question, setQuestion] = useState('')
  const [rubric, setRubric] = useState<RubricItem[]>([])
  const [totalPossible, setTotalPossible] = useState(0)
  const [answer, setAnswer] = useState('')

  const [criteriaResults, setCriteriaResults] = useState<CriteriaResult[]>([])
  const [overallFeedback, setOverallFeedback] = useState('')
  const [totalEarned, setTotalEarned] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('profiles').select('grade').eq('id', user.id).single()
      setGrade(p?.grade || 'ortaokul 6. sınıf')
      setLoading(false)
    }
    load()
  }, [])

  const level = levelFromGrade(grade)
  const subjects = Object.keys(SUBJECT_MAP[level] || {})
  const topics = subject ? (SUBJECT_MAP[level]?.[subject] || []) : []

  async function generate() {
    if (!subject || !topic.trim()) { setError('Ders ve konu seçmelisin.'); return }
    setGenerating(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subject, topic }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error === 'daily_limit_reached' ? 'Günlük test hakkın doldu.' :
                  json.error === 'monthly_limit_reached' ? 'Aylık test hakkın doldu.' :
                  json.error || 'Soru üretilemedi.')
        setGenerating(false)
        return
      }
      setSessionId(json.sessionId)
      setScenario(json.scenario)
      setQuestion(json.question)
      setRubric(json.rubric)
      setTotalPossible(json.totalPossible)
      setAnswer('')
      setStep('question')
    } catch {
      setError('Bağlantı hatası, tekrar dene.')
    }
    setGenerating(false)
  }

  async function submitAnswer() {
    if (!answer.trim()) { setError('Cevabını yazmadan gönderemezsin.'); return }
    setGrading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/grade-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ sessionId, studentAnswer: answer }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Puanlama başarısız.'); setGrading(false); return }
      setCriteriaResults(json.criteriaResults)
      setOverallFeedback(json.overallFeedback)
      setTotalEarned(json.totalEarned)
      setStep('graded')
    } catch {
      setError('Bağlantı hatası, tekrar dene.')
    }
    setGrading(false)
  }

  function newQuestion() {
    setStep('setup')
    setTopic('')
    setError('')
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: 'linear-gradient(135deg, #082465 0%, #0d3b8e 60%, #3E8E3E 100%)',
        padding: '1.75rem 1.5rem 2.25rem', color: '#fff',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <Link href="/home" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>← Ana ekran</Link>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px' }}>✍️ Açık Uçlu Sorular</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
            MEB ortak sınav formatında: senaryo + açık uçlu soru + dereceli puanlama
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        {error && (
          <div style={{ marginBottom: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* ADIM 1: Ders/Konu seçimi */}
        {step === 'setup' && (
          <div className="card" style={{ padding: '1.5rem' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>Ders</label>
            <select className="input" value={subject} onChange={e => { setSubject(e.target.value); setTopic('') }}
              style={{ marginTop: '6px', marginBottom: '1.25rem' }}>
              <option value="">— Ders seç —</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {subject && (
              <>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>Konu</label>
                <select className="input" value={topic} onChange={e => setTopic(e.target.value)}
                  style={{ marginTop: '6px', marginBottom: '1.5rem' }}>
                  <option value="">— Konu seç —</option>
                  {topics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={generate} disabled={generating || !subject || !topic}>
              {generating ? 'Senaryo hazırlanıyor…' : '✍️ Soruyu Oluştur'}
            </button>
          </div>
        )}

        {/* ADIM 2: Senaryo + Soru + Cevap yazma */}
        {step === 'question' && (
          <div>
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem', borderLeft: '3px solid #3E8E3E' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#3E8E3E', marginBottom: '6px', textTransform: 'uppercase' }}>Senaryo</div>
              <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7 }}>{scenario}</p>
            </div>
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', marginBottom: '6px', textTransform: 'uppercase' }}>Soru</div>
              <p style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.6 }}>{question}</p>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>Cevabın</label>
              <textarea className="input" rows={8} value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="Kendi cümlelerinle, düşüncelerini gerekçelendirerek yaz…"
                style={{ marginTop: '8px', marginBottom: '1rem', resize: 'vertical', borderRadius: '12px' }} />
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={submitAnswer} disabled={grading}>
                {grading ? 'Değerlendiriliyor…' : 'Cevabımı Gönder'}
              </button>
            </div>
          </div>
        )}

        {/* ADIM 3: Rubrik bazlı sonuç */}
        {step === 'graded' && (
          <div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '6px' }}>Puanın</div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: totalEarned / totalPossible >= 0.7 ? 'var(--green)' : totalEarned / totalPossible >= 0.4 ? '#d97706' : 'var(--red)' }}>
                {totalEarned} / {totalPossible}
              </div>
              {overallFeedback && <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '10px', lineHeight: 1.6 }}>{overallFeedback}</p>}
            </div>

            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>
              Dereceli Puanlama Anahtarı — Kriter Kriter
            </div>
            {criteriaResults.map((c, i) => (
              <div key={i} className="card-sm" style={{ padding: '14px 16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.criterion}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: c.earnedPoints >= c.maxPoints * 0.7 ? 'var(--green)' : c.earnedPoints > 0 ? '#d97706' : 'var(--red)' }}>
                    {c.earnedPoints} / {c.maxPoints}
                  </span>
                </div>
                <div style={{ background: 'var(--border)', borderRadius: '4px', height: '6px', marginBottom: '8px' }}>
                  <div style={{ background: 'var(--accent)', height: '6px', borderRadius: '4px', width: `${Math.min(100, (c.earnedPoints / c.maxPoints) * 100)}%` }} />
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}>{c.feedback}</p>
              </div>
            ))}

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }} onClick={newQuestion}>
              Yeni Soru Çöz
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
