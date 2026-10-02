'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Stage = 'baseline' | 'post' | 'transfer'
type Question = { index: number; text: string; options: string[] }
type Cycle = {
  id: string; status: string; objective: { code: string; title: string; subject: string } | null;
  nextStage: Stage | null; gate: string | null;
  startedAttempt: { id: string; questions: Question[] } | null;
  attempts: { stage: Stage; status: string; scorePct: number | null }[]
}
const stageLabel: Record<Stage, string> = { baseline: 'Yardımsız ön test', post: 'Yardımsız son test', transfer: 'Gecikmeli yeni durum testi' }

export default function VerifiedLearningPage() {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [active, setActive] = useState<{ cycleId: string; attemptId: string; questions: Question[] } | null>(null)
  const [choices, setChoices] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const request = useCallback(async (method: 'GET' | 'POST', body?: Record<string, unknown>) => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Önce giriş yapmalısın.')
    const response = await fetch('/api/student/verified-learning', {
      method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
    return data
  }, [])

  const load = useCallback(async () => {
    try { setCycles((await request('GET')).cycles || []) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Ölçümler alınamadı.') }
  }, [request])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function start(cycle: Cycle) {
    if (!cycle.nextStage) return
    setBusy(true); setMessage('')
    try {
      const result = cycle.startedAttempt || await request('POST', { action: 'start', cycleId: cycle.id, stage: cycle.nextStage })
      setActive({ cycleId: cycle.id, attemptId: result.id || result.attemptId, questions: result.questions })
      setChoices(Array(result.questions.length).fill(-1))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Test başlatılamadı.') }
    finally { setBusy(false) }
  }

  async function submit() {
    if (!active || choices.some(choice => choice < 0)) return
    setBusy(true); setMessage('')
    try {
      const result = await request('POST', { action: 'submit', attemptId: active.attemptId, choices })
      setActive(null); setChoices([])
      await load()
      setMessage(`${result.correctCount}/${result.total} doğru · %${result.scorePct}. ${result.interpretation}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Yanıtlar kaydedilemedi.') }
    finally { setBusy(false) }
  }

  return <main style={{ maxWidth: 820, margin: '40px auto', padding: '0 18px', color: 'var(--text)' }}>
    <Link href="/dashboard" style={{ color: 'var(--primary)', fontSize: 14 }}>← Panele dön</Link>
    <h1 style={{ margin: '18px 0 8px' }}>Doğrulanmış öğrenme pilotu</h1>
    <p style={{ color: 'var(--text2)', lineHeight: 1.5 }}>Öğretmeninin atadığı kazanımda önce yardımsız ölçüm, sonra çalışma, ardından farklı sorularla son ölçüm ve gecikmeli yeni durum testi yapılır. Sonuçları öğretmenin ayrıca inceler.</p>
    {message && <p role="status" style={{ color: '#0f766e' }}>{message}</p>}
    {active ? <section className="card">
      <h2 style={{ fontSize: 18 }}>Tüm soruları yardımsız yanıtla</h2>
      <p style={{ color: 'var(--text3)' }}>Bu ölçümde ipucu ve cevap anahtarı gösterilmez. Sayfadan çıkarsan aynı denemeye dönebilirsin.</p>
      {active.questions.map((question, index) => <div key={index} style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
        <strong>{index + 1}. {question.text}</strong>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{question.options.map((option, optionIndex) => <label key={optionIndex} style={{ display: 'flex', gap: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
          <input type="radio" name={`question-${index}`} checked={choices[index] === optionIndex} onChange={() => setChoices(current => current.map((value, i) => i === index ? optionIndex : value))} />{option}
        </label>)}</div>
      </div>)}
      <button className="btn btn-primary" disabled={busy || choices.some(choice => choice < 0)} onClick={() => void submit()}>{busy ? 'Kaydediliyor…' : 'Yanıtları gönder'}</button>
    </section> : <div style={{ display: 'grid', gap: 12 }}>
      {cycles.length === 0 && <section className="card">Öğretmenin tarafından atanmış bir ölçüm döngüsü henüz yok.</section>}
      {cycles.map(cycle => <section className="card" key={cycle.id}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>{cycle.objective?.code || 'Kazanım'} · {cycle.objective?.title || 'Ölçüm'}</h2>
        <p style={{ color: 'var(--text3)' }}>{cycle.objective?.subject} · {cycle.attempts.map(attempt => `${stageLabel[attempt.stage]}: ${attempt.status === 'completed' ? `%${attempt.scorePct}` : 'başlandı'}`).join(' · ') || 'Başlamadı'}</p>
        {cycle.nextStage ? <>
          <strong>Sıradaki adım: {stageLabel[cycle.nextStage]}</strong>
          {cycle.gate && !cycle.startedAttempt ? <p style={{ color: 'var(--text2)' }}>{cycle.gate} {cycle.nextStage === 'post' && <Link href={`/koc/pratik?cycleId=${cycle.id}`}>Prof. Prati ile rehberli çalışmaya git</Link>}</p> :
            <div style={{ marginTop: 10 }}><button className="btn btn-primary" disabled={busy} onClick={() => void start(cycle)}>{cycle.startedAttempt ? 'Kaldığın yerden devam et' : 'Teste başla'}</button></div>}
        </> : <strong>Üç test aşaması tamamlandı. Aktarımın geçerliliğini öğretmenin ayrıca inceleyecek.</strong>}
      </section>)}
    </div>}
  </main>
}
