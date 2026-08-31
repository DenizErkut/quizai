import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import ThemeToggleFloating from '@/components/ThemeToggleFloating'
import { UserProvider } from '@/lib/user-context'
import AIChatBot from '@/components/AIChatBot'
import PWAInstallBanner from '@/components/PWAInstallBanner'
import ConsentGate from '@/components/ConsentGate'

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
  // Schema.org yapılandırılmış veri — Faz 8 (GEO/AI Discovery) kapsamında
  // eklendi. Daha önce pratium.com'da hiç JSON-LD yoktu, bu da AI
  // sistemlerinin (ve arama motorlarının) Pratium'u "ne" olarak anlaması
  // için hiçbir makine-okunabilir sinyal olmadığı anlamına geliyordu.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        '@id': 'https://pratium.com/#organization',
        name: 'Pratium',
        url: 'https://pratium.com',
        logo: 'https://pratium.com/pratium-logo.png',
        description: 'Türkiye K-12 (ilkokul-lise) seviyesinde, MEB müfredatına uygun, yapay zeka destekli sınav hazırlık ve öğrenci gelişim takip platformu.',
        areaServed: { '@type': 'Country', name: 'Türkiye' },
        sameAs: ['https://instagram.com/pratiumai'],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://pratium.com/#website',
        url: 'https://pratium.com',
        name: 'Pratium',
        publisher: { '@id': 'https://pratium.com/#organization' },
        inLanguage: 'tr-TR',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Pratium',
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web, iOS, Android',
        description: 'Yapay zeka destekli soru üretimi, gerçek zamanlı analiz ve kişisel gelişim planı sunan K-12 eğitim platformu. İlkokuldan üniversiteye, 6 dilde.',
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'TRY',
          lowPrice: '0',
          highPrice: '6000',
          offerCount: '3',
        },
        audience: {
          '@type': 'EducationalAudience',
          educationalRole: ['student', 'parent', 'teacher'],
        },
      },
    ],
  }

  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#29483d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Pratium" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <PWAInstallBanner />
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
          <ThemeToggleFloating />
          {children}
          {/* Madde 7: sözleşme/rıza versiyonu değiştiğinde yeniden-onay modalı */}
          <ConsentGate />
        </UserProvider>
        <AIChatBot />
      </body>
    </html>
  )
}
