'use client'
import MathText from "@/components/MathText"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Check = {
  id: string; subject: string; grade: string | null; topic: string; learningObjectiveCode: string | null;
  status: 'pending' | 'served'; available?: boolean; question?: string; options?: string[]
}

export default function TransferChecksPage() {
  const [checks, setChecks] = useState<Check[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState<{ correctIndex: number; explanation: string | null; correct: boolean } | null>(null)

  const request = useCallback(async (method: 'GET' | 'POST', body?: Record<string, unknown>) => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Önce giriş yapmalısın.')
    const response = await fetch('/api/transfer-check', {
      method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Kontrol alınamadı.')
    return data
  }, [])

  const load = useCallback(async () => {
    try { setChecks((await request('GET')).due || []) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Kontroller yüklenemedi.') }
  }, [request])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function claim(check: Check) {
    setBusy(true); setMessage(''); setFeedback(null); setSelected(null)
    try {
      const result = await request('POST', { action: 'claim', checkId: check.id })
      setChecks(previous => previous.map(item => item.id === check.id ? { ...item, ...result.check } : item))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Soru açılamadı.') }
    finally { setBusy(false) }
  }

  async function answer(check: Check) {
    if (selected === null) return
    setBusy(true); setMessage('')
    try {
      const result = await request('POST', { action: 'complete', checkId: check.id, answerIndex: selected })
      setFeedback({ correctIndex: result.correctIndex, explanation: result.explanation, correct: result.check.transfer_result === 'independent_success' })
      setChecks(previous => previous.filter(item => item.id !== check.id))
      setSelected(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Yanıt kaydedilemedi.') }
    finally { setBusy(false) }
  }

  const active = checks.find(check => check.status === 'served')
  return <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 18px', color: 'var(--text)' }}>
    <Link href="/dashboard" style={{ color: 'var(--primary)', fontSize: 14 }}>← Panele dön</Link>
    <h1 style={{ margin: '18px 0 8px' }}>Yardımsız tekrar kontrolü</h1>
    <p style={{ color: 'var(--text2)', lineHeight: 1.5 }}>Önceden çalıştığın bir kazanımı yeni bir soruda dene. Bu tek soru, tek başına doğrulanmış öğrenme kazanımı anlamına gelmez; öğretmenin kapsamlı ölçümü ayrıca inceleyecektir.</p>
    {message && <p role="alert" style={{ color: '#b45309' }}>{message}</p>}
    {feedback && <section className="card" role="status" style={{ margin: '18px 0' }}>
      <strong>{feedback.correct ? 'Doğru yanıtladın.' : 'Bu kez doğru yanıtlanmadı.'}</strong>
      {feedback.explanation && <p style={{ marginBottom: 0 }}><MathText text={feedback.explanation} /></p>}
    </section>}
    {active && <section className="card" style={{ margin: '18px 0' }}>
      <div style={{ color: 'var(--text3)', fontSize: 13 }}>{active.subject} · {active.topic} · {active.learningObjectiveCode || 'Kazanım'}</div>
      <h2 style={{ fontSize: 18, margin: '12px 0' }}><MathText text={active.question} /></h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {(active.options || []).map((option, index) => <label key={index} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: 10, border: '1px solid var(--border)', borderRadius: 9 }}>
          <input type="radio" name="transfer-answer" checked={selected === index} onChange={() => setSelected(index)} /><MathText text={option} />
        </label>)}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy || selected === null} onClick={() => void answer(active)}>Yanıtı gönder</button>
    </section>}
    {!active && <section className="card" style={{ marginTop: 20 }}>
      {checks.length === 0 ? <p style={{ margin: 0 }}>Şu anda zamanı gelmiş bir tekrar kontrolü yok.</p> : <>
        <h2 style={{ fontSize: 17 }}>Bekleyen kontroller</h2>
        {checks.map(check => <div key={check.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{check.subject} · {check.topic} · {check.learningObjectiveCode || 'Kazanım'}</span>
          {check.available === false
            ? <span style={{ color: 'var(--text3)', fontSize: 12 }}>Bu kazanım için uygun yeni soru hazırlanıyor</span>
            : <button className="btn" disabled={busy} onClick={() => void claim(check)}>Başla</button>}
        </div>)}
      </>}
    </section>}
  </main>
}
