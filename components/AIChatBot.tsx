'use client'
import LearningMessage from '@/components/LearningMessage'
// 19 Eylül 2026 — Deniz'in isteği: "her iki maskotta kapatılabilir ve
// taşınabilir olsun... kullanıcı istediğinde maskotların yerini
// değiştirebilsin veya kapatsın geçici olarak." Ortak sürükle/gizle mantığı
// lib/useDraggableMascot.ts'te (components/CoachMascot.tsx ile paylaşımlı):
// FAB ikonu artık serbestçe sürüklenip bırakılabiliyor (konum localStorage'da
// kalıcı), sol üstündeki küçük × ile GEÇİCİ olarak gizlenebiliyor
// (sessionStorage — sekme kapanınca sıfırlanır, asistan tekrar belirir).
// Konum bir kez değiştirildiyse ilk-tanıtım baloncuğu artık gösterilmiyor,
// ve sohbet paneli açıldığında ikonun GÜNCEL konumuna göre konumlanıyor
// (bkz. anchoredPanelStyle).
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDraggableMascot } from '@/lib/useDraggableMascot'
import { useT } from '@/lib/i18n/I18nProvider'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  isGuest?: boolean
}

export default function AIChatBot({ isGuest = false }: Props) {
  const { t: tr, locale } = useT()
  const [open, setOpen] = useState(false)
  // The greeting is rendered separately (translated at render time) so it follows the UI language.
  const [messages, setMessages] = useState<Message[]>([])
  const greeting = isGuest
    ? tr('Merhaba! 👋 Pratium hakkında merak ettiklerini sorabilirsin. Sana nasıl yardımcı olabilirim?')
    : tr('Merhaba! 👋 Öğrenme hedeflerin veya platform kullanımı hakkında sana yardımcı olmak için buradayım.')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { pos, style: dragStyle, hidden, hide, show, fabRect, elRef, wasDragged, dragHandlers } =
    useDraggableMascot('prati_mascot', 84)

  // 23 Eylül 2026 (12. güncelleme) — CoachMascot.tsx'teki "panel Navbar'ın
  // altında kalıyor" düzeltmesiyle aynı kök neden burada da vardı (bkz. o
  // dosyadaki ayrıntılı açıklama): height pencereye yakın olduğunda üst
  // sınır ~24px'e düşüyor, bu da Navbar'dan (mobil ~58-68px) daha az.
  // Burada CoachMascot'un aksine mobile-özel bir CSS override'ı da yok,
  // yani bu JS hesaplaması TEK güvence — SAFE_TOP tabanı bu yüzden burada
  // daha da kritik.
  function anchoredPanelStyle(): React.CSSProperties {
    if (!pos || !fabRect || typeof window === 'undefined') return {}
    const SAFE_TOP = 76
    const BOTTOM_MARGIN = 16
    const width = Math.min(370, window.innerWidth - 32)
    const height = Math.min(560, window.innerHeight - SAFE_TOP - BOTTOM_MARGIN)
    let left = fabRect.left + fabRect.width - width
    let top = fabRect.top - height - 12
    if (top < SAFE_TOP) top = fabRect.top + fabRect.height + 12
    left = Math.min(Math.max(left, 8), window.innerWidth - width - 8)
    top = Math.min(Math.max(top, SAFE_TOP), window.innerHeight - height - 8)
    return { position: 'fixed', left, top, right: 'auto', bottom: 'auto', width, maxHeight: height }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          locale,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      if (!open) setUnread(prev => prev + 1)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: tr('Bağlantı hatası, lütfen tekrar dene.') }])
    } finally {
      setLoading(false)
    }
  }

  const quickQuestions = isGuest ? [
    tr('5. sınıf Türkçe soruları çözebilir miyim?'),
    tr("LGS'ye nasıl hazırlanabilirim?"),
    tr('Ücretsiz ne kadar kullanabilirim?'),
    tr('Öğretmen olarak nasıl kullanırım?'),
  ] : [
    tr('Test nasıl oluşturabilirim?'),
    tr('Sınav simülasyonu nedir?'),
    tr("Altın'a nasıl geçebilirim?"),
    tr('Gelişim planı nedir?'),
  ]

  return (
    <>
      {hidden && (
        <button
          onClick={show}
          aria-label={tr('Pratium Asistanını tekrar göster')}
          title={tr('Asistanı göster')}
          className="prati-launcher-restore"
          style={{
            width: 44, height: 44, borderRadius: '50%', padding: 0, overflow: 'hidden',
            background: '#fff', border: '2px solid rgba(30,207,184,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(8,36,101,0.2)', cursor: 'pointer',
            ...dragStyle,
          }}
        >
          <img src="/mascot-prati-face-v2.webp" alt="Pratium Asistan" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
        </button>
      )}

      {!hidden && open && (
        <div style={{
          position: 'fixed', bottom: '108px', left: '24px', zIndex: 9998,
          width: '370px', maxWidth: 'calc(100vw - 32px)',
          background: '#fff', borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(8,36,101,0.18)',
          border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column',
          maxHeight: '560px',
          animation: 'botSlideUp 0.2s ease',
          ...anchoredPanelStyle(),
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #082465, #1ECFB8)',
            borderRadius: '20px 20px 0 0',
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                <img src="/mascot-prati-face-v2.webp" alt="Pratium Asistan" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>{tr('Pratium Asistan')}</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px' }}>{tr('Size yardımcı olmak için buradayım ✨')}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px' }}>×</button>
          </div>

          {/* Üst bilgi bandı */}
          <div style={{ background: 'rgba(30,207,184,0.06)', borderBottom: '1px solid rgba(30,207,184,0.15)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '13px' }}>💡</span>
            <span style={{ fontSize: '11px', color: '#0a9e90', fontWeight: 500, lineHeight: 1.4 }}>
              {isGuest
                ? tr('Öğrenme hedefin için en doğru yolu birlikte bulalım!')
                : tr('Öğrenme hedefin, platform kullanımı veya plan soruların için buradayım.')}
            </span>
          </div>

          {/* Mesajlar */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '8px', alignSelf: 'flex-end', padding: '3px' }}>
                <img src="/mascot-prati-face-v2.webp" alt="Pratium Asistan" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ maxWidth: '78%', padding: '10px 13px', borderRadius: '14px 14px 14px 4px', background: '#f8fafc', color: '#0F172A', fontSize: '13px', lineHeight: 1.6, border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                <LearningMessage text={greeting} />
              </div>
            </div>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '8px', alignSelf: 'flex-end', padding: '3px' }}>
                    <img src="/mascot-prati-face-v2.webp" alt="Pratium Asistan" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{
                  maxWidth: '78%', padding: '10px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'linear-gradient(135deg, #082465, #1ECFB8)' : '#f8fafc',
                  color: m.role === 'user' ? '#fff' : '#0F172A',
                  fontSize: '13px', lineHeight: 1.6,
                  border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.role === 'assistant' ? <LearningMessage text={m.content} /> : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px' }}>
                  <img src="/mascot-prati-face-v2.webp" alt="Pratium Asistan" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1ECFB8', display: 'inline-block', animation: `botBounce 1.2s ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Hızlı sorular */}
          {messages.length === 0 && (
            <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickQuestions.map(q => (
                <button key={q} onClick={async () => {
                  setInput('')
                  setMessages(prev => [...prev, { role: 'user', content: q }])
                  setLoading(true)
                  try {
                    const supabase = createClient()
                    const { data: { session } } = await supabase.auth.getSession()
                    const tok = session?.access_token
                    const res = await fetch('/api/bot', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
                      body: JSON.stringify({ messages: [...messages, { role: 'user', content: q }], locale }),
                    })
                    const d = await res.json()
                    setMessages(prev => [...prev, { role: 'assistant', content: d.reply }])
                    setLoading(false)
                  } catch { setLoading(false) }
                }}
                  style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#082465', cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#082465'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#082465' }}
                >
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
              placeholder={isGuest ? tr('Platforma dair bir şey sor...') : tr('Hedefini veya sorunuzu yaz...')}
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
              fontSize: '16px', color: '#fff', flexShrink: 0, transition: 'all 0.15s',
            }}>↑</button>
          </div>

          {/* Guest kayıt CTA */}
          {isGuest && (
            <div style={{ padding: '10px 14px', background: 'rgba(253,211,29,0.08)', borderTop: '1px solid rgba(253,211,29,0.2)', borderRadius: '0 0 20px 20px', textAlign: 'center' }}>
              <a href="/register" style={{ fontSize: '12px', fontWeight: 700, color: '#082465', textDecoration: 'none' }}>
                {tr('🚀 Ücretsiz hesap aç ve hemen başla →')}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Konuşma balonu — sohbet kapalıyken, kapatılmadıysa ve ikon hiç
          sürüklenmediyse görünür (bir kez taşındıysa artık kullanıcı zaten
          maskotu tanıyor demektir, tanıtım balonu tekrar gösterilmiyor) */}
      {!hidden && !open && !bubbleDismissed && !pos && (
        <div
          onClick={() => { setOpen(true); setUnread(0) }}
          style={{
            position: 'fixed', bottom: '108px', left: '24px', zIndex: 9998,
            maxWidth: '230px',
            background: '#fff',
            borderRadius: '18px 18px 18px 4px',
            padding: '12px 16px',
            boxShadow: '0 10px 32px rgba(8,36,101,0.18)',
            border: '1.5px solid rgba(30,207,184,0.25)',
            cursor: 'pointer',
            animation: 'botSlideUp 0.3s ease',
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); setBubbleDismissed(true) }}
            aria-label={tr('Kapat')}
            style={{
              position: 'absolute', top: '-8px', right: '-8px',
              width: 22, height: 22, borderRadius: '50%',
              background: '#fff', border: '1.5px solid #e2e8f0',
              color: '#64748b', fontSize: '13px', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >×</button>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#082465', marginBottom: '2px' }}>
            {tr('Merhaba! 👋')}
          </div>
          <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
            {tr('Pratium Asistanıyım — size yardımcı olmak için buradayım.')}
          </div>
          {/* balon kuyruğu */}
          <div style={{
            position: 'absolute', bottom: '-8px', left: '28px',
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid #fff',
            filter: 'drop-shadow(0 2px 1px rgba(8,36,101,0.06))',
          }} />
        </div>
      )}

      {/* FAB — konumu taşıyan sarmalayıcı sürüklenebilir (bkz.
          lib/useDraggableMascot.ts).
          23 Eylül 2026 — Deniz'in bildirdiği hata: "chatbot'a tıkladığımda
          açılmıyor". Kök neden: ref+dragHandlers (setPointerCapture) SARMALAYICI
          <div>'de, ama onClick İÇERİDEKİ <button>'daydı. Chromium'da bir
          elemanda setPointerCapture çağrılınca, o parmak/imleç için üretilen
          "click" olayı da capture'ı alan elemana yönlendiriliyor — yani click
          hiçbir zaman iç <button>'a ulaşmıyor, onClick asla tetiklenmiyordu
          (playwright ile doğrulandı: capture sarmalayıcıdaysa iç butonun click
          handler'ı hiç çalışmıyor, capture+onClick AYNI elemandaysa çalışıyor).
          Düzeltme: ref+dragHandlers artık butonun KENDİSİNDE, sarmalayıcı sadece
          konumu taşıyor. Bu ayrıca "geçici gizle" (×) butonunu da örtük olarak
          düzeltiyor — o da sarmalayıcının pointerdown'ına takılıyordu. */}
      {!hidden && (
        <div
          className="prati-launcher-wrap"
          style={{ width: 84, height: 84, ...dragStyle }}
        >
          <button
            ref={elRef}
            {...dragHandlers}
            className={`prati-launcher${open ? ' is-open' : ''}`}
            onClick={(e) => { if (wasDragged()) { e.preventDefault(); return } setOpen(v => !v); setUnread(0); setBubbleDismissed(true) }}
            style={{
              width: 84, height: 84, borderRadius: '22px',
              background: open ? 'linear-gradient(135deg, #082465, #1ECFB8)' : '#ffffff',
              border: open ? 'none' : '2px solid rgba(30,207,184,0.25)',
              cursor: 'pointer',
              touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(8,36,101,0.3)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              padding: open ? 0 : '8px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(8,36,101,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(8,36,101,0.3)' }}
            aria-label={open ? tr('Sohbeti kapat') : tr('Pratium Asistanı ile sohbet et')}
          >
            {open
              ? <span style={{ fontSize: '28px', color: '#fff' }}>×</span>
              : <span className="prati-mascot-live"><img src="/mascot-prati-face-v2.webp" alt="Pratium Asistan" /></span>
            }
            {!open && unread > 0 && (
              <span style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: '#FDD31D', color: '#082465', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                {unread}
              </span>
            )}
          </button>
          {!open && (
            <button
              onClick={(e) => { e.stopPropagation(); hide(); setBubbleDismissed(true) }}
              aria-label={tr('Pratium Asistanını geçici olarak gizle')}
              title={tr('Geçici olarak gizle')}
              style={{
                position: 'absolute', top: '-6px', left: '-6px',
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff', border: '1.5px solid #e2e8f0',
                color: '#64748b', fontSize: '12px', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', zIndex: 1,
              }}
            >×</button>
          )}
        </div>
      )}

      <style>{`
        @keyframes botSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes botBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes botFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(-3deg); }
        }
        /* 19 Eylül 2026 — konum artık sarmalayıcıda (drag ile taşınabilir),
           .prati-launcher butonun kendisi konumsuz, sarmalayıcıyı dolduruyor. */
        /* 23 Eylül 2026 (13. güncelleme) — Deniz'in isteği: Pratium Asistan
           ve Profesör Prati ikonları aynı köşede üst üste biniyordu (bkz.
           ekran görüntüsü). Asistan artık sol-altta, Koç sağ-altta (bkz.
           CoachMascot.tsx — orası değişmedi). */
        .prati-launcher-wrap, .prati-launcher-restore {
          position: fixed; bottom: 24px; left: 24px; z-index: 9999;
        }
        .prati-launcher:not(.is-open)::before,
        .prati-launcher:not(.is-open)::after {
          content: ''; position: absolute; inset: -7px; border: 2px solid rgba(30,207,184,.34);
          border-radius: 28px; pointer-events: none; animation: pratiPulse 2.8s ease-out infinite;
        }
        .prati-launcher:not(.is-open)::after { animation-delay: 1.4s; }
        .prati-mascot-live { width: 100%; height: 100%; display: grid; place-items: center; animation: pratiFloat 3.2s ease-in-out infinite; transform-origin: 50% 88%; }
        .prati-mascot-live img { width: 100%; height: 100%; object-fit: contain; }
        .prati-launcher:hover .prati-mascot-live { animation: pratiHello .72s ease-in-out; }
        @keyframes pratiFloat { 0%,100%{transform:translateY(1px) rotate(-1deg)} 45%{transform:translateY(-7px) rotate(2deg)} 55%{transform:translateY(-7px) rotate(1deg)} }
        @keyframes pratiHello { 0%,100%{transform:translateY(0) rotate(0) scale(1)} 30%{transform:translateY(-7px) rotate(-7deg) scale(1.06)} 60%{transform:translateY(-4px) rotate(7deg) scale(1.04)} }
        @keyframes pratiPulse { 0%{opacity:.72;transform:scale(.88)} 75%,100%{opacity:0;transform:scale(1.18)} }
        @media (prefers-reduced-motion: reduce) { .prati-mascot-live,.prati-launcher::before,.prati-launcher::after{animation:none!important} }
      `}</style>
    </>
  )
}
