'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `Sen Pratium'un yapay zeka destekli eğitim asistanısın. Adın "Pratium Asistan".

Pratium, yapay zeka destekli bir Türk eğitim platformudur. Öğrenciler, öğretmenler ve veliler için tasarlanmıştır.

GÖREV TANIMI:
Kullanıcıların öğrenme hedeflerine ulaşmalarına yardımcı olmak için Pratium'un özelliklerini yumuşak, samimi ve motive edici bir dille tanıtırsın.

TEMEL YETENEKLERİN:
- Kullanıcının öğrenme hedefini anlamak ve Pratium'un hangi özelliğiyle bunu karşılayabileceğini anlatmak
- Premium özellikleri doğal ve baskı yapmadan, değer odaklı önerilerle tanıtmak
- Platform kullanımı, hesap, abonelik, öğretmen paneli, veli paneli sorularını yanıtlamak
- Kullanıcıyı motive etmek ve doğru adımları atmaya yönlendirmek

YANIT TARZI:
- Sıcak, samimi, teşvik edici — asla soğuk veya robotik değil
- Kullanıcının durumunu önce anla, sonra öner
- Premium önermelerini "sizi şuna yönlendirmeliyim" değil "bu hedef için harika bir seçim olur" şeklinde yap
- Her yanıtta 1 somut adım öner (örn: "Şimdi Yeni Test'e tıklayabilirsin")
- Maksimum 3-4 cümle, kısa ve net

PREMIUM ÖNERİ KURALLARI:
- Kullanıcı bir konuyu öğrenmek veya soru çözmek istiyorsa → Pratium'un quiz özelliğini anlat, ardından şunu ekle:
  "Bu konuda derinlemesine çalışmak istiyorsan Premium üyelik çok işine yarayacak — sınırsız test, dosyadan/görselden soru üretme ve kişisel analiz sunuyor."
- Kullanıcı ücretsiz planda sınıra takılıyorsa → empatiyle karşıla, Premium'un sunduklarını somut örneklerle anlat
- Asla "Premium almak zorundasın" veya "ücretsiz plan yetersiz" deme — her zaman değer odaklı konuş
- Sınav hazırlığı (LGS/YKS/KPSS) sorularında → Pratium'un sınav simülasyonu özelliğini öner

PLATFORM BİLGİSİ:
- Freemium: Ayda 10 test, 5 soru/test, temel özellikler
- Premium (₺1.200/yıl): Sınırsız test, 20 soru/test, tüm soru tipleri, PDF/Word/görsel yükleme, sınıf sistemi, kişisel analiz
- Unlimited (₺6.000/yıl): Sınırsız test, koç görüşmesi, gelişmiş analiz raporları, tüm özellikler
- Özellikler: 8 soru tipi, 6 dil, 4 haftalık gelişim planı, spaced repetition, sınav simülasyonu (LGS/TYT/AYT/KPSS), canlı quiz, challenge, konu özeti
- Öğretmen: sınıf oluşturma, ödev atama, canlı quiz, öğrenci performans takibi
- Veli: çocuk takibi, haftalık özet e-postası

TEST OLUŞTURMA AKIŞI (tam ve doğru anlat, eksik bırakma):
Ana sayfada "Anlık Test" kartına tıklayınca /quiz sayfası açılır. Orada konu seçmenin ÜÇ yolu vardır — hepsini anlat, sadece birini değil:
1. HAZIR KONU LİSTESİ: Dersler (Matematik, Türkçe, Fen Bilimleri vb.) bir liste halinde görünür, her dersin üzerine tıklayınca MEB müfredatına uygun alt konu/başlıklar açılır (akordeon) — kullanıcı sınıfına göre hazır bir konu seçebilir, hiçbir şey yazmasına gerek yok
2. SERBEST KONU YAZMA: İstersen hazır listeden seçmek yerine kendi konunu da serbest metin olarak yazabilirsin (örn. "Osmanlı Devleti'nin Kuruluşu")
3. DOSYA/PDF YÜKLEME: Ders notu, PDF veya döküman yükleyip o içerikten soru ürettirebilirsin (Premium)
Ayrıca sık kullanılan konuları ⭐ favori olarak işaretleyip hızlıca erişebilirsin. Konu seçildikten sonra soru sayısı, zorluk ve dil ayarlanıp test başlatılır.

