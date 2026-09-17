'use client'
// app/koc/page.tsx — Pratium Koç, Faz E/C: dedike bir sohbet sayfası +
// eyleme geçirilebilir mesajlar. /api/coach/chat'e bağlanır — konuşma
// geçmişi kalıcı, açılış mesajı gerçek öğrenci verisine (streak/mastery/
// öneriler) dayanıyor. Koç somut bir çalışma önerdiğinde mesajın action
// alanı dolu gelir (bkz. lib/coach-generation.ts); bu, gerçek bir
// "Çalışmayı başlat" butonuna çevrilip /quiz'e yönlendiriyor. action bir
// gerçek student_recommendations satırına (recommendationId) karşılık
// geliyorsa, /quiz'e gitmeden önce /api/recommendations üzerinden o
// öneri 'accepted' olarak işaretleniyor — RecommendationLifecycle
// bileşeninin izlediği aynı akış.
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface CoachAction {
  type: 'start_practice'
  topic: string
  subject?: string
  questionCount?: number
  recommendationId?: string
}

interface CoachMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  action?: CoachAction | null
  created_at?: string
}

export default function PratiumKocPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: { session } } = await supabase.auth.getSession()
      try {
        const res = await fetch('/api/coach/chat', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Koç yüklenemedi.'); setLoading(false); return }
        setMessages(data.messages || [])
        // Öğrenci koçu açtığında, Faz D'nin cron'unun bıraktığı proaktif
        // bildirimleri okunmuş işaretle — aksi halde global maskot
        // ikonundaki rozet (bkz. components/CoachMascot.tsx) burayı
        // ziyaret etse bile hiç sıfırlanmıyordu.
        void supabase.from('notifications').update({ read: true })
          .eq('user_id', user.id).eq('type', 'coach_nudge').eq('read', false)
      } catch {
        setError('Bağlantı hatası, lütfen sayfayı yenile.')
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startPractice(action: CoachAction, messageId?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Kullanım analitikleri: butona gerçekten tıklandığını kaydet — koçun
      // action'ı SUNMASI (coach_messages.action) ile öğrencinin onu
      // TIKLAMASI farklı şeyler; bu olmadan click-through oranı hiç
      // ölçülemiyordu. Analitik yazımı başarısız olsa bile pratiğe
      // başlamayı asla engellemiyoruz.
      if (user) {
        void supabase.from('coach_action_clicks').insert({
          user_id: user.id,
          message_id: messageId || null,
          topic: action.topic,
          recommendation_id: action.recommendationId || null,
        })
      }
    } catch {
      // analitik kaydı başarısız olabilir, akışı bozmaz
    }
    try {
      if (action.recommendationId) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ recommendationId: action.recommendationId, action: 'accept' }),
        })
      }
    } catch {
      // öneri kabul edilemese bile pratiğe başlamayı engelleme
    }
    const params = new URLSearchParams()
    params.set('topic', action.topic)
    if (action.subject) params.set('subject', action.subject)
    params.set('count', String(action.questionCount || 8))
    if (action.recommendationId) params.set('recommendationId', action.recommendationId)
    router.push(`/quiz?${params.toString()}`)
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setError('')
    setMessages(m => [...m, { role: 'user', content: text }])
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Koç yanıt veremedi.'); setSending(false); return }
      setMessages(m => [...m, data.message])
    } catch {
      setError('Bağlantı hatası, lütfen tekrar dene.')
    }
    setSending(false)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href="/dashboard" className="btn-ghost btn" style={{ padding: '6px 10px' }}>←</Link>
        <span style={{ fontSize: '22px' }}>✦</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--primary)' }}>Pratium Koç</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Sana özel, verine dayanan öneriler</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', maxWidth: '640px', width: '100%', margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '3rem' }}><div className="spinner" /></div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={m.id || i} style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '10px',
              }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  fontSize: '13.5px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg2)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                }}>
                  {m.content}
                  {m.action?.type === 'start_practice' && (
                    <button
                      onClick={() => startPractice(m.action as CoachAction, m.id)}
                      className="btn btn-primary"
                      style={{ marginTop: '10px', width: '100%', fontSize: '13px', padding: '8px 12px' }}
                    >
                      ▶ Çalışmayı başlat: {m.action.topic}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
                <div style={{ padding: '10px 14px', borderRadius: '14px', background: 'var(--bg2)', fontSize: '13px', color: 'var(--text3)' }}>
                  ⏳ yazıyor…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {error && (
        <div style={{ maxWidth: '640px', width: '100%', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '8px' }}>
            {error}
          </div>
        </div>
      )}

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        style={{ display: 'flex', gap: '8px', padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Koça bir şey sor…"
          disabled={loading || sending}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1.5px solid var(--border)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || sending || !input.trim()}>Gönder</button>
      </form>
    </main>
  )
}
