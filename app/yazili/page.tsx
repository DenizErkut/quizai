'use client'
import MathText from '@/components/MathText'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'

type SetItem = { id: string; title: string; subject: string; term: number; examNumber: number; totalPoints: number; questionCount: number
  attempt: { id: string; status: string; total_earned: number | null; total_possible: number | null } | null }
type CriteriaResult = { criterion: string; maxPoints: number; earnedPoints: number; feedback: string }
type Row = { questionId: string; position: number; title: string; maxPoints: number; graded: boolean; earned: number | null
  criteriaResults?: CriteriaResult[]; overallFeedback?: string; studentAnswer?: string }
type Summary = { totalEarned: number; totalPossible: number; answered: number; percent: number }
type Current = { sessionId: string; position: number; title: string; scenario: string; question: string; maxPoints: number; questionId: string }

export default function YaziliPage() {
  const router = useRouter()
  const { t } = useT()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [sets, setSets] = useState<SetItem[]>([])
  const [needsGrade, setNeedsGrade] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const [step, setStep] = useState<'list' | 'question' | 'feedback' | 'result'>('list')
  const [attemptId, setAttemptId] = useState('')
  const [setTitle, setSetTitle] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [current, setCurrent] = useState<Current | null>(null)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<{ criteriaResults: CriteriaResult[]; overallFeedback: string; totalEarned: number } | null>(null)

  async function call(path: string, init?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...(init?.headers || {}) }, cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, data }
  }

  async function loadSets() {
    const { ok, data } = await call('/api/student/written-exams')
    if (!ok) { setError(data.error || t('Yazılılar yüklenemedi.')); return }
    setSets(data.sets || []); setNeedsGrade(!!data.needsGrade)
  }

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await loadSets()
      setLoading(false)
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openQuestion(id: string, list: Row[]) {
    const next = list.find(row => !row.graded)
    if (!next) { await finish(id); return }
    const { ok, data } = await call('/api/student/written-exams', { method: 'POST', body: JSON.stringify({ action: 'open', attemptId: id, questionId: next.questionId }) })
    if (!ok) { setError(data.error || t('Soru açılamadı.')); return }
    setCurrent({ ...data, questionId: next.questionId }); setAnswer(''); setFeedback(null); setStep('question')
  }

  async function start(setItem: SetItem, restart = false) {
    setBusy(setItem.id); setError('')
    try {
      const { ok, data } = await call('/api/student/written-exams', { method: 'POST', body: JSON.stringify({ action: 'start', setId: setItem.id, restart }) })
      if (!ok) { setError(data.error || t('Yazılı başlatılamadı.')); return }
      setAttemptId(data.attempt.id); setSetTitle(setItem.title); setRows(data.questions); setSummary(data.summary)
      if (data.attempt.status === 'completed') { setStep('result'); return }
      await openQuestion(data.attempt.id, data.questions)
    } catch { setError(t('Bağlantı hatası, tekrar dene.')) }
    finally { setBusy('') }
  }

  async function submit() {
    if (!current) return
    if (!answer.trim()) { setError(t('Cevabını yazmadan gönderemezsin.')); return }
    setBusy('grade'); setError('')
    try {
      const { ok, data } = await call('/api/grade-open-ended', { method: 'POST', body: JSON.stringify({ sessionId: current.sessionId, studentAnswer: answer }) })
      if (!ok) { setError(data.error || t('Puanlama başarısız.')); return }
      setFeedback({ criteriaResults: data.criteriaResults, overallFeedback: data.overallFeedback, totalEarned: data.totalEarned })
      setRows(list => list.map(row => row.questionId === current.questionId ? { ...row, graded: true, earned: data.totalEarned } : row))
      setStep('feedback')
    } catch { setError(t('Bağlantı hatası, tekrar dene.')) }
    finally { setBusy('') }
  }

  async function finish(id = attemptId) {
    setBusy('finish')
    const { ok, data } = await call('/api/student/written-exams', { method: 'POST', body: JSON.stringify({ action: 'finish', attemptId: id }) })
    setBusy('')
    if (!ok) { setError(data.error || t('Bağlantı hatası, tekrar dene.')); return }
    setRows(data.questions); setSummary(data.summary); setStep('result'); await loadSets()
  }

  async function next() {
    setError('')
    await openQuestion(attemptId, rows)
  }

  function backToList() { setStep('list'); setCurrent(null); setFeedback(null); setError(''); void loadSets() }

  if (loading) return <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><div className="spinner" /></main>

  const answeredCount = rows.filter(row => row.graded).length
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'linear-gradient(135deg, #082465 0%, #0d3b8e 60%, #7c3aed 100%)', padding: '1.75rem 1.5rem 2.25rem', color: '#fff' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <Link href="/home" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{t('← Ana ekran')}</Link>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px' }}>{t('✍️ Yazılıya Hazırlanıyorum')}</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{t('Sınıfına uygun hazır yazılı sorularını sırayla çöz; cevapların rubrike göre puanlanır')}</div>
        </div>
      </div>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        {error && <div role="alert" style={{ color: '#c0392b', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

        {step === 'list' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            {needsGrade && <div className="card" style={{ padding: '1rem' }}>{t('Sınıfın profilinde kayıtlı değil. Profilinden sınıfını seç.')}</div>}
            {!needsGrade && sets.length === 0 && <div className="card" style={{ padding: '1rem' }}>{t('Sınıfın için henüz yayınlanmış yazılı yok.')}</div>}
            {sets.map(item => (
              <div key={item.id} className="card" style={{ padding: '1rem 1.1rem', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontWeight: 800 }}>{item.subject}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text2)' }}>{t('{term}. dönem · {exam}. yazılı', { term: item.term, exam: item.examNumber })} · {t('{n} soru · {p} puan', { n: item.questionCount, p: item.totalPoints })}</div>
                  {item.attempt?.status === 'completed' && <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0a9e90', marginTop: '3px' }}>{t('Tamamlandı: {earned}/{total} puan', { earned: item.attempt.total_earned ?? 0, total: item.attempt.total_possible ?? item.totalPoints })}</div>}
                </div>
                {item.attempt?.status === 'completed' ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => start(item)} disabled={!!busy}>{t('Sonucu gör')}</button>
                    <button className="btn btn-primary" onClick={() => start(item, true)} disabled={!!busy}>{t('Tekrar çöz')}</button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={() => start(item)} disabled={!!busy}>{busy === item.id ? '⏳' : item.attempt ? t('Devam et →') : t('Başla →')}</button>
                )}
              </div>
            ))}
          </div>
        )}

        {(step === 'question' || step === 'feedback') && current && (
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--text2)', marginBottom: '6px' }}>{setTitle} · {t('Soru {n} / {total}', { n: current.position, total: rows.length })}</div>
            <div style={{ height: '6px', borderRadius: '6px', background: 'var(--border)', marginBottom: '14px' }}><div style={{ height: '100%', width: `${Math.round((answeredCount / Math.max(1, rows.length)) * 100)}%`, borderRadius: '6px', background: '#7c3aed' }} /></div>
            <div className="card" style={{ padding: '1.25rem' }}>
              {current.title && <div style={{ fontWeight: 800, marginBottom: '8px' }}>{current.title} <span style={{ fontWeight: 600, color: 'var(--text2)', fontSize: '12px' }}>({current.maxPoints})</span></div>}
              {current.scenario && <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: '10px' }}><MathText text={current.scenario} /></p>}
              <p style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}><MathText text={current.question} /></p>
            </div>
            {step === 'question' ? (
              <div style={{ marginTop: '12px' }}>
                <textarea className="input" value={answer} onChange={e => setAnswer(e.target.value)} rows={9} placeholder={t('Cevabını buraya yaz…')} style={{ width: '100%' }} />
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }} onClick={submit} disabled={busy === 'grade'}>{busy === 'grade' ? t('Puanlanıyor…') : t('Cevabı gönder')}</button>
              </div>
            ) : feedback && (
              <div className="card" style={{ padding: '1.25rem', marginTop: '12px' }}>
                <div style={{ fontWeight: 800, marginBottom: '8px' }}>{t('Bu soruda {earned}/{total} puan aldın', { earned: feedback.totalEarned, total: current.maxPoints })}</div>
                {feedback.criteriaResults.map((c, i) => (
                  <div key={i} style={{ marginBottom: '8px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700 }}><MathText text={c.criterion} /> — {c.earnedPoints}/{c.maxPoints}</div>
                    <div style={{ color: 'var(--text2)' }}><MathText text={c.feedback} /></div>
                  </div>
                ))}
                {feedback.overallFeedback && <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '8px' }}><MathText text={feedback.overallFeedback} /></p>}
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }} onClick={next} disabled={!!busy}>{answeredCount >= rows.length ? t('Sonucu göster') : t('Sonraki soru →')}</button>
              </div>
            )}
          </div>
        )}

        {step === 'result' && summary && (
          <div>
            <div className="card" style={{ padding: '1.25rem', textAlign: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '18px', fontWeight: 800 }}>{t('🎉 Yazılı tamamlandı')}</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#7c3aed', margin: '6px 0' }}>{summary.totalEarned} / {summary.totalPossible}</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{t('Başarı: %{percent}', { percent: summary.percent })}</div>
            </div>
            {rows.map(row => (
              <div key={row.questionId} className="card" style={{ padding: '0.9rem 1.1rem', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{t('Soru {n}', { n: row.position })}{row.title ? ` · ${row.title}` : ''} — {row.earned ?? 0}/{row.maxPoints}</div>
                {row.overallFeedback && <div style={{ fontSize: '12.5px', color: 'var(--text2)', marginTop: '4px' }}><MathText text={row.overallFeedback} /></div>}
              </div>
            ))}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} onClick={backToList}>{t('Listeye dön')}</button>
          </div>
        )}
      </div>
    </main>
  )
}
