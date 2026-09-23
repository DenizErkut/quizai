'use client'
// components/CoachMascot.tsx — Pratium Koç'un global maskot ikonu.
//
// 17 Eylül 2026 — Deniz'in isteği: "Koç ikonu tüm ekranlarda olsun ve ben
// buradayım desin, tepesinde bir baloncuk çıksın ve hadi şimdi birlikte
// çalışalım tarzı bir mesaj versin." Faz E/D'de bu ikon sadece
// app/dashboard/page.tsx'e gömülüydü (sadece ana sayfada görünüyordu) —
// bu bileşen onu app/layout.tsx'e taşıyarak GERÇEKTEN her sayfada
// (dashboard, /quiz, /analysis, her yerde) görünür hale getiriyor, ve
// AIChatBot'un (bkz. components/AIChatBot.tsx) "Merhaba, ben Prati!"
// balonuyla aynı kalıpta kendi davetkâr balonunu ekliyor.
//
// useUser() UserProvider içinde çağrılmalı — bu yüzden layout.tsx'te
// <UserProvider> içine, AIChatBot'un DIŞINDA monte ediliyor.
//
// 17 Eylül 2026 (2. güncelleme) — Deniz'in isteği üzerine: baloncuk başlığı
// "Koç'un Benim!" oldu, ikon eski robot/AI-blob maskotu (mascot-prati-*)
// yerine daha insani, sıcak bir "öğretmen" karakterine (public/mascot-coach-
// human.webp, lisanslı bir stok vektörden kırpıldı) geçti.
//
// 17 Eylül 2026 (3. güncelleme) — Deniz'in isteği: koç ikonu artık sağ altta,
// AIChatBot'un (Prati, 84x84, bottom:24/right:24) TAM ÜSTÜNDE, aynı sağ
// kenara hizalı dikey olarak istifleniyor — eskiden sol alttaydı.
//
// 17 Eylül 2026 (4. güncelleme) — Deniz'in ekran görüntüsüyle bildirdiği
// sorun: ikon, Prati'nin kendi "Merhaba, ben Prati!" balonunun ARKASINDA
// kalıp görünmez oluyordu (iki bileşen de zIndex 9998 kullanıyordu, DOM'da
// sonra gelen AIChatBot üstte kalıyordu) ve boyutu Prati'den (84x84) küçüktü
// (68x68). Düzeltme: koç ikonu artık Prati ile AYNI boyutta (84x84), zIndex
// AIChatBot'un HER ŞEYİNDEN yüksek (10000) ki asla arkada kalmasın, ve
// Prati'nin balonunun tahmini üst kenarının üstünde, iki balon arasındaki
// boşlukla aynı mertebede bir boşluk bırakılarak konumlandı (bottom:208px —
// Prati'nin balonu ~bottom:108-192 arası kaplıyor).
//
// 17 Eylül 2026 (5. güncelleme) — Deniz'in isteği: koç artık isimlendirildi.
// AIChatBot'un (genel satış/destek asistanı) "Prati" adı bu yüzden
// kaldırıldı (bkz. components/AIChatBot.tsx) — karışıklık olmasın diye.
//
// 17 Eylül 2026 (6. güncelleme) — İlk isimlendirme denemesi ("PROF. PRATİ" +
// büyük harfli mor "Powered by..." alt başlığı) Deniz'e göre "çok çirkin"
// durdu. Onun kendi önerdiği daha sıcak metne geçildi: "🎓 Profesör Prati /
// Seni tanıyan kişisel AI öğrenme koçun. / Sadece sorularını cevaplamaz —
// nasıl öğrendiğini anlar." Kurumsal "Powered by..." etiketi tamamen
// kaldırıldı.
//
// 17 Eylül 2026 (7. güncelleme) — Deniz'in kararı: Koç artık SADECE ücretli
// üyelere (silver/premium/unlimited) açık, free planda hiç yok. Asıl
// engelleme sunucuda (app/api/coach/chat/route.ts, lib/coach-access.ts)
// ama ikon da free kullanıcıya hiç görünmüyor — aksi halde tıklayıp 403
// almaları gereksiz bir sürtünme olurdu.
//
// 19 Eylül 2026 (8. güncelleme) — Deniz'in ekran görüntüsüyle bildirdiği
// sorun: mobilde sağ-alt köşeye sabitlenen baloncuk, kısa viewport'larda
// görsel olarak ekranın ORTASINA denk düşüp dashboard içeriğinin (ör.
// "Ondalık sayılar" kartı) üzerine biniyordu. Deniz'in isteği: "mobilde
// profesör pratiyi sağ üst köşeye, profil fotosunun hemen altına alalım."
// Navbar.tsx'teki mobil üst bar (position:fixed, top:0, height:58px) ve
// oradaki avatar (sağda) baz alınarak, mobilde (<=768px, Navbar ile aynı
// breakpoint) hem baloncuk hem ikon artık TOP-anchored: baloncuk üst barın
// hemen altında, ikon onun altında — masaüstünde eski bottom-right
// konumlanma aynen korunuyor.
//
// 19 Eylül 2026 (9. güncelleme) — Deniz'in isteği: "her iki maskotta
// kapatılabilir ve taşınabilir olsun... kullanıcı istediğinde maskotların
// yerini değiştirebilsin veya kapatsın geçici olarak." Ortak sürükle/gizle
// mantığı lib/useDraggableMascot.ts'e taşındı (AIChatBot.tsx ile paylaşımlı):
// ikon artık serbestçe sürüklenip bırakılabiliyor (konum localStorage'da
// kalıcı), sol üstündeki küçük × ile GEÇİCİ olarak gizlenebiliyor
// (sessionStorage — sekme kapanınca sıfırlanır, koç tekrar belirir).
// Konum bir kez değiştirildiyse ilk-tanıtım baloncuğu artık gösterilmiyor.
//
// 23 Eylül 2026 (10. güncelleme) — Deniz'in isteği: "prof.prati'yi aynı
// chatbot gibi açılan bir ekran yapsak daha şık olmaz mı?" Eskiden ikona
// tıklayınca tam sayfa /koc'a (app/koc/page.tsx) yönlendiriyordu — şimdi
// AIChatBot.tsx ile AYNI desende, ikonun tıklanmasıyla YERİNDE (inline)
// açılan bir sohbet paneli oluyor (aynı /api/coach/chat uç noktası, aynı
// mesaj/aksiyon mantığı app/koc/page.tsx'ten buraya taşındı). /koc sayfası
// olduğu gibi bırakıldı (mobil/derin bağlantı/yer imi için) — panelin
// başlığında "tam sayfada aç" linki var. Aynı oturumda düzeltilen AIChatBot
// hatasından ders: ref+dragHandlers (setPointerCapture) ile onClick AYNI
// elemanda olmalı — burada da tıklanabilir ana buton tek bir elemanda
// toplandı, sarmalayıcı sadece sürüklenen konumu taşıyor.
//
// 23 Eylül 2026 (11. güncelleme) — Deniz'in düzeltmesi: "vardı ses özelliği
// koç sayfasında, onu değiştirme, olduğu gibi inline'a taşı." app/koc/
// page.tsx'e 22 Eylül'de (commit 0ba9934, "Harden coach data, queue
// nudges, and add voice") zaten gerçek bir sesli özellik eklenmişti — bu
// bileşeni ilk yazarken sandbox'ımın o commit'i içermeyen eski bir
// koc/page.tsx kopyasından çalıştığımı fark etmedim ve YANLIŞLIKLA
// tarayıcı-içi SpeechSynthesis'e dayanan ayrı bir sesli-okuma denemesi
// uydurdum (o deneme geri alındı). Gerçek özellik ise per-mesaj "🔊 Koçu
// dinle" butonu + sunucu tarafı /api/coach/speech uç noktası (OpenAI
// gpt-4o-mini-tts, "cedar" sesi) — burada AYNI mantık, sadece bu panelin
// state isimlerine (chatError vb.) uyarlanmış haliyle var.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { createClient } from '@/lib/supabase/client'
import { isPaidCoachPlan } from '@/lib/coach-access'
import { useDraggableMascot } from '@/lib/useDraggableMascot'

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

