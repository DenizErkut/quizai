'use client'
import MathText from "@/components/MathText"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useVoiceTutor } from '@/lib/use-voice-tutor'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import { svgDataUri, parseAnswerTable, serializeTableAnswer } from '@/lib/open-ended-scenarios'
import OpenEndedPaperUpload from '@/components/student/OpenEndedPaperUpload'
import AnswerSections from '@/components/AnswerSections'
import { resolveOwnIdentity } from '@/lib/identity/resolve-client'
import QRCode from 'qrcode'

interface RubricItem { criterion: string; maxPoints: number; description: string }
interface CriteriaResult { criterion: string; maxPoints: number; earnedPoints: number; feedback: string }

export default function AcikUcluPage() {
  const router = useRouter()
  const { t, locale } = useT()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [subjectCatalog, setSubjectCatalog] = useState<Record<string, string[]>>({})
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')

  const [step, setStep] = useState<'setup' | 'question' | 'graded'>('setup')
  const [generating, setGenerating] = useState(false)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState('')

  const [sessionId, setSessionId] = useState('')
  const [scenario, setScenario] = useState('')
  const [figureSvg, setFigureSvg] = useState<string | null>(null)
  const [figureImage, setFigureImage] = useState<string | null>(null)
  const [currentCard, setCurrentCard] = useState<ScenarioCard | null>(null)
  const [qIndex, setQIndex] = useState(0)
  const [qTotal, setQTotal] = useState(1)
  const [tableText, setTableText] = useState<string | null>(null)
  const [tableValues, setTableValues] = useState<string[][]>([])
  const [question, setQuestion] = useState('')
  const [rubric, setRubric] = useState<RubricItem[]>([])
  const [totalPossible, setTotalPossible] = useState(0)
  const [answer, setAnswer] = useState('')
  const voice = useVoiceTutor(transcript => {
    setAnswer(current => `${current}${current.trim() ? ' ' : ''}${transcript}`)
  })

  const [criteriaResults, setCriteriaResults] = useState<CriteriaResult[]>([])
  const [overallFeedback, setOverallFeedback] = useState('')
  const [totalEarned, setTotalEarned] = useState(0)

  // Öğretmen tarafından atanmış açık uçlu ödevler
  const [assignedList, setAssignedList] = useState<any[]>([])
  const [assignedLoading, setAssignedLoading] = useState(true)
  const [assignedOpen, setAssignedOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [startingId, setStartingId] = useState('')

  // Yöneticinin örneklerine dayanan senaryo kartları (dönem + senaryo no)
  type ScenarioCard = { questionCount?: number; solvedQuestions?: number; nextIndex?: number; subject: string; term: number; scenarioNo: number; label: string; attempts: number; bestScore: number | null; total: number }
  const [scenarioCards, setScenarioCards] = useState<ScenarioCard[]>([])
  const [scenarioSubject, setScenarioSubject] = useState('')
  const [startingScenario, setStartingScenario] = useState('')

  // "Çözülenler": senaryo serisinden çıkan tüm sorular + yazdırma + kâğıttan cevap yükleme
  type MySession = { id: string; subject: string; topic: string; question_index: number; total_earned: number | null; total_possible: number | null; graded_at: string | null; created_at: string }
  const [mySessions, setMySessions] = useState<MySession[]>([])
  type Detail = { id: string; subject: string; topic: string; question_index: number; question: string; scenario: string; rubric: RubricItem[]; student_answer: string | null; criteria_results: CriteriaResult[] | null; overall_feedback: string | null; total_earned: number | null; total_possible: number | null; answer_table: string | null }
  const [detail, setDetail] = useState<Detail | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [printingKey, setPrintingKey] = useState('')
  const [printMessage, setPrintMessage] = useState('')
  const [paperOpen, setPaperOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch('/api/open-ended/catalog', {
          headers: { Authorization: `Bearer ${session?.access_token}` }, cache: 'no-store',
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || t('Ders ve konular alınamadı.'))
        setSubjectCatalog(Object.fromEntries(data.subjects.map((item: { subject: string; topics: string[] }) => [item.subject, item.topics])))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('Ders ve konular alınamadı.'))
      }
      setLoading(false)
    }
    load()
    loadAssigned()
    loadScenarios()
    loadMySessions()
  }, [])

  async function loadScenarios() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/open-ended/scenarios', { headers: { Authorization: `Bearer ${session?.access_token}` }, cache: 'no-store' })
      const json = await res.json()
      setScenarioCards(json.cards || [])
    } catch (e) {
      console.error('[loadScenarios]', e)
    }
  }

  async function startScenario(card: ScenarioCard, index = 0) {
    const key = `${card.subject}|${card.term}|${card.scenarioNo}`
    setStartingScenario(key); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subject: card.subject, term: card.term, scenarioNo: card.scenarioNo, questionIndex: index }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error === 'daily_limit_reached' ? t('Günlük test hakkın doldu.') :
                  json.error === 'monthly_limit_reached' ? t('Aylık test hakkın doldu.') :
                  json.error || t('Soru üretilemedi.'))
        return
      }
      setCurrentCard(card); setQIndex(json.questionIndex || 0); setQTotal(json.questionTotal || 1); setSessionId(json.sessionId); setScenario(json.scenario); setFigureSvg(json.figureSvg || null); setFigureImage(null); setTableText(json.answerTable || null); setTableValues([]); setQuestion(json.question); setRubric(json.rubric)
      setTotalPossible(json.totalPossible); setAnswer(''); setStep('question'); void loadMySessions()
    } catch {
      setError(t('Bağlantı hatası, tekrar dene.'))
    } finally {
      setStartingScenario('')
    }
  }


  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }

  async function loadMySessions() {
    try {
      const res = await fetch('/api/open-ended/sessions', { headers: await authHeaders(), cache: 'no-store' })
      if (res.ok) setMySessions((await res.json()).sessions || [])
    } catch { /* panel boş kalır */ }
  }

  // Çözülmüş sorunun ayrıntısı: verdiğin yanıt / en olası (beklenen) yanıtlar sekmeleri.
  async function openDetail(id: string) {
    const res = await fetch(`/api/open-ended/sessions?id=${id}`, { headers: await authHeaders(), cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.session) { setError(json.error || t('Soru açılamadı.')); return }
    setDetail(json.session)
  }

  // Çözülmemiş bir soruyu çevrim içi çözmeye devam et.
  async function openSession(id: string) {
    setError('')
    const res = await fetch(`/api/open-ended/sessions?id=${id}`, { headers: await authHeaders(), cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.session) { setError(json.error || t('Soru açılamadı.')); return }
    const row = json.session
    if (row.graded_at) return
    const card = scenarioCards.find(c => c.subject.toLocaleLowerCase('tr') === String(row.subject).toLocaleLowerCase('tr') && row.topic === `${c.term}. dönem ${c.scenarioNo}. senaryo`) || null
    setCurrentCard(card); setQIndex(row.question_index || 0); setQTotal(card?.questionCount || 1)
    setSessionId(row.id); setScenario(row.scenario); setFigureSvg(row.figure_svg || null); setFigureImage(row.figure_image || null); setTableText(row.answer_table || null); setTableValues([])
    setQuestion(row.question); setRubric(row.rubric); setTotalPossible(row.total_possible); setAnswer(''); setStep('question')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Senaryonun tüm sorularını (yoksa üretip) yazdırılabilir kâğıt olarak aç.
  async function printScenario(card: ScenarioCard) {
    const key = `${card.subject}|${card.term}|${card.scenarioNo}`
    const label = `${card.term}. dönem ${card.scenarioNo}. senaryo`
    const total = card.questionCount || 1
    setPrintingKey(key); setError(''); setPrintMessage('')
    try {
      const headers = await authHeaders()
      const recent = Date.now() - 7 * 24 * 3600_000
      const items: Array<{ scenario: string; question: string; rubric: RubricItem[]; figureSvg?: string | null; answerTable?: string | null; code: string; sessionId: string }> = []
      for (let i = 0; i < total; i++) {
        setPrintMessage(t('Soru {n}/{total} hazırlanıyor…', { n: i + 1, total }))
        const existing = mySessions.find(s => s.subject.toLocaleLowerCase('tr') === card.subject.toLocaleLowerCase('tr') && s.topic === label && s.question_index === i && !s.graded_at && new Date(s.created_at).getTime() > recent)
        if (existing) {
          const res = await fetch(`/api/open-ended/sessions?id=${existing.id}`, { headers, cache: 'no-store' })
          const json = await res.json()
          if (res.ok && json.session) {
            const row = json.session
            items.push({ scenario: row.scenario, question: row.question, rubric: row.rubric, figureSvg: row.figure_svg, answerTable: row.answer_table, code: row.id.replace(/-/g, '').slice(0, 8).toUpperCase(), sessionId: row.id })
            continue
          }
        }
        const res = await fetch('/api/generate-open-ended', { method: 'POST', headers, body: JSON.stringify({ subject: card.subject, term: card.term, scenarioNo: card.scenarioNo, questionIndex: i }) })
        const json = await res.json()
        if (!res.ok) {
          setError(json.error === 'daily_limit_reached' ? t('Günlük test hakkın doldu.') : json.error === 'monthly_limit_reached' ? t('Aylık test hakkın doldu.') : json.error || t('Soru açılamadı.'))
          return
        }
        items.push({ scenario: json.scenario, question: json.question, rubric: json.rubric, figureSvg: json.figureSvg, answerTable: json.answerTable, code: String(json.sessionId).replace(/-/g, '').slice(0, 8).toUpperCase(), sessionId: String(json.sessionId) })
      }
      const [{ openEndedScenarioSheetHtml, OE_QR_PREFIX }, { printLearningDocument }, own] = await Promise.all([import('@/lib/open-ended-print'), import('@/lib/learning-print'), resolveOwnIdentity(supabase)])
      const title = `${card.subject} · ${label}`
      const sheetItems = await Promise.all(items.map(async (item, index) => ({
        ...item, position: index + 1, total: items.length,
        qrDataUrl: await QRCode.toDataURL(`${OE_QR_PREFIX}${item.sessionId}`, { width: 240, margin: 1 }),
      })))
      await printLearningDocument(title, t('Açık Uçlu Sorular'), openEndedScenarioSheetHtml(sheetItems, { studentName: own?.full_name || '', title }))
      await loadMySessions()
    } catch { setError(t('Yazdırma görünümü açılamadı.')) }
    finally { setPrintingKey(''); setPrintMessage('') }
  }

  async function loadAssigned() {
    setAssignedLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/student/open-ended-assignments', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      setAssignedList(json.assignments || [])
    } catch (e) {
      console.error('[loadAssigned]', e)
    } finally {
      setAssignedLoading(false)
    }
  }

  async function startAssignment(assignmentId: string) {
    setStartingId(assignmentId); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/student/start-open-ended-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ assignment_id: assignmentId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t('Ödev başlatılamadı.')); return }
      setSessionId(json.sessionId)
      setScenario(json.scenario); setFigureSvg(json.figureSvg || null); setFigureImage(json.figureImage || null); setTableText(json.answerTable || null); setTableValues([]); setCurrentCard(null); setQTotal(1); setQIndex(0)
      setQuestion(json.question)
      setRubric(json.rubric)
      setTotalPossible(json.totalPossible)
      setAnswer('')
      setStep('question')
    } catch {
      setError(t('Bağlantı hatası, tekrar dene.'))
    } finally {
      setStartingId('')
    }
  }

  const subjects = Object.keys(subjectCatalog)
  const topics = subject ? (subjectCatalog[subject] || []) : []

  async function generate() {
    if (!subject || !topic.trim()) { setError(t('Ders ve konu seçmelisin.')); return }
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
        setError(json.error === 'daily_limit_reached' ? t('Günlük test hakkın doldu.') :
                  json.error === 'monthly_limit_reached' ? t('Aylık test hakkın doldu.') :
                  json.error || t('Soru üretilemedi.'))
        setGenerating(false)
        return
      }
      setSessionId(json.sessionId)
      setScenario(json.scenario); setFigureSvg(json.figureSvg || null); setFigureImage(json.figureImage || null); setTableText(json.answerTable || null); setTableValues([]); setCurrentCard(null); setQTotal(1); setQIndex(0)
      setQuestion(json.question)
      setRubric(json.rubric)
      setTotalPossible(json.totalPossible)
      setAnswer('')
      setStep('question')
    } catch {
      setError(t('Bağlantı hatası, tekrar dene.'))
    }
    setGenerating(false)
  }

  async function submitAnswer() {
    const table = tableText ? parseAnswerTable(tableText) : null
    if (table) {
      const missing = table.rows.some((row, r) => row.some((cell, c) => cell === '' && !(tableValues[r]?.[c] || '').trim()))
      if (missing) { setError(t('Tablodaki tüm boşlukları doldur.')); return }
    }
    const finalAnswer = table ? `${serializeTableAnswer(table, tableValues)}${answer.trim() ? `\nAçıklama: ${answer.trim()}` : ''}` : answer
    const trimmed = answer.trim()
    if (!table && !trimmed) { setError(t('Cevabını yazmadan gönderemezsin.')); return }
    if (!table && trimmed.length < 50) { setError(t('Cevabın çok kısa — en az 50 karakter yazmalısın (şu an {n}).', { n: trimmed.length })); return }
    setGrading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/grade-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ sessionId, studentAnswer: finalAnswer }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t('Puanlama başarısız.')); setGrading(false); return }
      setCriteriaResults(json.criteriaResults)
      setOverallFeedback(json.overallFeedback)
      setTotalEarned(json.totalEarned)
      setStep('graded')
      voice.disable()
      void loadMySessions()
    } catch {
      setError(t('Bağlantı hatası, tekrar dene.'))
    }
    setGrading(false)
  }

  function newQuestion() {
    voice.disable()
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
          <Link href="/home" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>{t('← Ana ekran')}</Link>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px' }}>{t('✍️ Açık Uçlu Sorular')}</div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
            {t('MEB ortak sınav formatında: senaryo + açık uçlu soru + dereceli puanlama')}
          </div>
        </div>
      </div>

      <style>{`.oe-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:0}.oe-side{padding:0 1.25rem 1.5rem}@media(min-width:1100px){.oe-layout{grid-template-columns:minmax(0,1fr) 320px;max-width:1400px;margin:0 auto}.oe-side{padding:1.5rem 1.25rem 1.5rem 0;position:sticky;top:12px;align-self:start;max-height:calc(100vh - 24px);overflow-y:auto}}`}</style>
      <div className="oe-layout">
      <div style={{ maxWidth: step === 'setup' ? '960px' : '640px', width: '100%', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        {step === 'setup' && (
          <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ fontSize: '44px', lineHeight: 1 }}>🧑‍🏫</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>{t('Açık uçlu senaryo sorularıyla yazılı simülasyonuna hazır mısın?')}</div>
              <div style={{ fontSize: '13.5px', color: 'var(--text2)', lineHeight: 1.6 }}>{t('Bir senaryo seç; yapay zeka sana o senaryonun benzeri yeni bir soru hazırlasın, cevabını rubrike göre puanlasın.')}</div>
            </div>
          </div>
        )}

        {/* Senaryo kartları: dönem + senaryo numarası */}
        {step === 'setup' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', marginBottom: '10px' }}>{t('Ders seç')}</div>
            {(() => {
              const subjects = [...new Set(scenarioCards.map(card => card.subject))]
              const chosen = scenarioSubject || (subjects.length === 1 ? subjects[0] : '')
              return subjects.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {subjects.map(name => {
                    const count = scenarioCards.filter(card => card.subject === name).length
                    return (
                      <button key={name} type="button" onClick={() => setScenarioSubject(name)} aria-pressed={chosen === name}
                        style={{ padding: '12px 18px', borderRadius: '14px', border: `2px solid ${chosen === name ? 'var(--accent)' : 'var(--border)'}`, background: chosen === name ? 'var(--accent-bg)' : 'var(--bg)', color: 'var(--primary)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                        <div style={{ fontWeight: 800, fontSize: '15px' }}>{name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text2)', marginTop: '2px' }}>{t('{n} senaryo', { n: count })}</div>
                      </button>
                    )
                  })}
                </div>
              )
            })()}
            {scenarioCards.length === 0 ? (
              <div className="card" style={{ padding: '1rem', fontSize: '13px', color: 'var(--text2)' }}>{t('Bu sınıf için henüz senaryo yüklenmedi. Aşağıdaki serbest pratiği kullanabilirsin.')}</div>
            ) : !scenarioSubject && [...new Set(scenarioCards.map(c => c.subject))].length > 1 ? (
              <div className="card" style={{ padding: '1rem', fontSize: '13px', color: 'var(--text2)' }}>{t('Senaryoları görmek için önce bir ders seç.')}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {scenarioCards.filter(card => card.subject === (scenarioSubject || ([...new Set(scenarioCards.map(c => c.subject))].length === 1 ? scenarioCards[0].subject : '__none'))).map(card => {
                  const key = `${card.subject}|${card.term}|${card.scenarioNo}`
                  return (
                    <div key={key} className="card" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg2, var(--bg))' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{card.subject}</div>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary)' }}>{t('{term}. Dönem {no}. Senaryo', { term: card.term, no: card.scenarioNo })}</div>
                      <div style={{ fontSize: '12px', color: card.attempts ? '#0a9e90' : 'var(--text3)', fontWeight: 600 }}>
                        {(card.questionCount || 0) > 1
                          ? `${t('{n} soru', { n: card.questionCount })} : ${(card.solvedQuestions || 0) > 0 ? t('{n} soru çözüldü', { n: card.solvedQuestions }) : t('Henüz çözülmedi')}`
                          : card.attempts ? t('Çözüldü · en yüksek {score}/{total}', { score: card.bestScore ?? 0, total: card.total }) : t('Henüz çözülmedi')}
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: 'auto', justifyContent: 'center' }} onClick={() => startScenario(card, card.nextIndex || 0)} disabled={!!startingScenario}>
                        {startingScenario === key ? t('Senaryo hazırlanıyor…') : (card.questionCount || 0) > 1 ? ((card.solvedQuestions || 0) === 0 ? t('Başla →') : (card.solvedQuestions || 0) < (card.questionCount || 0) ? t('Devam et →') : t('Tekrar çöz')) : card.attempts ? t('Tekrar çöz') : t('Başla →')}
                      </button>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => printScenario(card)} disabled={!!printingKey || !!startingScenario}>{printingKey === key ? '⏳' : t('🖨️ Yazdır')}</button>
                        <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPaperOpen(true)}>{t('📷 Kâğıtları yükle')}</button>
                      </div>
                      {printingKey === key && printMessage && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{printMessage}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Öğretmen tarafından atanmış, HENÜZ ÇÖZÜLMEMİŞ ödevler */}
        {step === 'setup' && !assignedLoading && assignedList.some((a) => !a.completed) && (
          <div style={{ marginBottom: '1.25rem' }}>
            <button type="button" aria-expanded={assignedOpen} onClick={() => setAssignedOpen(o => !o)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', textAlign: 'left' }}>
              <span>{t('📋 Sana Atanan Ödevler')} ({assignedList.filter((a) => !a.completed).length})</span>
              <span aria-hidden="true">{assignedOpen ? '▲' : '▼'}</span>
            </button>
            {assignedOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {assignedList.filter((a) => !a.completed).map((a) => {
                const isOverdue = a.due_date && new Date(a.due_date) < new Date()
                return (
                  <div key={a.id} className="card" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', borderLeft: '3px solid #6366f1' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>{a.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                        {a.subject && <span>📚 {a.subject}</span>}
                        <span>🏫 {a.classrooms?.name}</span>
                        {a.due_date && <span style={{ color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>🕐 {new Date(a.due_date).toLocaleDateString(intlLocale(locale))}</span>}
                      </div>
                    </div>
                    <button onClick={() => startAssignment(a.id)} disabled={startingId === a.id}
                      style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', opacity: startingId === a.id ? 0.6 : 1 }}>
                      {startingId === a.id ? '⏳' : t('Başla →')}
                    </button>
                  </div>
                )
              })}
            </div>}
          </div>
        )}

        {/* ADIM 1: Ders/Konu seçimi */}
        {step === 'setup' && (
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>{t('✨ Serbest Pratik')}</div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{t('Ders')}</label>
            <select className="input" value={subject} onChange={e => { setSubject(e.target.value); setTopic('') }}
              style={{ marginTop: '6px', marginBottom: '1.25rem' }}>
              <option value="">{t('— Ders seç —')}</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {subject && (
              <>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{t('Konu')}</label>
                <select className="input" value={topic} onChange={e => setTopic(e.target.value)}
                  style={{ marginTop: '6px', marginBottom: '1.5rem' }}>
                  <option value="">{t('— Konu seç —')}</option>
                  {topics.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>
              </>
            )}

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={generate} disabled={generating || !subject || !topic}>
              {generating ? t('Senaryo hazırlanıyor…') : t('✍️ Soruyu Oluştur')}
            </button>
          </div>
        )}

        {/* Daha önce çözülmüş (tamamlanmış) AUS ödevleri — Serbest Pratik'in ALTINDA */}
        {step === 'setup' && !assignedLoading && assignedList.some((a) => a.completed) && (
          <div style={{ marginTop: '1.25rem' }}>
            <button type="button" aria-expanded={doneOpen} onClick={() => setDoneOpen(o => !o)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '12px 16px', marginBottom: '8px', borderRadius: '10px', border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 800, textAlign: 'left', boxShadow: '0 3px 10px rgba(22,163,74,.35)' }}>
              <span>{t('✅ Tamamlanan Ödevler')} ({assignedList.filter((a) => a.completed).length})</span>
              <span aria-hidden="true">{doneOpen ? '▲' : '▼'}</span>
            </button>
            {doneOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {assignedList.filter((a) => a.completed).map((a) => (
                <div key={a.id} className="card" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', borderLeft: '3px solid var(--green)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>{a.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                      {a.subject && <span>📚 {a.subject}</span>}
                      <span>🏫 {a.classrooms?.name}</span>
                      {a.due_date && <span>🕐 {new Date(a.due_date).toLocaleDateString(intlLocale(locale))}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                    ✓ {a.earned}/{a.possible}
                  </div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {/* ADIM 2: Senaryo + Soru + Cevap yazma */}
        {step === 'question' && (
          <div>
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem', borderLeft: '3px solid #3E8E3E' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#3E8E3E', marginBottom: '6px', textTransform: 'uppercase' }}>{t('Senaryo')}{currentCard && qTotal > 1 ? ` · ${t('Soru {n}/{total}', { n: qIndex + 1, total: qTotal })}` : ''}</div>
              <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}><MathText text={scenario} /></p>
              {figureImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={figureImage} alt={t('Senaryo şekli')} style={{ display: 'block', margin: '12px auto 0', maxWidth: '100%', width: 460, background: '#fff', borderRadius: 4, border: '1px solid var(--border)' }} />
              )}
              {figureSvg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={svgDataUri(figureSvg)} alt={t('Senaryo şekli')} style={{ display: 'block', margin: '12px auto 0', maxWidth: '100%', width: 420, background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }} />
              )}
            </div>
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', marginBottom: '6px', textTransform: 'uppercase' }}>{t('Soru‖açık uçlu')}</div>
              <p style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.6 }}><MathText text={question} /></p>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{t('Cevabın')}</label>
              <div style={{ marginTop: '8px', marginBottom: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(0,149,200,0.25)', background: voice.enabled ? 'rgba(30,207,184,0.08)' : 'rgba(0,149,200,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{t('🎙️ Sesli AUS')} <span style={{ color: '#0a9e90', fontSize: '10px' }}>{t('PİLOT')}</span></div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                      {voice.enabled ? t('Bas-konuş · {time} kaldı', { time: `${Math.floor(voice.secondsLeft / 60)}:${String(voice.secondsLeft % 60).padStart(2, '0')}` }) : t('Soruyu dinle veya cevabını konuşarak yazdır')}
                    </div>
                  </div>
                  <button type="button" onClick={voice.enabled ? voice.disable : voice.requestConsent} style={{ border: '1px solid rgba(0,149,200,0.3)', borderRadius: '16px', padding: '6px 10px', background: voice.enabled ? 'var(--accent)' : 'var(--bg)', color: voice.enabled ? '#fff' : 'var(--accent)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                    {voice.enabled ? t('Sesliyi kapat') : t('Sesliyi aç')}
                  </button>
                </div>
                {voice.consentPending && (
                  <div style={{ marginTop: '8px', padding: '9px', borderRadius: '10px', background: '#fff8df', border: '1px solid #f6df8b', fontSize: '10.5px', color: '#6b5420', lineHeight: 1.45 }}>
                    {t('Konuşman yazıya çevrilmek üzere tarayıcının konuşma servisine gönderilebilir. Pratium ham ses kaydetmez; yalnızca metin alanına aktarılan cevabı işler.')}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '7px' }}>
                      <button type="button" onClick={voice.acceptConsent} style={{ border: 0, borderRadius: '12px', padding: '5px 9px', background: '#087c70', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>{t('Kabul et ve aç')}</button>
                      <button type="button" onClick={voice.cancelConsent} style={{ border: '1px solid #d9c778', borderRadius: '12px', padding: '5px 9px', background: '#fff', color: '#6b5420', cursor: 'pointer', fontSize: '10px' }}>{t('Vazgeç')}</button>
                    </div>
                  </div>
                )}
                {voice.enabled && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '9px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => voice.speak(`${scenario}. ${question}`)} style={{ padding: '7px 10px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>{t('🔊 Soruyu dinle')}</button>
                    <button type="button" onClick={voice.listening ? voice.stop : voice.start} disabled={grading} aria-label={voice.listening ? t('Dinlemeyi durdur') : t('Cevabını konuş')} style={{ padding: '7px 10px', borderRadius: '9px', border: voice.listening ? '2px solid #ff8a80' : '1px solid rgba(0,149,200,0.3)', background: voice.listening ? '#fff0ef' : 'var(--bg)', color: voice.listening ? '#c62828' : 'var(--accent)', cursor: grading ? 'default' : 'pointer', fontSize: '11px', fontWeight: 700 }}>
                      {voice.listening ? t('■ Dinlemeyi durdur') : t('🎙️ Bas ve konuş')}
                    </button>
                  </div>
                )}
                {voice.error && <div role="status" style={{ color: '#b42318', fontSize: '10px', marginTop: '6px' }}>{voice.error}</div>}
              </div>
              {tableText && parseAnswerTable(tableText) && (() => {
                const table = parseAnswerTable(tableText)!
                return (
                  <div style={{ overflowX: 'auto', margin: '10px 0' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                      <thead><tr>{table.headers.map((h, c) => <th key={c} style={{ border: '1px solid var(--border)', padding: '8px', background: 'var(--accent-bg)', textAlign: 'left' }}>{h}</th>)}</tr></thead>
                      <tbody>{table.rows.map((row, r) => (
                        <tr key={r}>{row.map((cell, c) => (
                          <td key={c} style={{ border: '1px solid var(--border)', padding: cell === '' ? 4 : 8, fontWeight: c === 0 ? 700 : 400 }}>
                            {cell !== '' ? cell : (
                              <input className="input" style={{ width: '100%', minWidth: 70, padding: '6px 8px' }} value={tableValues[r]?.[c] || ''}
                                aria-label={`${row[0]} – ${table.headers[c]}`}
                                onChange={e => setTableValues(prev => { const next = prev.map(line => [...line]); next[r] = next[r] || []; next[r][c] = e.target.value; return next })} />
                            )}
                          </td>
                        ))}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                )
              })()}
              <textarea className="input" rows={tableText ? 3 : 8} value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder={tableText ? t('Açıklaman varsa yaz (isteğe bağlı)…') : t('Kendi cümlelerinle, düşüncelerini gerekçelendirerek yaz…')}
                style={{ marginTop: '8px', marginBottom: '4px', resize: 'vertical', borderRadius: '4px' }} />
              <div style={{ fontSize: '11px', color: answer.trim().length >= 50 ? 'var(--green)' : 'var(--text3)', marginBottom: '1rem', textAlign: 'right' }}>
                {t('{n} / 50 karakter', { n: answer.trim().length })} {answer.trim().length >= 50 ? '✓' : ''}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={submitAnswer} disabled={grading}>
                {grading ? t('Değerlendiriliyor…') : t('Cevabımı Gönder')}
              </button>
            </div>
          </div>
        )}

        {/* ADIM 3: Rubrik bazlı sonuç */}
        {step === 'graded' && (
          <div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '6px' }}>{t('Puanın')}</div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: totalEarned / totalPossible >= 0.7 ? 'var(--green)' : totalEarned / totalPossible >= 0.4 ? '#d97706' : 'var(--red)' }}>
                {totalEarned} / {totalPossible}
              </div>
              {overallFeedback && <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '10px', lineHeight: 1.6 }}><MathText text={overallFeedback} /></p>}
            </div>

            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>
              {t('Dereceli Puanlama Anahtarı — Kriter Kriter')}
            </div>
            {criteriaResults.map((c, i) => (
              <div key={i} className="card-sm" style={{ padding: '14px 16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}><MathText text={c.criterion} /></span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: c.earnedPoints >= c.maxPoints * 0.7 ? 'var(--green)' : c.earnedPoints > 0 ? '#d97706' : 'var(--red)' }}>
                    {c.earnedPoints} / {c.maxPoints}
                  </span>
                </div>
                <div style={{ background: 'var(--border)', borderRadius: '4px', height: '6px', marginBottom: '8px' }}>
                  <div style={{ background: 'var(--accent)', height: '6px', borderRadius: '4px', width: `${Math.min(100, (c.earnedPoints / c.maxPoints) * 100)}%` }} />
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: 1.5 }}><MathText text={c.feedback} /></p>
              </div>
            ))}

            {currentCard && qIndex + 1 < qTotal && (
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }} disabled={!!startingScenario}
                onClick={() => startScenario(currentCard, qIndex + 1)}>
                {startingScenario ? t('Senaryo hazırlanıyor…') : t('Sonraki soru ({n}/{total}) →', { n: qIndex + 2, total: qTotal })}
              </button>
            )}
            <button className={currentCard && qIndex + 1 < qTotal ? 'btn' : 'btn btn-primary'} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }} onClick={newQuestion}>
              {currentCard && qIndex + 1 >= qTotal && qTotal > 1 ? t('Senaryo tamamlandı — başka soru çöz') : t('Yeni Soru Çöz')}
            </button>
          </div>
        )}

        {/* Notlarım: soru bazında puanlar ve ders · dönem · senaryo başına ortalama not (kullanıcı bazında) */}
        {(() => {
          type Row = { subject: string; topic: string; questions: Map<number, { earned: number; total: number }> }
          const groups = new Map<string, Row>()
          for (const item of mySessions) {
            if (!item.graded_at) continue
            const key = `${item.subject.toLocaleLowerCase('tr')}|${item.topic}`
            const row = groups.get(key) || { subject: item.subject, topic: item.topic, questions: new Map() }
            if (!row.questions.has(item.question_index)) row.questions.set(item.question_index, { earned: Number(item.total_earned) || 0, total: Number(item.total_possible) || 100 })   // liste en yeniden eskiye: ilk görülen en son puanlanandır
            groups.set(key, row)
          }
          if (groups.size === 0) return null
          const percent = (earned: number, total: number) => total > 0 ? Math.round((earned / total) * 1000) / 10 : 0
          let allEarned = 0, allTotal = 0, allCount = 0
          const rows = [...groups.values()].map(group => {
            const list = [...group.questions.entries()].sort((a, b) => a[0] - b[0])
            const earned = list.reduce((sum, [, q]) => sum + q.earned, 0), total = list.reduce((sum, [, q]) => sum + q.total, 0)
            allEarned += earned; allTotal += total; allCount += list.length
            return { group, list, avg: percent(earned, total) }
          })
          return (
            <div className="card" style={{ padding: '1.1rem 1.25rem', marginTop: '1.25rem' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--primary)', marginBottom: 10 }}>{t('Notlarım')}</div>
              {rows.map(({ group, list, avg }) => (
                <div key={`${group.subject}|${group.topic}`} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
                    <span>{group.subject} · {group.topic}</span>
                    <span style={{ color: '#0a9e90' }}>{t('Ortalama not')}: {avg}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {list.map(([index, q]) => (
                      <span key={index} style={{ fontSize: 11.5, border: '1px solid var(--border)', borderRadius: 8, padding: '3px 8px' }}>{t('Soru {n}', { n: index + 1 })}: <b>{q.earned}/{q.total}</b></span>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800 }}>
                <span>{t('Genel ortalama')} <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text2)' }}>({t('{n} soru çözüldü', { n: allCount })})</span></span>
                <span style={{ color: '#0a9e90' }}>{percent(allEarned, allTotal)} / 100</span>
              </div>
            </div>
          )
        })()}
      </div>
      <aside className="oe-side" aria-label={t('Çözülenler')}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--primary)', marginBottom: 8 }}>{t('Çözülenler')}</div>
          <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} onClick={() => setPaperOpen(true)}>{t('📷 Kâğıtları yükle')}</button>
          {mySessions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{t('Başladığın senaryo soruları burada listelenir.')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {(() => {
                // Ders · dönem · senaryo başına tek satır; her sorunun en son denemesi gösterilir.
                const groups = new Map<string, { subject: string; topic: string; items: MySession[] }>()
                for (const item of mySessions) {
                  const key = `${item.subject.toLocaleLowerCase('tr')}|${item.topic}`
                  const group = groups.get(key) || { subject: item.subject, topic: item.topic, items: [] }
                  if (!group.items.some(other => other.question_index === item.question_index)) group.items.push(item)   // liste en yeniden eskiye: ilk görülen en yenidir
                  groups.set(key, group)
                }
                return [...groups.entries()].map(([key, group]) => {
                  const items = [...group.items].sort((x, y) => x.question_index - y.question_index)
                  const solved = items.filter(item => item.graded_at).length
                  const expanded = !!openGroups[key]
                  return (
                    <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <button type="button" aria-expanded={expanded} onClick={() => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', color: 'inherit' }}>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800 }}>{group.subject} · {group.topic}</span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{t('{n} soru', { n: items.length })} · {solved > 0 ? t('{n} soru çözüldü', { n: solved }) : t('Çözülmedi')}</span>
                        </span>
                        <span aria-hidden style={{ fontSize: 11, color: 'var(--text3)' }}>{expanded ? '▲' : '▼'}</span>
                      </button>
                      {expanded && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 10px', display: 'grid', gap: 6 }}>
                          {items.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: item.id === sessionId && step !== 'setup' ? 'var(--accent-bg)' : 'transparent', borderRadius: 6, padding: '2px 4px' }}>
                              {item.graded_at ? (
                                <button type="button" onClick={() => openDetail(item.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'inherit' }}>
                                  {t('Soru {n}', { n: item.question_index + 1 })} · <b style={{ color: '#0a9e90' }}>{item.total_earned ?? 0}/{item.total_possible ?? 100}</b> <span style={{ color: 'var(--text3)' }}>›</span>
                                </button>
                              ) : <span style={{ flex: 1 }}>{t('Soru {n}', { n: item.question_index + 1 })} · <span style={{ color: 'var(--text3)' }}>{t('Çözülmedi')}</span></span>}
                              {!item.graded_at && <button className="btn btn-sm" onClick={() => openSession(item.id)}>{t('Çöz')}</button>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </aside>
      </div>

      {detail && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(10,20,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetail(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem', borderRadius: 6 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 700 }}>{detail.subject} · {detail.topic} · {t('Soru {n}', { n: detail.question_index + 1 })}</div>
            <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.6, margin: '6px 0 12px' }}><MathText text={detail.question} /></p>
            <AnswerSections sections={[
              { key: 'mine', label: t('Verilen yanıt'), content: (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0a9e90', marginBottom: 8 }}>{detail.total_earned ?? 0} / {detail.total_possible ?? 100}</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.7, background: 'var(--bg2, var(--bg))', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>{detail.student_answer?.trim() || t('Cevap bulunamadı')}</div>
                  {detail.overall_feedback && <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 10 }}>{detail.overall_feedback}</p>}
                  {(detail.criteria_results || []).map((c, i) => (
                    <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{c.criterion}</span><span style={{ color: '#0a9e90' }}>{c.earnedPoints}/{c.maxPoints}</span></div>
                      {c.feedback && <div style={{ color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{c.feedback}</div>}
                    </div>
                  ))}
                </div>
              ) },
              { key: 'expected', label: t('Verilmesi gereken en olası yanıt'), content: (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 8px' }}>{t('Tam puan için beklenen yanıt unsurları:')}</p>
                  {(detail.rubric || []).map((c, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px', marginBottom: 8, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{c.criterion}</span><span style={{ color: 'var(--accent)' }}>{c.maxPoints} {t('puan')}</span></div>
                      {c.description && <div style={{ color: 'var(--text2)', marginTop: 3, lineHeight: 1.6 }}><MathText text={c.description} /></div>}
                    </div>
                  ))}
                </div>
              ) },
            ]} />
            <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => setDetail(null)}>{t('Kapat')}</button>
          </div>
        </div>
      )}
      {paperOpen && <OpenEndedPaperUpload sessions={mySessions} onClose={() => setPaperOpen(false)} onSaved={() => { void loadMySessions(); void loadScenarios() }} />}
    </main>
  )
}
