import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mesafeli Satış Sözleşmesi | Pratium',
  description: 'Pratium abonelikleri için mesafeli satış sözleşmesi: taraflar, hizmet bedeli, ödeme ve cayma koşulları.',
  alternates: { canonical: '/mesafeli-satis' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
