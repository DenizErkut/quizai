'use client'
// app/offline/page.tsx
import { useT } from '@/lib/i18n/I18nProvider'

export default function OfflinePage() {
  const { t: tr } = useT()
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #082465, #1a3a7a)', padding: '2rem', textAlign: 'center' }}>
      <img src="/logo-192.png" alt="Pratium" style={{ width: 80, height: 80, borderRadius: '20px', marginBottom: '1.5rem', opacity: 0.9 }} />
      <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '28px', marginBottom: '12px' }}>{tr('İnternet bağlantısı yok')}</h1>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '15px', maxWidth: '320px', lineHeight: 1.6, marginBottom: '2rem' }}>
        {tr('Bağlantın kesildi. İnternete bağlandığında Pratium otomatik olarak devam edecek.')}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: '#1ECFB8', color: '#082465', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>
        {tr('Tekrar Dene')}
      </button>
    </main>
  )
}
