import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
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
    title: 'Pratium',
    description: 'AI destekli kişisel test platformu',
    images: ['/logo-512.png'],
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
        <meta name="theme-color" content="#1ECFB8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Pratium" />
      </head>
      <body>
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
        <Navbar />
        {children}
        <AIChatBot />
      </body>
    </html>
  )
}
