'use client'
import { useEffect, useState } from 'react'

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // SW kayıt
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
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