export default function CoachMascot() {
  const router = useRouter()
  const { user, profile, loading, isTeacher, isParent, isInstitution } = useUser()
  const [unread, setUnread] = useState(0)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  const { pos, style: dragStyle, hidden, hide, show, fabRect, elRef, wasDragged, dragHandlers } =
    useDraggableMascot('coach_mascot', 84)

  // Panel state — app/koc/page.tsx'teki mantığın aynısı (bkz. 10. güncelleme).
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [chatLoaded, setChatLoaded] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [planBlocked, setPlanBlocked] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const supabase = createClient() as any

  useEffect(() => () => { audioRef.current?.pause() }, [])

  useEffect(() => {
    if (!user) { setUnread(0); return }
    let cancelled = false
    async function loadUnread() {
      const supabase = createClient() as any
      const { count } = await supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('type', 'coach_nudge').eq('read', false)
      if (!cancelled) setUnread(count || 0)
    }
    void loadUnread()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending, open])

  // Panel ilk açıldığında sohbet geçmişini çek (bir kez — chatLoaded ile
  // tekrar tekrar çekmeyi engelliyoruz, tıpkı app/koc/page.tsx gibi).
  useEffect(() => {
    if (!open || chatLoaded || !user) return
    let cancelled = false
    async function load() {
      setChatLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/coach/chat', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          if (data.code === 'plan_required') { setPlanBlocked(true); setChatLoading(false); setChatLoaded(true); return }
          setChatError(data.error || 'Koç yüklenemedi.'); setChatLoading(false); setChatLoaded(true); return
        }
        setMessages(data.messages || [])
        // Panel açıldığında proaktif bildirimleri okunmuş işaretle — rozet
        // (unread) burada sıfırlanmasa "koç seni görmedi" izlenimi kalıyordu.
        void supabase.from('notifications').update({ read: true })
          .eq('user_id', user.id).eq('type', 'coach_nudge').eq('read', false)
        setUnread(0)
      } catch {
        if (!cancelled) setChatError('Bağlantı hatası, lütfen tekrar dene.')
      }
      if (!cancelled) { setChatLoading(false); setChatLoaded(true) }
    }
    void load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user])

  async function startPractice(action: CoachAction, messageId?: string) {
    try {
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
    setChatError('')
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
      if (!res.ok) { setChatError(data.error || 'Koç yanıt veremedi.'); setSending(false); return }
      setMessages(m => [...m, data.message])
    } catch {
      setChatError('Bağlantı hatası, lütfen tekrar dene.')
    }
    setSending(false)
  }

  // app/koc/page.tsx'teki gerçek "Koçu dinle" özelliğinin birebir taşınmış
  // hali — sunucu tarafı /api/coach/speech (OpenAI gpt-4o-mini-tts, "cedar"
  // sesi) çağırıyor. Bkz. 11. güncelleme notu (dosya başı).
  async function speak(messageId?: string) {
    if (!messageId) return
    if (speakingId === messageId) { audioRef.current?.pause(); setSpeakingId(null); return }
    setChatError('')
    setSpeakingId(messageId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/coach/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messageId }),
      })
      if (!response.ok) throw new Error('speech_failed')
      const url = URL.createObjectURL(await response.blob())
      audioRef.current?.pause()
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); setSpeakingId(null) }
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeakingId(null); setChatError('Ses oynatılamadı.') }
      await audio.play()
    } catch {
      setSpeakingId(null)
      setChatError('Koçun sesi şu anda hazırlanamadı.')
    }
  }

  // 23 Eylül 2026 (12. güncelleme) — Deniz'in bildirdiği "panelin tepesi
  // navbar'ın altında kalıyor" hatası: height, neredeyse tüm pencere
  // yüksekliğini kapladığında (mobilde window.innerHeight-32), üst sınır
  // olan (window.innerHeight - height - 8) çok küçük bir sayıya (~24px)
  // düşüyordu — bu da Navbar'ın mobil üst barından (58px) daha az, yani
  // panel Navbar'ın ARKASINDA/ALTINDA başlıyordu. .coach-panel-mobile
  // CSS'i (max-width:768px) bunu normalde !important ile eziyor, ama bazı
  // uygulama-içi tarayıcılar (webview) o medya sorgusunu tetiklemeyen bir
  // viewport genişliği bildirebiliyor — o zaman devreye SADECE bu JS
  // hesaplaması giriyordu. Düzeltme: SAFE_TOP tabanını hem alt sınırda HEM
  // yükseklik hesabında kullanarak, hangi kod yolu çalışırsa çalışsın
  // panelin Navbar'ın her zaman altında (görsel olarak) başlamasını
  // garanti ediyoruz.
  function anchoredPanelStyle(): React.CSSProperties {
    if (!pos || !fabRect || typeof window === 'undefined') return {}
    const SAFE_TOP = 76 // Navbar'ın en kalın halinden (mobil ~58-68px) bile güvenli pay
    const BOTTOM_MARGIN = 16
    const width = Math.min(380, window.innerWidth - 32)
    const height = Math.min(580, window.innerHeight - SAFE_TOP - BOTTOM_MARGIN)
    let left = fabRect.left + fabRect.width - width
    let top = fabRect.top - height - 12
    if (top < SAFE_TOP) top = fabRect.top + fabRect.height + 12
    left = Math.min(Math.max(left, 8), window.innerWidth - width - 8)
    top = Math.min(Math.max(top, SAFE_TOP), window.innerHeight - height - 8)
    return { position: 'fixed', left, top, right: 'auto', bottom: 'auto', width, maxHeight: height }
  }

  // Koç sadece öğrenciler için — öğretmen/veli/kurum hesaplarında
  // gösterilmiyor (bu hesaplar zaten /koc'a erişemez, kendi verisi yok).
  // Ayrıca sadece ücretli plan (silver/premium/unlimited) — free'de hiç yok.
  if (loading || !user || isTeacher || isParent || isInstitution || !isPaidCoachPlan(profile?.plan)) return null

  return (
    <>
      {hidden ? (
        <button
          onClick={show}
          aria-label="Prof. Prati'yi tekrar göster"
          title="Koç'u göster"
          className="coach-launcher-restore"
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#fff', border: '2px solid rgba(168,85,247,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(41,72,61,0.22)', cursor: 'pointer', fontSize: '20px',
            ...dragStyle,
          }}
        >🎓</button>
      ) : (
        <>
          {!open && !bubbleDismissed && !pos && (
            <div
              onClick={() => { setOpen(true); setBubbleDismissed(true) }}
              className="coach-bubble"
              style={{
                maxWidth: '240px',
                background: '#fff',
                borderRadius: '18px 18px 18px 4px',
                padding: '12px 16px',
                boxShadow: '0 10px 32px rgba(41,72,61,0.2)',
                border: '1.5px solid rgba(168,85,247,0.25)',
                cursor: 'pointer',
                animation: 'coachBubbleUp 0.3s ease',
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
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#082465', marginBottom: '5px' }}>
                🎓 Profesör Prati
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.55 }}>
                Seni tanıyan kişisel AI öğrenme koçun.<br />
                Sadece sorularını cevaplamaz —<br />
                nasıl öğrendiğini anlar.
              </div>
              {/* balon kuyruğu */}
              <div style={{
                position: 'absolute', bottom: '-8px', right: '28px',
                width: 0, height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid #fff',
                filter: 'drop-shadow(0 2px 1px rgba(41,72,61,0.06))',
              }} />
            </div>
          )}

          {open && (
            <div style={{
              position: 'fixed', bottom: '292px', right: '24px', zIndex: 10000,
              width: '380px', maxWidth: 'calc(100vw - 32px)',
              background: '#fff', borderRadius: '20px',
              boxShadow: '0 20px 60px rgba(41,72,61,0.22)',
              border: '1px solid #e2e8f0',
              display: 'flex', flexDirection: 'column',
              maxHeight: '580px',
              animation: 'coachPanelUp 0.2s ease',
              ...anchoredPanelStyle(),
            }} className="coach-panel-mobile">
              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #6d28d9, #a855f7)',
                borderRadius: '20px 20px 0 0',
                padding: '14px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                    <img src="/mascot-coach-human.webp" alt="Profesör Prati" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Profesör Prati</div>
                    <Link href="/koc" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', textDecoration: 'underline' }}>
                      Tam sayfada aç ↗
                    </Link>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Sohbeti kapat" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px' }}>×</button>
              </div>

              {planBlocked ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎓</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#082465', marginBottom: '8px' }}>
                      Profesör Prati ücretli üyelere özel
                    </div>
                    <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.6, marginBottom: '16px' }}>
                      Seni tanıyan, verine dayanan kişisel bir öğrenme koçu istiyorsan bir plana geçmen gerekiyor.
                    </p>
                    <button className="btn btn-primary" onClick={() => { setOpen(false); router.push('/checkout') }}>
                      Planları görüntüle
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Mesajlar */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
                    {chatLoading ? (
                      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '2rem' }}><div className="spinner" /></div>
                    ) : (
                      <>
                        {messages.map((m, i) => (
                          <div key={m.id || i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            <div style={{
                              maxWidth: '82%', padding: '10px 13px',
                              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              background: m.role === 'user' ? 'linear-gradient(135deg, #6d28d9, #a855f7)' : '#f8fafc',
                              color: m.role === 'user' ? '#fff' : '#0F172A',
                              fontSize: '13px', lineHeight: 1.6,
                              border: m.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                              whiteSpace: 'pre-line',
                            }}>
                              {m.content}
                              {m.action?.type === 'start_practice' && (
                                <button
                                  onClick={() => startPractice(m.action as CoachAction, m.id)}
                                  className="btn btn-primary"
                                  style={{ marginTop: '10px', width: '100%', fontSize: '12.5px', padding: '8px 12px', background: 'linear-gradient(135deg, #6d28d9, #a855f7)' }}
                                >
                                  ▶ Çalışmayı başlat: {m.action.topic}
                                </button>
                              )}
                              {m.role === 'assistant' && m.id && (
                                <button
                                  onClick={() => speak(m.id)}
                                  className="btn btn-ghost"
                                  style={{ marginTop: '8px', padding: '5px 9px', fontSize: '12px' }}
                                >
                                  {speakingId === m.id ? '⏸ Sesi durdur' : '🔊 Koçu dinle'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {sending && (
                          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{ padding: '10px 14px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px', color: '#64748b' }}>
                              ⏳ yazıyor…
                            </div>
                          </div>
                        )}
                        <div ref={bottomRef} />
                      </>
                    )}
                  </div>

                  {chatError && (
                    <div style={{ padding: '0 14px 8px' }}>
                      <div style={{ padding: '8px 12px', borderRadius: '10px', background: '#fef2f2', color: '#dc2626', fontSize: '12px' }}>
                        {chatError}
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '0 14px', fontSize: '10.5px', color: '#94a3b8' }}>
                    🔊 Koç sesi yapay zekâ tarafından üretilir.
                  </div>

                  {/* Input */}
                  <form
                    onSubmit={e => { e.preventDefault(); send() }}
                    style={{ padding: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}
                  >
                    <input
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="Koça bir şey sor…"
                      disabled={chatLoading || sending}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: '20px',
                        border: '1.5px solid #e2e8f0', background: '#f8fafc',
                        fontSize: '13px', fontFamily: 'var(--font-sans)',
                        outline: 'none', color: '#0F172A',
                      }}
                      onFocus={e => (e.target.style.borderColor = '#a855f7')}
                      onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                    />
                    <button type="submit" disabled={chatLoading || sending || !input.trim()} style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: input.trim() ? 'linear-gradient(135deg, #6d28d9, #a855f7)' : '#e2e8f0',
                      border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', color: '#fff', flexShrink: 0,
                    }}>↑</button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* 23 Eylül 2026 — "geçici gizle" (×) butonu artık ana butonun
              İÇİNDE değil, sarmalayıcının bir KARDEŞİ (sibling). Görsel
              konumu aynı (× zaten position:absolute ile sarmalayıcıya göre
              konumlanıyordu), ama artık ana butonun (setPointerCapture alan
              eleman) DOM alt ağacında değil — böylece ana butonun sürükleme/
              tıklama mantığıyla hiç karışmıyor, kendi click'i her zaman
              güvenilir şekilde çalışıyor. */}
          <div className="coach-launcher-wrap" style={{ width: 84, height: 84, ...dragStyle }}>
            <button
              ref={elRef}
              {...dragHandlers}
              aria-label={open ? "Profesör Prati'yi kapat" : 'Prof. Prati ile sohbet et'}
              onClick={(e) => { if (wasDragged()) { e.preventDefault(); return } setOpen(v => !v); setBubbleDismissed(true) }}
              className="coach-launcher"
              style={{
                width: 84, height: 84, borderRadius: '22px',
                background: '#fff', border: '2px solid rgba(168,85,247,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 28px rgba(41,72,61,0.25)',
                touchAction: 'none', cursor: 'pointer',
              }}
            >
              <span className="coach-mascot-live" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: '6px' }}>
                <img src="/mascot-coach-human.webp" alt="Prof. Prati" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </span>
              {!open && unread > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, padding: '0 4px', borderRadius: '999px', background: '#a855f7', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                  {unread}
                </span>
              )}
            </button>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); hide(); setBubbleDismissed(true) }}
              aria-label="Koç'u geçici olarak gizle"
              title="Geçici olarak gizle"
              style={{
                position: 'absolute', top: '-6px', left: '-6px',
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff', border: '1.5px solid #e2e8f0',
                color: '#64748b', fontSize: '12px', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.12)', zIndex: 1,
              }}
            >×</button>
          </div>
        </>
      )}

      <style>{`
        @keyframes coachBubbleUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes coachPanelUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Masaüstü (ve mobil olmayan geniş ekranlar): eski sağ-alt yerleşim
           aynen korunuyor — baloncuk ikonun üstünde dikey istifleniyor. */
        .coach-bubble {
          position: fixed; bottom: 292px; right: 24px; z-index: 10000;
        }
        .coach-launcher-wrap, .coach-launcher-restore {
          position: fixed; bottom: 208px; right: 24px; z-index: 10000;
        }
        /* 19 Eylül 2026 — Deniz'in isteği: mobilde sağ-üst köşeye, Navbar'ın
           mobil üst barındaki (top:0, height:58px) profil fotosunun hemen
           altına. Navbar.tsx ile aynı breakpoint (max-width:768px). */
        @media (max-width: 768px) {
          .coach-bubble {
            top: 68px; bottom: auto; right: 12px;
          }
          .coach-launcher-wrap, .coach-launcher-restore {
            top: 156px; bottom: auto; right: 12px;
          }
          /* 23 Eylül 2026 — panel mobilde ikonun altına sığmayabilir; ekranı
             kaplayan bir alt-sayfa gibi davransın (AIChatBot'un mobil
             davranışıyla tutarlı bir basitleştirme). */
          .coach-panel-mobile {
            top: 68px !important; bottom: 12px !important; left: 12px !important;
            right: 12px !important; width: auto !important; max-width: none !important;
            max-height: none !important; height: auto !important;
          }
        }
        /* Deniz'in isteği: ikon "canlı" dursun (hafif sürekli hareket) ve
           üzerine gelince büyüsün. AIChatBot'taki prati-launcher/pratiFloat
           kalıbıyla aynı yaklaşım — bkz. components/AIChatBot.tsx. */
        .coach-launcher {
          transition: transform 0.22s ease, box-shadow 0.22s ease;
        }
        .coach-launcher:hover, .coach-launcher:focus-visible {
          transform: scale(1.12);
          box-shadow: 0 12px 36px rgba(41,72,61,0.35);
        }
        .coach-mascot-live {
          animation: coachFloat 3.4s ease-in-out infinite;
          transform-origin: 50% 88%;
        }
        .coach-launcher:hover .coach-mascot-live {
          animation: coachWave 0.7s ease-in-out;
        }
        @keyframes coachFloat {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-4px) rotate(1deg); }
        }
        @keyframes coachWave {
          0%, 100% { transform: translateY(0) rotate(0) scale(1); }
          30% { transform: translateY(-5px) rotate(-6deg) scale(1.05); }
          60% { transform: translateY(-2px) rotate(6deg) scale(1.03); }
        }
        @media (prefers-reduced-motion: reduce) {
          .coach-mascot-live, .coach-launcher:hover .coach-mascot-live { animation: none; }
        }
      `}</style>
    </>
  )
}
