'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useVoiceTutor } from '@/lib/use-voice-tutor'

interface Question {
  q: string; opts: string[]; ans: number; exp: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}
type VoiceSession = { access_token?: string } | null

interface Props {
  topic: string
  language: string
  questions: Question[]
  answers: { userAns: number; correct: boolean }[]
}

export default function ChatAssistant({ topic, language, questions, answers }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const wrongQuestions = questions.filter((_, i) => !answers[i]?.correct)
  const score = answers.filter(a => a.correct).length
  const pct = Math.round((score / questions.length) * 100)
  const voice = useVoiceTutor(
    text => void send(text),
    metric => {
      const supabase = createClient() as any
      void supabase.auth.getSession().then(({ data: { session } }: { data: { session: VoiceSession } }) => fetch('/api/voice-tutor/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ ...metric, topic }),
      }).catch(() => undefined))
    },
  )

  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = wrongQuestions.length > 0
        ? `Merhaba! "${topic}" testini %${pct} ile tamamladın. ${wrongQuestions.length} soruda takıldığın bir nokta olmuş — birlikte gözden geçirelim mi? Hangi soruyla başlayalım, yoksa ilk yanlışından mı başlayayım?`
        : `Merhaba! "${topic}" testini %${pct} ile mükemmel tamamladın 🎉 Konuyla ilgili daha derin soru sormak ister misin?`
      setMessages([{ role: 'assistant', content: greeting }])
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(textOverride?: string) {
    const userMsg = (textOverride ?? input).trim()
    if (!userMsg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const supabase = createClient() as any
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          topic, language, questions, answers,
        }),
      })
      const data = await res.json()
      const reply = typeof data.reply === 'string' ? data.reply : 'Yanıt alınamadı, tekrar dene.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      voice.speak(reply)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Bir hata oluştu, tekrar dene.' }])
    } finally {
      setLoading(false)
    }
  }

  function quickAsk(text: string) {
    setInput(text)
    setTimeout(async () => {
      setInput('')
      setMessages(prev => [...prev, { role: 'user', content: text }])
      setLoading(true)
      const supabase2 = createClient() as any
      const { data: { session: sess2 } } = await supabase2.auth.getSession()
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess2?.access_token}` },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content: text }], topic, language, questions, answers }),
      })
        .then(r => r.json())
        .then(d => {
          const reply = typeof d.reply === 'string' ? d.reply : 'Yanıt alınamadı, tekrar dene.'
          setMessages(prev => [...prev, { role: 'assistant', content: reply }])
          voice.speak(reply)
        })
        .catch(() => setMessages(prev => [...prev, { role: 'assistant', content: 'Bir hata olustu.' }]))
        .finally(() => setLoading(false))
    }, 0)
  }

  return (
    <>
      {/* Aç butonu */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', padding: '13px', borderRadius: '12px', border: '1.5px solid rgba(0,149,200,0.35)',
            background: 'rgba(0,149,200,0.08)', color: 'var(--accent)', fontSize: '14px',
            fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', marginTop: '1rem',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,149,200,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,149,200,0.08)')}
        >
          🤖 AI Asistanla Konuş
        </button>
      )}

      {/* Chat paneli */}
      {open && (
        <div className="card anim-up" style={{ marginTop: '1rem', padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            background: 'rgba(0,149,200,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🤖</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Pratium AI Asistan</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{topic}</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '18px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Ölçülebilir canlı sesli tutor */}
          <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', background: voice.enabled ? 'rgba(30,207,184,0.08)' : 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>🎙️ Canlı Sesli Tutor <span style={{ color: '#0a9e90', fontSize: '10px' }}>ÖLÇÜMLÜ</span></div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                  {voice.enabled ? `Bas-konuş · ${voice.turnCount} tur · ${Math.floor(voice.secondsLeft / 60)}:${String(voice.secondsLeft % 60).padStart(2, '0')} kaldı${voice.lastRecognitionMs ? ` · son algılama ${Math.round(voice.lastRecognitionMs / 100) / 10} sn` : ''}` : `“${topic}” testi ve yanlışlarınla konuş`}
                </div>
              </div>
              <button type="button" onClick={voice.enabled ? voice.disable : voice.requestConsent} style={{ border: '1px solid rgba(0,149,200,0.3)', borderRadius: '16px', padding: '6px 10px', background: voice.enabled ? 'var(--accent)' : 'rgba(0,149,200,0.08)', color: voice.enabled ? '#fff' : 'var(--accent)', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                {voice.enabled ? 'Sesliyi kapat' : 'Sesliyi dene'}
              </button>
            </div>
            {voice.consentPending && (
              <div style={{ marginTop: '8px', padding: '9px', borderRadius: '10px', background: '#fff8df', border: '1px solid #f6df8b', fontSize: '10.5px', color: '#6b5420', lineHeight: 1.45 }}>
                Konuşman yazıya çevrilmek üzere tarayıcının konuşma servisine gönderilebilir. Pratium ham ses kaydetmez; Tutor’a yalnızca oluşan metin ve mevcut test bağlamı gönderilir.
                <div style={{ display: 'flex', gap: '6px', marginTop: '7px' }}>
                  <button type="button" onClick={voice.acceptConsent} style={{ border: 0, borderRadius: '12px', padding: '5px 9px', background: '#087c70', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}>Kabul et ve aç</button>
                  <button type="button" onClick={voice.cancelConsent} style={{ border: '1px solid #d9c778', borderRadius: '12px', padding: '5px 9px', background: '#fff', color: '#6b5420', cursor: 'pointer', fontSize: '10px' }}>Vazgeç</button>
                </div>
              </div>
            )}
            {voice.error && <div role="status" style={{ color: '#b42318', fontSize: '10px', marginTop: '6px' }}>{voice.error}</div>}
          </div>

          {/* Quick actions */}
          {wrongQuestions.length > 0 && messages.length <= 1 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => quickAsk('Yanlış sorularımı birlikte gözden geçirelim, ilk sorudan başla')}
                style={quickBtnStyle}>🔍 Yanlışlarımı birlikte inceleyelim</button>
              <button onClick={() => quickAsk('Sadece doğru cevapları söyle, uzatma')}
                style={quickBtnStyle}>⚡ Sadece cevabı söyle</button>
              <button onClick={() => quickAsk(`"${topic}" konusunu sıfırdan anlat`)}
                style={quickBtnStyle}>📚 Konuyu anlat</button>
              <button onClick={() => quickAsk('Bana bu konudan 3 yeni soru sor')}
                style={quickBtnStyle}>⚡ Yeni sorular üret</button>
            </div>
          )}

          {/* Mesajlar */}
          <div style={{ height: '340px', overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg2)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                  fontSize: '13px', lineHeight: 1.6,
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center', padding: '6px 0' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)',
                    display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: '8px', padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
            {voice.enabled && (
              <button type="button" onClick={voice.listening ? voice.stop : voice.start} disabled={loading} aria-label={voice.listening ? 'Dinlemeyi durdur' : 'Konuşmaya başla'} title={voice.listening ? 'Dinleniyor — durdurmak için tıkla' : 'Bas ve konuş'} style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '10px', border: voice.listening ? '2px solid #ff8a80' : '1.5px solid rgba(0,149,200,0.3)', background: voice.listening ? '#fff0ef' : 'rgba(0,149,200,0.08)', color: voice.listening ? '#c62828' : 'var(--accent)', cursor: loading ? 'default' : 'pointer', fontSize: '17px', animation: voice.listening ? 'voicePulse 1.2s ease-in-out infinite' : 'none' }}>
                {voice.listening ? '■' : '🎙️'}
              </button>
            )}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Bir şey sor..."
              style={{
                flex: 1, padding: '10px 13px', borderRadius: '10px', border: '1.5px solid var(--border)',
                background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px',
                fontFamily: 'var(--font-sans)', outline: 'none',
              }}
            />
            <button
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              style={{
                padding: '10px 14px', borderRadius: '10px', background: 'var(--accent)',
                color: '#fff', border: 'none', cursor: 'pointer', fontSize: '16px',
                opacity: loading || !input.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </>
  )
}

const quickBtnStyle: React.CSSProperties = {
  fontSize: '12px', padding: '5px 10px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
  whiteSpace: 'nowrap', transition: 'all 0.15s',
}
