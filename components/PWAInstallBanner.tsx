'use client'
import { useEffect, useState } from 'react'

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // SW kayıt + otomatik güncelleme mekanizması
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        // Sayfa açıkken arka planda yeni SW var mı diye periyodik kontrol et
        // (Next.js deploy sonrası kullanıcı sekmeyi hiç kapatmasa bile yakalar)
        setInterval(() => {
          registration.update().catch(() => {})
        }, 60 * 1000) // her 60 saniyede bir

        // Yeni bir SW bulunup "waiting" durumuna geçtiğinde hemen aktive olmasını iste
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Yeni sürüm hazır ama henüz devrede değil — hemen devreye al
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      }).catch(() => {})

      // Yeni SW kontrolü ele alınca (controllerchange) sayfayı SESSİZCE yenile
      // — kullanıcı ne bir şey görür ne de eski/kırık bir sürümde takılı kalır.
      // ÖNEMLİ: controllerchange, SW'nin İLK KEZ bir sayfayı devralmasında da
      // tetiklenir (henüz "güncelleme" değil, sadece kurulum). Bu durumda
      // reload yapmak, o an devam eden bir sayfa geçişini (örn. /teacher'dan
      // /teacher/live'a tıklama) iptal edip kullanıcıyı olduğu sayfada
      // "yeniden yükler" — /teacher/live'ın hiç açılmayıp /teacher'a geri
      // dönmüş gibi görünmesinin sebebi buydu. Sadece daha önce zaten bir
      // controller varken (yani gerçek bir güncelleme sırasında) reload et.
      const hadControllerAtLoad = !!navigator.serviceWorker.controller
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadControllerAtLoad || refreshing) return
        refreshing = true
        window.location.reload()
      })
    }

    // Install prompt
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!localStorage.getItem('pwa-dismissed')) {
        setTimeout(() => setShow(true), 3000)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setShow(false)
      localStorage.setItem('pwa-dismissed', '1')
    })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then((r: any) => {
      if (r.outcome === 'accepted') localStorage.setItem('pwa-dismissed', '1')
      setDeferredPrompt(null)
      setShow(false)
    })
  }

  function dismiss() {
    setShow(false)
    localStorage.setItem('pwa-dismissed', '1')
  }

  if (!show) return null

  return (
    <div style={{ display: 'flex', position: 'fixed', bottom: '80px', left: '12px', right: '12px', zIndex: 9999, background: '#082465', borderRadius: '16px', padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', alignItems: 'center', gap: '12px', border: '1px solid rgba(30,207,184,0.3)' }}>
      <img src="/logo-192.png" alt="Pratium" style={{ width: 40, height: 40, borderRadius: '10px', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>Pratium&apos;u yükle</div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>Ana ekrana ekle, hızlı eriş</div>
      </div>
      <button onClick={install} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#1ECFB8', color: '#082465', fontWeight: 700, fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
        Yükle
      </button>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '20px', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>
        ×
      </button>
    </div>
  )
}
