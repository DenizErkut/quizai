import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kullanım Şartları | Pratium',
  description: 'Pratium kullanım şartları: hizmetin kapsamı, kullanıcı yükümlülükleri ve sorumluluk sınırları.',
  alternates: { canonical: '/terms' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
