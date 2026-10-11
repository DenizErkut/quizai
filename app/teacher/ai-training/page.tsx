'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import PeriodicAiQuiz from '@/components/teacher/PeriodicAiQuiz'
import { TEACHER_AI_TRAINING_MODULES, type TeacherTrainingModuleId } from '@/lib/teacher-ai-training-course'

type ModuleProgress = { module_id: TeacherTrainingModuleId; passed: boolean; score: number; attempt_count: number; attested_at: string; passed_at: string | null }
type Certificate = { certificate_id: string; issued_at: string; course_version: string } | null
type TrainingFeedback = { score: number; passed: boolean; results: Array<{ id: string; correct: string; explanation: string; isCorrect: boolean }> }

export default function TeacherAITrainingPage() {
  const { t: tr, locale } = useT()
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState('')
  const [progress, setProgress] = useState<ModuleProgress[]>([])
  const [certificate, setCertificate] = useState<Certificate>(null)
  const [activeModule, setActiveModule] = useState<TeacherTrainingModuleId>('verify')
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({})
  const [attested, setAttested] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<Record<string, TrainingFeedback>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { router.push('/login/teacher'); return }
    setSessionToken(session.access_token)
    const response = await fetch('/api/teacher/ai-training', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
    const data = await response.json()
    if (response.status === 401) { router.push('/login/teacher'); return }
    if (!response.ok) throw new Error(data.error || tr('Eğitim durumu yüklenemedi.'))
    setProgress(data.modules || [])
    setCertificate(data.certificate || null)
    const firstIncomplete = TEACHER_AI_TRAINING_MODULES.find(module => !data.modules?.some((item: ModuleProgress) => item.module_id === module.id && item.passed))
    if (firstIncomplete) setActiveModule(firstIncomplete.id)
  }, [router, supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch(reason => setError(reason instanceof Error ? reason.message : tr('Eğitim yüklenemedi.'))).finally(() => setLoading(false))
  }, [load])

  const passedCount = progress.filter(item => item.passed).length
  const activeIndex = TEACHER_AI_TRAINING_MODULES.findIndex(item => item.id === activeModule)
  const currentModule = TEACHER_AI_TRAINING_MODULES[activeIndex]
  const unlocked = (index: number) => index === 0 || TEACHER_AI_TRAINING_MODULES.slice(0, index).every(module => progress.some(item => item.module_id === module.id && item.passed))
  const currentAnswers = answers[activeModule] || {}

  async function submitModule() {
    if (!sessionToken || !currentModule || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/teacher/ai-training', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ moduleId: activeModule, answers: currentAnswers, attestedRead: attested[activeModule] === true }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || tr('Değerlendirme kaydedilemedi.'))
      setFeedback(current => ({ ...current, [activeModule]: result }))
      await load()
      if (result.passed && activeIndex < TEACHER_AI_TRAINING_MODULES.length - 1) setActiveModule(TEACHER_AI_TRAINING_MODULES[activeIndex + 1].id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr('Değerlendirme kaydedilemedi.')) }
    finally { setBusy(false) }
  }

  if (loading) return <main className="card" style={{ maxWidth: 800, margin: '3rem auto' }}>{tr('Öğretmen eğitimi yükleniyor…')}</main>

  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.25rem' }}>
    <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><Link href="/teacher" style={{ color: 'var(--text2)', textDecoration: 'none' }}>{tr('← Öğretmen paneli')}</Link><h1 style={{ color: 'var(--primary)', margin: '12px 0 4px' }}>{tr('Öğretmen AI eğitimi · Pilot')}</h1>
          <div style={{ color: 'var(--text2)' }}>{tr('Dört kısa modül · 16 uygulamalı soru · geçiş için her modülde en az 3/4')}</div></div>
        <div className="card" style={{ minWidth: 130, textAlign: 'center' }}><b>{passedCount}/4</b><div style={{ fontSize: 12, color: 'var(--text2)' }}>{tr('tamamlanan modül')}</div></div>
      </div>
      <PeriodicAiQuiz />
      <div className="card" style={{ color: 'var(--text2)', lineHeight: 1.6 }}>
        {tr('Bu, Pratium içi bir pilot tamamlama rozetidir; resmî veya akredite mesleki sertifika değildir. Konular: AI çıktısını doğrulama, MEB kazanım uyumu, yaşa uygun geri bildirim ve öğrenci verisi/güvenliği. İçerik modül testlerini geçerek tamamlanır; model çağrısı yapılmaz.')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', gap: 8 }}>
        {TEACHER_AI_TRAINING_MODULES.map((module, index) => {
          const result = progress.find(item => item.module_id === module.id)
          return <button key={module.id} className="btn" disabled={!unlocked(index) || Boolean(result?.passed)} onClick={() => setActiveModule(module.id)}
            style={{ textAlign: 'left', padding: 12, background: activeModule === module.id ? 'var(--bg2)' : undefined, opacity: unlocked(index) ? 1 : .55 }}>
            <b>{result?.passed ? '✓ ' : `${index + 1}. `}{module.title}</b><div style={{ fontSize: 12, marginTop: 5, color: 'var(--text2)' }}>{result?.passed ? tr('Tamamlandı · {n}/4', { n: result.score }) : unlocked(index) ? tr('İçerik · {n} kısa bölüm', { n: module.lessons.length }) : tr('Önceki modülü tamamlayın')}</div>
          </button>
        })}
      </div>

      {currentModule && !certificate && <section className="card" style={{ display: 'grid', gap: 14 }}>
        <div><h2 style={{ margin: '0 0 5px', color: 'var(--primary)' }}>{currentModule.title}</h2><div style={{ color: 'var(--text2)' }}>{currentModule.summary}</div></div>
        {currentModule.lessons.map((lesson, index) => <article key={lesson.heading} style={{ borderLeft: '3px solid var(--accent)', padding: '4px 0 4px 12px' }}>
          <b>{index + 1}. {lesson.heading}</b><p style={{ margin: '5px 0', lineHeight: 1.65 }}>{lesson.body}</p>
        </article>)}
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'grid', gap: 12 }}>
          <legend style={{ padding: '0 6px', fontWeight: 700 }}>{tr('Uygulamalı kontrol')}</legend>
          {currentModule.questions.map((question, index) => {
            const questionFeedback = feedback[activeModule]?.results.find(item => item.id === question.id)
            return <div key={question.id} style={{ display: 'grid', gap: 5 }}>
            <b style={{ fontSize: 14 }}>{index + 1}. {question.prompt}</b>
            {Object.entries(question.choices).map(([choice, text]) => <label key={choice} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 5, cursor: 'pointer' }}>
              <input type="radio" name={question.id} value={choice} checked={currentAnswers[question.id] === choice}
                onChange={() => setAnswers(current => ({ ...current, [activeModule]: { ...(current[activeModule] || {}), [question.id]: choice } }))} />
              <span><b>{choice})</b> {text}</span>
            </label>)}
            {questionFeedback && <small style={{ color: questionFeedback.isCorrect ? 'var(--green, #168447)' : 'var(--red, #b54735)' }}>
              {questionFeedback.isCorrect ? tr('Doğru.') : tr('Doğru yanıt {answer}.', { answer: questionFeedback.correct })} {questionFeedback.explanation}
            </small>}
          </div>})}
        </fieldset>
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', color: 'var(--text2)' }}>
          <input type="checkbox" checked={attested[activeModule] || false} onChange={event => setAttested(current => ({ ...current, [activeModule]: event.target.checked }))} />
          <span>{tr('Bu modülün kısa içeriklerini okudum ve uygulama sorularını kendim yanıtladım.')}</span>
        </label>
        <button className="btn btn-primary" disabled={busy || !attested[activeModule] || currentModule.questions.some(question => !currentAnswers[question.id])} onClick={() => void submitModule()}>
          {busy ? tr('Kaydediliyor…') : progress.some(item => item.module_id === activeModule) ? tr('Değerlendirmeyi yinele') : tr('Modülü değerlendir')}
        </button>
        {feedback[activeModule] && <div role="status" style={{ color: feedback[activeModule].passed ? 'var(--green, #168447)' : 'var(--text2)' }}>
          {tr('{n}/4 doğru.', { n: feedback[activeModule].score })} {feedback[activeModule].passed ? tr('Modül tamamlandı.') : tr('Geçiş için 3 doğru gerekiyor; açıklamaları inceleyip yeniden deneyebilirsiniz.')}
        </div>}
      </section>}

      {certificate && <section className="card" style={{ textAlign: 'center', padding: '2rem', border: '2px solid var(--accent)' }}>
        <div style={{ fontSize: 34 }}>🎓</div><h2 style={{ color: 'var(--primary)' }}>{tr('Pilot tamamlandı')}</h2>
        <p>{tr('Öğretmen AI Okuryazarlığı Pilot Rozeti')}</p>
        <p style={{ color: 'var(--text2)' }}>{tr('Tamamlanma: {date}', { date: new Date(certificate.issued_at).toLocaleDateString(intlLocale(locale)) })}<br />{tr('Doğrulama kodu:')} <code>{certificate.certificate_id}</code></p>
        <button className="btn btn-primary" onClick={() => window.print()}>{tr('Rozeti yazdır / PDF olarak kaydet')}</button>
        <small style={{ display: 'block', marginTop: 12, color: 'var(--text2)' }}>{tr('Bu belge Pratium içi pilot katılım/başarı kaydıdır; akredite resmî sertifika değildir.')}</small>
      </section>}
      {error && <div role="alert" style={{ color: 'var(--red, #b54735)' }}>{error}</div>}
    </div>
  </main>
}
