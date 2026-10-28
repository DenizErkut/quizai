'use client'
import MathText from '@/components/MathText'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { splitTextBlocks } from '@/lib/written-exam'
import { compressImage } from '@/lib/image-compress'
import { useT } from '@/lib/i18n/I18nProvider'

type SetItem = { id: string; title: string; subject: string; term: number; examNumber: number; totalPoints: number; questionCount: number
  attempt: { id: string; status: string; total_earned: number | null; total_possible: number | null } | null }
type CriteriaResult = { criterion: string; maxPoints: number; earnedPoints: number; feedback: string }
type Row = { questionId: string; position: number; title: string; maxPoints: number; graded: boolean; earned: number | null
  criteriaResults?: CriteriaResult[]; overallFeedback?: string; studentAnswer?: string }
type Summary = { totalEarned: number; totalPossible: number; answered: number; percent: number }
type Current = { sessionId: string; position: number; title: string; scenario: string; question: string; maxPoints: number; questionId: string }

// Satır sonlarını koruyan metin; "A | B | C" biçimli ardışık satırlar tablo olarak gösterilir.
function RichText({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <>
      {splitTextBlocks(text).map((block, index) => block.type === 'table' ? (
        <div key={index} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '13.5px', minWidth: '60%' }}>
            <thead><tr>{block.rows[0].map((cell, i) => <th key={i} style={{ border: '1px solid var(--border)', padding: '6px 10px', background: 'rgba(124,58,237,0.08)', textAlign: 'left' }}><MathText text={cell} /></th>)}</tr></thead>
            <tbody>{block.rows.slice(1).map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} style={{ border: '1px solid var(--border)', padding: '6px 10px' }}><MathText text={cell} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p key={index} style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px', ...style }}><MathText text={block.text} /></p>)}
    </>
  )
}

export default function YaziliPage() {
  const router = useRouter()
  const { t } = useT()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [sets, setSets] = useState<SetItem[]>([])
  const [needsGrade, setNeedsGrade] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const [step, setStep] = useState<'list' | 'question' | 'feedback' | 'result' | 'paper'>('list')
  const [attemptId, setAttemptId] = useState('')
  const [setTitle, setSetTitle] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [current, setCurrent] = useState<Current | null>(null)
  const [answer, setAnswer] = useState('')
  const [paperSet, setPaperSet] = useState<SetItem | null>(null)
  const [paperFiles, setPaperFiles] = useState<File[]>([])
  const [paperAnswers, setPaperAnswers] = useState<Array<{ questionId: string; position: number; maxPoints: number; text: string; legible: boolean; note: string }> | null>(null)
  const [paperInfo, setPaperInfo] = useState<{ expectedCode: string; sheetCode: string | null; codeMatches: boolean | null } | null>(null)
  const [paperMessage, setPaperMessage] = useState('')
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

  async function printSet(item: SetItem) {
    setBusy(`print-${item.id}`); setError('')
    try {
      const { ok, data } = await call('/api/student/written-exams', { method: 'POST', body: JSON.stringify({ action: 'sheet', setId: item.id }) })
      if (!ok) { setError(data.error || t('Yazdırma görünümü açılamadı.')); return }
      const [{ writtenExamStudentSheetHtml, writtenSheetCode }, { printLearningDocument }] = await Promise.all([import('@/lib/written-exam-print'), import('@/lib/learning-print')])
      const meta = `${data.gradeNumber}. sınıf · ${data.subject} · ${data.term}. dönem · ${data.examNumber}. yazılı`
      await printLearningDocument(data.title, meta, writtenExamStudentSheetHtml(data.questions, { code: writtenSheetCode(item.id), meta }))
    } catch { setError(t('Yazdırma görünümü açılamadı.')) }
    finally { setBusy('') }
  }

  function openPaper(item: SetItem) {
    setPaperSet(item); setPaperFiles([]); setPaperAnswers(null); setPaperInfo(null); setPaperMessage(''); setError(''); setStep('paper')
  }

  async function readPaper() {
    if (!paperSet || !paperFiles.length) return
    setBusy('paper-read'); setPaperMessage(t('Kâğıt okunuyor… (20-60 saniye sürebilir)')); setError('')
    try {
      const images = await Promise.all(paperFiles.slice(0, 8).map(compressImage))
      const { ok, data } = await call('/api/student/written-exams/paper', { method: 'POST', body: JSON.stringify({ action: 'transcribe', setId: paperSet.id, images }) })
      if (!ok) { setError(data.error || t('Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar dene.')); setPaperMessage(''); return }
      setPaperAnswers(data.answers); setPaperInfo({ expectedCode: data.expectedCode, sheetCode: data.sheetCode, codeMatches: data.codeMatches }); setPaperMessage('')
    } catch { setError(t('Bağlantı hatası, tekrar dene.')); setPaperMessage('') }
    finally { setBusy('') }
  }

  async function savePaper() {
    if (!paperSet || !paperAnswers) return
    setBusy('paper-save'); setPaperMessage(t('Cevapların puanlanıyor… (1-2 dakika sürebilir)')); setError('')
    try {
      const { ok, data } = await call('/api/student/written-exams/paper', { method: 'POST', body: JSON.stringify({ action: 'save', setId: paperSet.id, answers: paperAnswers.map(a => ({ questionId: a.questionId, text: a.text })) }) })
      if (!ok) { setError(data.error || t('Puanlama başarısız.')); setPaperMessage(''); return }
      setAttemptId(data.attemptId); setSetTitle(paperSet.title); setRows(data.questions); setSummary(data.summary); setPaperMessage(''); setStep('result'); await loadSets()
    } catch { setError(t('Bağlantı hatası, tekrar dene.')); setPaperMessage('') }
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
                <button className="btn btn-ghost" onClick={() => printSet(item)} disabled={!!busy}>{busy === `print-${item.id}` ? '⏳' : t('🖨️ Tüm soruları yazdır')}</button>
                <button className="btn btn-ghost" onClick={() => openPaper(item)} disabled={!!busy}>{t('📷 Kâğıttan cevap yükle')}</button>
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

        {step === 'paper' && paperSet && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 800, marginBottom: '6px' }}>{t('📷 Kâğıttan cevap yükle')} · {paperSet.subject}</div>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>{t('Yazdırdığın kâğıda elle yazdığın cevapların net, düz fotoğraflarını yükle (en fazla 8). Önce okunan metni kontrol edip düzeltebilir, sonra puanlatabilirsin.')}</p>
            {!paperAnswers ? (
              <>
                <input type="file" accept="image/*" multiple onChange={e => setPaperFiles(Array.from(e.target.files || []))} />
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }} onClick={readPaper} disabled={!paperFiles.length || busy === 'paper-read'}>{busy === 'paper-read' ? t('Okunuyor…') : t('Kâğıdı oku')}</button>
              </>
            ) : (
              <>
                {paperInfo?.codeMatches === false && <p role="alert" style={{ color: '#b45309', fontSize: '13px' }}>{t('Kâğıttaki kod ({found}) bu yazılıyla eşleşmiyor ({expected}). Doğru kâğıdı yüklediğinden emin ol.', { found: paperInfo.sheetCode || '', expected: paperInfo.expectedCode })}</p>}
                <p style={{ fontSize: '13px', color: 'var(--text2)' }}>{t('Okunan cevapları kontrol et; yanlış okunanı düzelt.')}</p>
                {paperAnswers.map((a, index) => (
                  <div key={a.questionId} style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{t('Soru {n}', { n: a.position })} ({a.maxPoints}){!a.legible || a.note ? ` · ⚠️ ${a.note || t('okunması zor')}` : ''}</div>
                    <textarea className="input" rows={4} value={a.text} style={{ width: '100%', borderRadius: '8px' }} placeholder={t('Kâğıtta bu soru için cevap yok')}
                      onChange={e => setPaperAnswers(list => list ? list.map((x, i) => i === index ? { ...x, text: e.target.value } : x) : list)} />
                  </div>
                ))}
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }} onClick={savePaper} disabled={busy === 'paper-save'}>{busy === 'paper-save' ? t('Puanlanıyor…') : t('Cevapları puanla')}</button>
              </>
            )}
            {paperMessage && <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '8px' }}>{paperMessage}</p>}
            <button className="btn btn-ghost" style={{ marginTop: '10px' }} onClick={backToList} disabled={!!busy}>{t('Listeye dön')}</button>
          </div>
        )}

        {(step === 'question' || step === 'feedback') && current && (
          <div>
            <div style={{ fontSize: '12.5px', color: 'var(--text2)', marginBottom: '6px' }}>{setTitle} · {t('Soru {n} / {total}', { n: current.position, total: rows.length })}</div>
            <div style={{ height: '6px', borderRadius: '6px', background: 'var(--border)', marginBottom: '14px' }}><div style={{ height: '100%', width: `${Math.round((answeredCount / Math.max(1, rows.length)) * 100)}%`, borderRadius: '6px', background: '#7c3aed' }} /></div>
            <div className="card" style={{ padding: '1.25rem' }}>
              {current.title && <div style={{ fontWeight: 800, marginBottom: '8px' }}>{current.title} <span style={{ fontWeight: 600, color: 'var(--text2)', fontSize: '12px' }}>({current.maxPoints})</span></div>}
              {current.scenario && <RichText text={current.scenario} style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7 }} />}
              <RichText text={current.question} style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.6 }} />
            </div>
            {step === 'question' ? (
              <div style={{ marginTop: '12px' }}>
                <textarea className="input" value={answer} onChange={e => setAnswer(e.target.value)} rows={9} placeholder={t('Cevabını buraya yaz…')} style={{ width: '100%', borderRadius: '8px' }} />
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
                {row.criteriaResults && row.criteriaResults.length > 0 && (
                  <details style={{ marginTop: '6px', fontSize: '12.5px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('Ölçüt ölçüt puanlar')}</summary>
                    {row.criteriaResults.map((c, i) => <div key={i} style={{ marginTop: '4px' }}><strong><MathText text={c.criterion} /> — {c.earnedPoints}/{c.maxPoints}</strong><div style={{ color: 'var(--text2)' }}><MathText text={c.feedback} /></div></div>)}
                  </details>
                )}
              </div>
            ))}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }} onClick={backToList}>{t('Listeye dön')}</button>
          </div>
        )}
      </div>
    </main>
  )
}
