import type { Metadata } from 'next'
import BreadcrumbJsonLd from '@/components/BreadcrumbJsonLd'

export const metadata: Metadata = {
  title: 'Planlar ve Fiyatlar | Pratium',
  description: 'Pratium Gümüş, Altın ve Platin planlarını karşılaştır: yapay zekâ destekli testler, kişisel gelişim planı, öğretmen ve veli özellikleri.',
  alternates: { canonical: '/pricing' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><BreadcrumbJsonLd name="Planlar ve Fiyatlar" path="/pricing" />{children}</>
}
