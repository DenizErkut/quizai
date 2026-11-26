import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gizlilik Politikası ve KVKK Aydınlatma Metni | Pratium',
  description: 'Pratium gizlilik politikası ve KVKK aydınlatma metni: hangi veriler işlenir, hangi amaçla kullanılır ve ne kadar süre saklanır.',
  alternates: { canonical: '/privacy' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