SINIRLAR:
- Sınav sorularını çözme, matematik hesaplama veya akademik içerik üretme
- Bu tür isteklerde: "Bu konuyu Pratium'da test olarak çözersen çok daha etkili öğrenirsin! Şimdi Yeni Test'e tıklayıp [konu] yazarsan sana özel sorular hazırlarım. 🎯"

Kullanıcı Türkçe yazarsa Türkçe, İngilizce yazarsa İngilizce yanıt ver.`

// Landing page için auth gerektirmeyen basit versiyon
const GUEST_SYSTEM_PROMPT = `Sen Pratium'un yapay zeka destekli tanıtım asistanısın. Adın "Pratium Asistan".

Pratium, yapay zeka destekli bir Türk eğitim platformudur.

GÖREV: Ziyaretçilerin Pratium'u anlamasına ve kayıt olmaya karar vermesine yardımcı ol.

YANIT TARZI:
- Sıcak, merak uyandırıcı ve motive edici
- Her yanıtta Pratium'un ilgili özelliğini anlat
- Sonunda yumuşak bir kayıt çağrısı yap: "Ücretsiz hesap açarak hemen deneyebilirsin 🚀"
- Kısa tut: 2-3 cümle + 1 çağrı

PLATFORM BİLGİSİ:
- Ücretsiz: Ayda 10 test, 5 soru/test
- Premium (₺1.200/yıl): Sınırsız test, 20 soru, PDF/görsel yükleme, analiz, sınıf sistemi
- Özellikler: LGS/YKS/KPSS sınav simülasyonu, 8 soru tipi, 6 dil, 4 haftalık plan, öğretmen paneli, veli takibi
- Test oluşturma: hazır ders/konu listesinden seçebilir, kendi konunu yazabilir YA DA PDF/döküman yükleyebilirsin — üçü de mevcut, sadece yazmak zorunda değilsin

SINIR: Akademik soru çözme — "Bunu Pratium'da test olarak çözersen çok daha etkili! Ücretsiz kaydol ve dene 🎯"

