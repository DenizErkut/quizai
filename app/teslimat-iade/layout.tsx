import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Teslimat ve İade Şartları | Pratium',
  description: 'Pratium dijital hizmetinin teslimatı, iptal ve iade koşulları.',
  alternates: { canonical: '/teslimat-iade' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
