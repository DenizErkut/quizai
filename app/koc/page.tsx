'use client'
// app/koc/page.tsx — Pratium Koç, Faz E (sade sürüm): dedike bir sohbet
// sayfası. /api/coach/chat'e bağlanır — konuşma geçmişi kalıcı, açılış
// mesajı gerçek öğrenci verisine (streak/mastery/öneriler) dayanıyor.
// Eylem butonları (Faz C) ve dashboard'a gömülü sohbet balonu (Faz D
// sonrası) sonraki adımlar; bu sürüm bilinçli olarak sade tutuldu.
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface CoachMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
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
      } catch {
        setError('Bağlantı hatası, lütfen sayfayı yenile.')
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
