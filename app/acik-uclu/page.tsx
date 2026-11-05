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
  const [startingId, setStartingId] = useState('')

  // Yöneticinin örneklerine dayanan senaryo kartları (dönem + senaryo no)
  type ScenarioCard = { subject: string; term: number; scenarioNo: number; label: string; attempts: number; bestScore: number | null; total: number }
  const [scenarioCards, setScenarioCards] = useState<ScenarioCard[]>([])
  const [scenarioSubject, setScenarioSubject] = useState('')
  const [startingScenario, setStartingScenario] = useState('')

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

  async function startScenario(card: ScenarioCard) {
    const key = `${card.subject}|${card.term}|${card.scenarioNo}`
    setStartingScenario(key); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subject: card.subject, term: card.term, scenarioNo: card.scenarioNo }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error === 'daily_limit_reached' ? t('Günlük test hakkın doldu.') :
                  json.error === 'monthly_limit_reached' ? t('Aylık test hakkın doldu.') :
                  json.error || t('Soru üretilemedi.'))
        return
      }
      setSessionId(json.sessionId); setScenario(json.scenario); setFigureSvg(json.figureSvg || null); setTableText(json.answerTable || null); setTableValues([]); setQuestion(json.question); setRubric(json.rubric)
      setTotalPossible(json.totalPossible); setAnswer(''); setStep('question')
    } catch {
      setError(t('Bağlantı hatası, tekrar dene.'))
    } finally {
      setStartingScenario('')
    }
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
      setScenario(json.scenario); setFigureSvg(null); setTableText(null)
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
      setScenario(json.scenario); setFigureSvg(null); setTableText(null)
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

      <div style={{ maxWidth: step === 'setup' ? '960px' : '640px', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)' }}>{t('Senaryolar')}</div>
              {[...new Set(scenarioCards.map(card => card.subject))].length > 1 && (
                <>
                  <button className={`btn btn-sm ${!scenarioSubject ? 'btn-primary' : ''}`} onClick={() => setScenarioSubject('')}>{t('Tüm dersler')}</button>
                  {[...new Set(scenarioCards.map(card => card.subject))].map(name => (
                    <button key={name} className={`btn btn-sm ${scenarioSubject === name ? 'btn-primary' : ''}`} onClick={() => setScenarioSubject(name)}>{name}</button>
                  ))}
                </>
              )}
            </div>
            {scenarioCards.length === 0 ? (
              <div className="card" style={{ padding: '1rem', fontSize: '13px', color: 'var(--text2)' }}>{t('Bu sınıf için henüz senaryo yüklenmedi. Aşağıdaki serbest pratiği kullanabilirsin.')}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {scenarioCards.filter(card => !scenarioSubject || card.subject === scenarioSubject).map(card => {
                  const key = `${card.subject}|${card.term}|${card.scenarioNo}`
                  return (
                    <div key={key} className="card" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg2, var(--bg))' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{card.subject}</div>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary)' }}>{t('{term}. Dönem {no}. Senaryo', { term: card.term, no: card.scenarioNo })}</div>
                      <div style={{ fontSize: '12px', color: card.attempts ? '#0a9e90' : 'var(--text3)', fontWeight: 600 }}>
                        {card.attempts ? t('Çözüldü · en yüksek {score}/{total}', { score: card.bestScore ?? 0, total: card.total }) : t('Henüz çözülmedi')}
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: 'auto', justifyContent: 'center' }} onClick={() => startScenario(card)} disabled={!!startingScenario}>
                        {startingScenario === key ? t('Senaryo hazırlanıyor…') : card.attempts ? t('Tekrar çöz') : t('Başla →')}
                      </button>
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
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
              {t('📋 Sana Atanan Ödevler')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            </div>
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
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>
              {t('✅ Tamamlanan Ödevler')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            </div>
          </div>
        )}

        {/* ADIM 2: Senaryo + Soru + Cevap yazma */}
        {step === 'question' && (
          <div>
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem', borderLeft: '3px solid #3E8E3E' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#3E8E3E', marginBottom: '6px', textTransform: 'uppercase' }}>{t('Senaryo')}</div>
              <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}><MathText text={scenario} /></p>
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
                style={{ marginTop: '8px', marginBottom: '4px', resize: 'vertical', borderRadius: '12px' }} />
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

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }} onClick={newQuestion}>
              {t('Yeni Soru Çöz')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
