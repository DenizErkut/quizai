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
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/user-context'
import { createClient } from '@/lib/supabase/client'
import { isPaidCoachPlan } from '@/lib/coach-access'
import { useDraggableMascot } from '@/lib/useDraggableMascot'

export default function CoachMascot() {
  const { user, profile, loading, isTeacher, isParent, isInstitution } = useUser()
  const [unread, setUnread] = useState(0)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)
  const { pos, style: dragStyle, hidden, hide, show, elRef, wasDragged, dragHandlers } =
    useDraggableMascot('coach_mascot', 84)

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
          {!bubbleDismissed && !pos && (
            <div
              onClick={() => setBubbleDismissed(true)}
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
              <Link href="/koc" style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#082465', marginBottom: '5px' }}>
                  🎓 Profesör Prati
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.55 }}>
                  Seni tanıyan kişisel AI öğrenme koçun.<br />
                  Sadece sorularını cevaplamaz —<br />
                  nasıl öğrendiğini anlar.
                </div>
              </Link>
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

          <Link href="/koc" aria-label="Prof. Prati ile sohbet et"
            ref={elRef}
            onClick={(e) => { if (wasDragged()) { e.preventDefault(); return } setBubbleDismissed(true) }}
            onPointerDown={dragHandlers.onPointerDown}
            onPointerMove={dragHandlers.onPointerMove}
            onPointerUp={dragHandlers.onPointerUp}
            className="coach-launcher"
            style={{
              width: 84, height: 84, borderRadius: '22px',
              background: '#fff', border: '2px solid rgba(168,85,247,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 28px rgba(41,72,61,0.25)', textDecoration: 'none',
              touchAction: 'none',
              ...dragStyle,
            }}>
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
            <span className="coach-mascot-live" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: '6px' }}>
              <img src="/mascot-coach-human.webp" alt="Prof. Prati" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </span>
            {unread > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, padding: '0 4px', borderRadius: '999px', background: '#a855f7', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                {unread}
              </span>
            )}
          </Link>
        </>
      )}

      <style>{`
        @keyframes coachBubbleUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* Masaüstü (ve mobil olmayan geniş ekranlar): eski sağ-alt yerleşim
           aynen korunuyor — baloncuk ikonun üstünde dikey istifleniyor. */
        .coach-bubble {
          position: fixed; bottom: 292px; right: 24px; z-index: 10000;
        }
        .coach-launcher, .coach-launcher-restore {
          position: fixed; bottom: 208px; right: 24px; z-index: 10000;
        }
        /* 19 Eylül 2026 — Deniz'in isteği: mobilde sağ-üst köşeye, Navbar'ın
           mobil üst barındaki (top:0, height:58px) profil fotosunun hemen
           altına. Navbar.tsx ile aynı breakpoint (max-width:768px). */
        @media (max-width: 768px) {
          .coach-bubble {
            top: 68px; bottom: auto; right: 12px;
          }
          .coach-launcher, .coach-launcher-restore {
            top: 156px; bottom: auto; right: 12px;
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
