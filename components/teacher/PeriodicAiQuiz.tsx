'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Question = { id: string; topicLabel: string; q: string; options: string[] }
type Status = {
  due: boolean; nextDueAt: string | null; level: number; maxLevel: number; intervalDays: number; roundsTaken: number
  lastScore: number | null; lastPassed: boolean | null
  history: Array<{ roundNo: number; level: number; score: number; passed: boolean; submittedAt: string }>
  open: { roundId: string; roundNo: number; level: number; questions: Question[] } | null
}
type Result = { score: number; passed: boolean; level: number; nextLevel: number; leveledUp: boolean; nextDueAt: string; results: Array<{ id: string; selected: number; correct: number; isCorrect: boolean; explanation: string }> }

/** Periodic (every 10 days) AI-literacy test whose questions get harder with each pass. */
export default function PeriodicAiQuiz() {
  const supabase = useMemo(() => createClient(), [])
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [round, setRound] = useState<{ roundId: string; roundNo: number; level: number; questions: Question[] } | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    setToken(session.access_token)
    const response = await fetch('/api/teacher/ai-quiz', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (response.ok && data) {
      setStatus(data)
      if (data.open) { setRound(data.open); setAnswers(new Array(data.open.questions.length).fill(-1)) }
    }
  }, [supabase])
  useEffect(() => { void load() }, [load])

  async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/teacher/ai-quiz', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
    return data
  }
  async function start() {
    setBusy(true); setError(''); setResult(null)
    try {
      const data = await call({ action: 'start' })
      setRound(data); setAnswers(new Array(data.questions.length).fill(-1))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Test başlatılamadı.') } finally { setBusy(false) }
  }
  async function submit() {
    if (!round) return
    setBusy(true); setError('')
    try {
      setResult(await call({ action: 'submit', roundId: round.roundId, answers }))
      setRound(null)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sonuç kaydedilemedi.') } finally { setBusy(false) }
  }

  if (!status) return null
  const letters = ['A', 'B', 'C', 'D']
  return (
    <section className="card" aria-labelledby="periodic-ai-quiz-title" style={{ display: 'grid', gap: 12, border: status.due ? '2px solid var(--accent)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 id="periodic-ai-quiz-title" style={{ margin: 0, color: 'var(--primary)', fontSize: 18 }}>🧠 Düzenli AI bilgi testi</h2>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Her {status.intervalDays} günde bir · 4 soru · her başarıdan sonra sorular zorlaşır</div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12 }}>
          <strong style={{ fontSize: 18 }}>Seviye {status.level}/{status.maxLevel}</strong>
          <div style={{ color: 'var(--text2)' }}>{status.roundsTaken} test tamamlandı</div>
        </div>
      </div>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}

      {result && (
        <div role="status" style={{ display: 'grid', gap: 8 }}>
          <strong style={{ color: result.passed ? 'var(--green)' : 'var(--text)' }}>
            {result.passed ? '✓ Başardın' : 'Bu sefer olmadı'} — {result.score}/4{result.leveledUp ? ` · Yeni seviye: ${result.nextLevel}/${status.maxLevel} (sorular zorlaşıyor)` : result.passed ? ' · En üst seviyedesin' : ' · Aynı seviyede devam'}
          </strong>
          {result.results.map((item, index) => (
            <div key={item.id} style={{ fontSize: 13, padding: '8px 10px', borderRadius: 9, background: item.isCorrect ? 'var(--green-bg, #e4f1ec)' : 'var(--red-bg, #fdecea)' }}>
              <b>Soru {index + 1}: {item.isCorrect ? 'Doğru' : `Yanlış (doğru şık ${letters[item.correct]})`}</b> — {item.explanation}
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sonraki test: {new Date(result.nextDueAt).toLocaleDateString('tr-TR')}</div>
        </div>
      )}

      {round && (
        <div style={{ display: 'grid', gap: 12 }}>
          {round.questions.map((question, index) => (
            <fieldset key={question.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6 }}>
              <legend style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', padding: '0 6px' }}>{question.topicLabel}</legend>
              <div style={{ fontWeight: 600, lineHeight: 1.5 }}>{index + 1}. {question.q}</div>
              {question.options.map((option, optionIndex) => (
                <label key={optionIndex} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
                  <input type="radio" name={`q-${question.id}`} checked={answers[index] === optionIndex} onChange={() => setAnswers(prev => prev.map((value, i) => i === index ? optionIndex : value))} style={{ marginTop: 4 }} />
                  <span><b>{letters[optionIndex]})</b> {option}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <button className="btn btn-primary" disabled={busy || answers.some(value => value < 0)} onClick={() => void submit()}>{busy ? 'Kaydediliyor…' : 'Testi bitir'}</button>
        </div>
      )}

      {!round && !result && (status.due
        ? <button className="btn btn-primary" disabled={busy} onClick={() => void start()}>{busy ? 'Hazırlanıyor…' : status.roundsTaken ? 'Yeni testi başlat' : 'İlk testi başlat'}</button>
        : <div style={{ fontSize: 13, color: 'var(--text2)' }}>Sonraki test: <b>{status.nextDueAt ? new Date(status.nextDueAt).toLocaleDateString('tr-TR') : 'yakında'}</b></div>)}

      {status.history.length > 0 && !round && (
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Son testler: {status.history.map(item => `#${item.roundNo} S${item.level} ${item.score}/4${item.passed ? '✓' : ''}`).join(' · ')}
        </div>
      )}
    </section>
  )
}
