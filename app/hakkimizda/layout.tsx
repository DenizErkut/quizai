import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hakkımızda | Pratium',
  description: 'Pratium kimdir? MEB müfredatına uygun, doğrulanmış ve seviyeye göre uyum sağlayan yapay zekâ destekli bir öğrenme platformunun misyonu ve yaklaşımı.',
  alternates: { canonical: '/hakkimizda' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