Türkçe yaz.`

interface Props {
  isGuest?: boolean
}

export default function AIChatBot({ isGuest = false }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: isGuest
      ? 'Merhaba! 👋 Pratium hakkında merak ettiklerini sorabilirsin. Sana nasıl yardımcı olabilirim?'
      : 'Merhaba! 👋 Öğrenme hedeflerin veya platform kullanımı hakkında sana yardımcı olmak için buradayım.'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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
      const supabase = createClient() as any
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const systemPrompt = isGuest ? GUEST_SYSTEM_PROMPT : SYSTEM_PROMPT

      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          system: systemPrompt,
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

  const quickQuestions = isGuest ? [
    '5. sınıf Türkçe soruları çözebilir miyim?',
    'LGS\'ye nasıl hazırlanabilirim?',
    'Ücretsiz ne kadar kullanabilirim?',
    'Öğretmen olarak nasıl kullanırım?',
  ] : [
    'Test nasıl oluşturabilirim?',
    'Sınav simülasyonu nedir?',
    'Premium\'a nasıl geçebilirim?',
    'Gelişim planı nedir?',
  ]

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: '108px', right: '24px', zIndex: 9998,
          width: '370px', maxWidth: 'calc(100vw - 32px)',
          background: '#fff', borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(8,36,101,0.18)',
          border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column',
          maxHeight: '560px',
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
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                <img src="/mascot-prati-face.svg" alt="Prati" style={{ width: '100%', height: '100%' }} />
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Pratium Asistan</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px' }}>Size yardımcı olmak için buradayım ✨</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px' }}>×</button>
          </div>

          {/* Üst bilgi bandı */}
          <div style={{ background: 'rgba(30,207,184,0.06)', borderBottom: '1px solid rgba(30,207,184,0.15)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '13px' }}>💡</span>
            <span style={{ fontSize: '11px', color: '#0a9e90', fontWeight: 500, lineHeight: 1.4 }}>
              {isGuest
                ? 'Öğrenme hedefin için en doğru yolu birlikte bulalım!'
                : 'Öğrenme hedefin, platform kullanımı veya plan soruların için buradayım.'}
            </span>
          </div>

          {/* Mesajlar */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '8px', alignSelf: 'flex-end', padding: '3px' }}>
                    <img src="/mascot-prati-face.svg" alt="Prati" style={{ width: '100%', height: '100%' }} />
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
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px' }}>
                  <img src="/mascot-prati-face.svg" alt="Prati" style={{ width: '100%', height: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1ECFB8', display: 'inline-block', animation: `botBounce 1.2s ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Hızlı sorular */}
          {messages.length <= 1 && (
            <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {quickQuestions.map(q => (
                <button key={q} onClick={async () => {
                  setInput('')
                  setMessages(prev => [...prev, { role: 'user', content: q }])
                  setLoading(true)
                  try {
                    const supabase = createClient() as any
                    const { data: { session } } = await supabase.auth.getSession()
                    const tok = session?.access_token
                    const systemPrompt = isGuest ? GUEST_SYSTEM_PROMPT : SYSTEM_PROMPT
                    const res = await fetch('/api/bot', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
                      body: JSON.stringify({ messages: [...messages, { role: 'user', content: q }], system: systemPrompt }),
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
              placeholder={isGuest ? 'Platforma dair bir şey sor...' : 'Hedefini veya sorunuzu yaz...'}
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
                🚀 Ücretsiz hesap aç ve hemen başla →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Konuşma balonu — sohbet kapalıyken ve kapatılmadıysa görünür */}
      {!open && !bubbleDismissed && (
        <div
          onClick={() => { setOpen(true); setUnread(0) }}
          style={{
            position: 'fixed', bottom: '108px', right: '24px', zIndex: 9998,
            maxWidth: '230px',
            background: '#fff',
            borderRadius: '18px 18px 4px 18px',
            padding: '12px 16px',
            boxShadow: '0 10px 32px rgba(8,36,101,0.18)',
            border: '1.5px solid rgba(30,207,184,0.25)',
            cursor: 'pointer',
            animation: 'botSlideUp 0.3s ease',
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); setBubbleDismissed(true) }}
            aria-label="Kapat"
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
            Merhaba, ben Prati! 👋
          </div>
          <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
            AI asistanınızım — size yardımcı olmak için buradayım.
          </div>
          {/* balon kuyruğu */}
          <div style={{
            position: 'absolute', bottom: '-8px', right: '28px',
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid #fff',
            filter: 'drop-shadow(0 2px 1px rgba(8,36,101,0.06))',
          }} />
        </div>
      )}

      {/* FAB */}
      <button
        className={`prati-launcher${open ? ' is-open' : ''}`}
        onClick={() => { setOpen(v => !v); setUnread(0); setBubbleDismissed(true) }}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: 80, height: 80, borderRadius: '50%',
          background: open ? 'linear-gradient(135deg, #082465, #1ECFB8)' : '#ffffff',
          border: open ? 'none' : '2px solid rgba(30,207,184,0.25)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(8,36,101,0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          padding: open ? 0 : '8px',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(8,36,101,0.4)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 32px rgba(8,36,101,0.3)' }}
        aria-label={open ? 'Sohbeti kapat' : 'Prati ile sohbet et'}
      >
        {open
          ? <span style={{ fontSize: '28px', color: '#fff' }}>×</span>
          : <span className="prati-mascot-live"><img src="/mascot-prati-cute.svg" alt="Prati" /></span>
        }
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
        @keyframes botFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(-3deg); }
        }
        .prati-launcher:not(.is-open)::before,
        .prati-launcher:not(.is-open)::after {
          content: ''; position: absolute; inset: -7px; border: 2px solid rgba(30,207,184,.34);
          border-radius: 50%; pointer-events: none; animation: pratiPulse 2.8s ease-out infinite;
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
