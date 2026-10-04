'use client'
import MathText from "@/components/MathText"

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Practice = { id: string; status: string; question: string; options: string[]; firstChoice: number | null; retryChoice: number | null; hintCount: number; correctIndex?: number; explanation?: string | null }

function CoachGuidedPracticeContent() {
  const cycleId = useSearchParams().get('cycleId') || ''
  const [practice, setPractice] = useState<Practice | null>(null)
  const [choice, setChoice] = useState<number | null>(null)
  const [explanation, setExplanation] = useState('')
  const [hint, setHint] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const request = useCallback(async (method: 'GET' | 'POST', body?: Record<string, unknown>) => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Önce giriş yapmalısın.')
    const response = await fetch(method === 'GET' ? `/api/coach/guided-practice?${new URLSearchParams({ cycleId })}` : '/api/coach/guided-practice', {
      method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify({ cycleId, ...body }) } : {}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Çalışma yüklenemedi.')
    return data
  }, [cycleId])

  const load = useCallback(async () => {
    if (!cycleId) return
    try { setPractice((await request('GET')).practice) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Çalışma yüklenemedi.') }
  }, [cycleId, request])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function action(name: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setMessage('')
    try {
      const result = await request('POST', { action: name, ...payload })
      if (result.hint) setHint(result.hint)
      if (name === 'explain') setMessage(`${result.correct ? 'Yeniden denemede doğru.' : 'Yeniden denemede doğru değil.'} ${result.explanation || ''} ${result.note || ''}`)
      setChoice(null)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'İşlem tamamlanamadı.') }
    finally { setBusy(false) }
  }

  return <main style={{ maxWidth: 760, margin: '40px auto', padding: '0 18px', color: 'var(--text)' }}>
    <Link href="/verified-learning" style={{ color: 'var(--primary)', fontSize: 14 }}>← Öğrenme pilotuna dön</Link>
    <h1 style={{ margin: '18px 0 8px' }}>Prof. Prati ile rehberli çalışma</h1>
    <p style={{ color: 'var(--text2)' }}>Önce kendi yanıtını seç, sonra düşünme ipucunu kullanıp yeniden dene ve gerekçeni yaz. İpucuyla yapılan bu çalışma, yardımsız ölçümün yerine geçmez.</p>
    {message && <p role="status" style={{ color: '#0f766e' }}><MathText text={message} /></p>}
    {!practice ? <button className="btn btn-primary" disabled={busy || !cycleId} onClick={() => void action('start')}>Rehberli çalışmayı başlat</button> :
      <section className="card">
        <h2 style={{ fontSize: 18 }}><MathText text={practice.question} /></h2>
        {practice.status === 'completed' ? <p><strong>Çalışma tamamlandı.</strong> <MathText text={practice.explanation || ''} /> Şimdi uygun zamanda yardımsız son teste geçebilirsin.</p> : <>
          {['awaiting_first', 'awaiting_retry'].includes(practice.status) && <div style={{ display: 'grid', gap: 8 }}>
            {practice.options.map((option, index) => <label key={index} style={{ display: 'flex', gap: 8, padding: 9, border: '1px solid var(--border)', borderRadius: 8 }}>
              <input type="radio" name="coach-practice-choice" checked={choice === index} onChange={() => setChoice(index)} /><MathText text={option} />
            </label>)}
            <button className="btn btn-primary" disabled={busy || choice === null} onClick={() => void action(practice.status === 'awaiting_first' ? 'first' : 'retry', { choice })}>{practice.status === 'awaiting_first' ? 'İlk denememi kaydet' : 'Yeniden dene'}</button>
          </div>}
          {practice.status === 'awaiting_hint' && <div>
            <p>İlk denemen kaydedildi. Şimdi çözümü göstermeyen bir düşünme ipucu alabilirsin.</p>
            <button className="btn btn-primary" disabled={busy} onClick={() => void action('hint')}>Düşünme ipucu al</button>
          </div>}
          {practice.status === 'awaiting_retry' && <p style={{ color: '#0f766e' }}><MathText text={hint || 'Soruda ne istendiğini ve hangi bilgilerin verildiğini yeniden düşün. Seçenekleri tek tek karşılaştır.'} /></p>}
          {practice.status === 'awaiting_explanation' && <div style={{ display: 'grid', gap: 8 }}>
            <label htmlFor="coach-explanation">Yanıtına nasıl ulaştığını kendi cümlelerinle açıkla</label>
            <textarea id="coach-explanation" value={explanation} onChange={event => setExplanation(event.target.value)} rows={4} maxLength={1000} style={{ width: '100%', borderRadius: 9, padding: 10 }} />
            <button className="btn btn-primary" disabled={busy || explanation.trim().length < 10} onClick={() => void action('explain', { explanation })}>Gerekçemi kaydet ve sonucu gör</button>
          </div>}
          {practice.status === 'processing' && <p>Sonuç kesinleştiriliyor. Açıklamanı tekrar göndermen gerekirse önceki metni aynen kullan.</p>}
        </>}
      </section>}
  </main>
}

export default function CoachGuidedPracticePage() {
  return <Suspense fallback={<main style={{ maxWidth: 760, margin: '40px auto', padding: 18 }}>Çalışma yükleniyor…</main>}>
    <CoachGuidedPracticeContent />
  </Suspense>
}
