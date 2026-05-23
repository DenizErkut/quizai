import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'Pratium — Sana özel AI destekli testler',
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
          href="https://fonts.googleapis.com/css2?family=Cavolini&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0095C8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Pratium" />
      </head>
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
