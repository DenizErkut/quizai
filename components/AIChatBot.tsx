'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are Pratium Assistant, a helpful support bot for the Pratium AI-powered quiz platform.

You help users with:
- How to use Pratium features (creating tests, question types, difficulty levels, etc.)
- Account and subscription questions (free vs premium, invite friends, etc.)
- Teacher panel usage (creating classes, assignments, student management)
- Technical issues and navigation
- Understanding their progress (streaks, analysis, leaderboard, archive)

STRICT RULES:
1. NEVER answer questions about test content, quiz answers, or help users cheat on any test
2. NEVER solve math problems, science questions, or any academic subject matter
3. If asked about quiz answers or test content, politely decline and redirect to platform help
4. Only discuss Pratium platform features and usage
5. Be friendly, concise, and helpful
6. Answer in the same language the user writes in (Turkish or English)

Key Pratium features to help with:
- Quiz creation: topic selection, difficulty (kolay/normal/zor/çok zor), question types (multiple choice, fill blank, true/false, matching, ordering, short answer), file upload
- Free plan: 10 tests/month, 5 questions max
- Premium: unlimited tests, 6 languages, 20 questions, file upload, visual questions
- Daily tests and streak system
- 4-week AI study plan (requires 10 completed tests)
- Leaderboard and rankings
- Question archive
- AI chat assistant after tests
- Teacher panel: requires application and admin approval, class management, assignments
- Invite friends: 10 invites = 1 year free premium
- Joining a class: pratium.com/join with invite code`

export default function AIChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Merhaba! 👋 Pratium hakkında sorularını yanıtlamak için buradayım. Özellik, kullanım veya hesap konularında nasıl yardımcı olabilirim?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!open && messages.length > 1) setUnread(prev => prev + 0)
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          system: SYSTEM_PROMPT,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      if (!open) setUnread(prev => prev + 1)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Bağlantı hatası, lütfen tekrar dene.' }])
    } finally {
      setLoading(false)
    }
  }

  const quickQuestions = [
    'Test nasıl oluşturabilirim?',
    'Premium\'a nasıl geçebilirim?',
    'Sınıfa nasıl katılabilirim?',
    'Gelişim planı nedir?',
  ]

  return (
    <>
      {/* Chat penceresi */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', zIndex: 9998,
          width: '360px', maxWidth: 'calc(100vw - 32px)',
          background: '#fff', borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(8,36,101,0.18)',
          border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column',
          maxHeight: '520px',
          animation: 'botSlideUp 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #082465, #1ECFB8)',
            borderRadius: '20px 20px 0 0',
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                🤖
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Pratium Asistan</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>Platform hakkında sorularınız için</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px' }}>×</button>
          </div>

          {/* Mesajlar */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, marginRight: '8px', alignSelf: 'flex-end' }}>🤖</div>
                )}
                <div style={{
                  maxWidth: '78%',
                  padding: '10px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'linear-gradient(135deg, #082465, #1ECFB8)' : '#f8fafc',
                  color: m.role === 'user' ? '#fff' : '#0F172A',
                  fontSize: '13px', lineHeight: 1.6,
                  border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🤖</div>
                <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1ECFB8', display: 'inline-block', animation: `botBounce 1.2s ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Hızlı sorular — sadece başlangıçta */}
          {messages.length <= 1 && (
            <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickQuestions.map(q => (
                <button key={q} onClick={() => { setInput(q); setTimeout(() => { setInput(''); setMessages(prev => [...prev, { role: 'user', content: q }]); setLoading(true); fetch('/api/bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...messages, { role: 'user', content: q }], system: SYSTEM_PROMPT }) }).then(r => r.json()).then(d => { setMessages(prev => [...prev, { role: 'assistant', content: d.reply }]); setLoading(false) }).catch(() => setLoading(false)) }, 0) }}
                  style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#082465', cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s' }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Pratium hakkında bir şey sor..."
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '20px',
                border: '1.5px solid #e2e8f0', background: '#f8fafc',
                fontSize: '13px', fontFamily: 'var(--font-sans)',
                outline: 'none', color: '#0F172A',
              }}
              onFocus={e => (e.target.style.borderColor = '#1ECFB8')}
              onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
            />
            <button onClick={send} disabled={loading || !input.trim()} style={{
              width: 38, height: 38, borderRadius: '50%',
              background: input.trim() ? 'linear-gradient(135deg, #082465, #1ECFB8)' : '#e2e8f0',
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', color: '#fff', flexShrink: 0,
              transition: 'all 0.15s',
            }}>↑</button>
          </div>
        </div>
      )}

      {/* FAB butonu */}
      <button
        onClick={() => { setOpen(v => !v); setUnread(0) }}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: 60, height: 60, borderRadius: '50%',
          background: 'linear-gradient(135deg, #082465, #1ECFB8)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '26px',
          boxShadow: '0 8px 32px rgba(8,36,101,0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(8,36,101,0.4)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(8,36,101,0.3)' }}
      >
        {open ? '×' : '🤖'}
        {!open && unread > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: '#FDD31D', color: '#082465', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
            {unread}
          </span>
        )}
      </button>

      <style>{`
        @keyframes botSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes botBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  )
}
