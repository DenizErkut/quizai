import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import { UserProvider } from '@/lib/user-context'
import AIChatBot from '@/components/AIChatBot'

export const metadata: Metadata = {
  title: 'Pratium — Öğren. Test Et. Geliş.',
  description: 'Sınıfına ve konuna göre AI destekli anlık test platformu. Günlük test, kişisel analiz ve gelişim planı.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: '/logo-192.png',
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'Pratium — Öğren. Test Et. Geliş.',
    description: 'Yapay zeka destekli soru üretimi, gerçek zamanlı analiz ve kişisel gelişim planı. İlkokuldan üniversiteye 6 dilde eğitim platformu.',
    url: 'https://pratium.com',
    siteName: 'Pratium',
    images: [
      {
        url: 'https://pratium.com/pratium-logo.png',
        width: 1254,
        height: 1254,
        alt: 'Pratium — AI Destekli Eğitim Platformu',
      }
    ],
    locale: 'tr_TR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pratium — Öğren. Test Et. Geliş.',
    description: 'AI destekli soru üretimi, gerçek zamanlı analiz. İlkokuldan üniversiteye 6 dilde eğitim platformu.',
    images: ['https://pratium.com/pratium-logo.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=Raleway:wght@300;400;500;600;700;900&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#082465" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Pratium" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `
          // Service Worker kayıt
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(reg) { console.log('SW registered:', reg.scope) })
                .catch(function(err) { console.log('SW error:', err) })
            })
          }

          // iOS PWA install prompt
          let deferredPrompt;
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            deferredPrompt = e;
            // 3 saniye sonra banner göster (sadece bir kez)
            if (!localStorage.getItem('pwa-dismissed')) {
              setTimeout(function() {
                const banner = document.getElementById('pwa-install-banner');
                if (banner) banner.style.display = 'flex';
              }, 3000);
            }
          });

          window.addEventListener('appinstalled', function() {
            const banner = document.getElementById('pwa-install-banner');
            if (banner) banner.style.display = 'none';
            localStorage.setItem('pwa-dismissed', '1');
          });

          window.__installPWA = function() {
            if (deferredPrompt) {
              deferredPrompt.prompt();
              deferredPrompt.userChoice.then(function(r) {
                if (r.outcome === 'accepted') localStorage.setItem('pwa-dismissed', '1');
                deferredPrompt = null;
                const banner = document.getElementById('pwa-install-banner');
                if (banner) banner.style.display = 'none';
              });
            }
          };
        `}} />

        {/* PWA Install Banner */}
        <div id="pwa-install-banner" style={{ display: 'none', position: 'fixed', bottom: '80px', left: '12px', right: '12px', zIndex: 9999, background: '#082465', borderRadius: '16px', padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', alignItems: 'center', gap: '12px', border: '1px solid rgba(30,207,184,0.3)' }}>
          <img src="/logo-192.png" alt="Pratium" style={{ width: 40, height: 40, borderRadius: '10px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>Pratium&apos;u yükle</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>Ana ekrana ekle, hızlı eriş</div>
          </div>
          <button onClick={() => (window as any).__installPWA?.()} style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#1ECFB8', color: '#082465', fontWeight: 700, fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
            Yükle
          </button>
          <button onClick={() => { const b = document.getElementById('pwa-install-banner'); if(b) b.style.display='none'; localStorage.setItem('pwa-dismissed','1') }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '18px', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}>
            ×
          </button>
        </div>
        {/* Dark mode flash fix — theme'i body render olmadan önce uygula */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('pratium-theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
            } catch(e) {}
          })();
        `}} />
        <UserProvider>
          <Navbar />
          {children}
        </UserProvider>
        <AIChatBot />
      </body>
    </html>
  )
}
