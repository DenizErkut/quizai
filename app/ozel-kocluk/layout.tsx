import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Özel Koçluk | Pratium',
  description: 'Bireysel öğrenciler ve kurumlar için kişiye özel çalışma planı ve koçluk desteği: Pratium özel koçluk başvuru formu.',
  alternates: { canonical: '/ozel-kocluk' },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
