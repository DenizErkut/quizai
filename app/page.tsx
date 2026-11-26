import LandingPage from '@/components/LandingPage'

// Ana sayfa sunucuda render edilir (içerik ilk HTML'de bulunur); oturum açmış ziyaretçilerin yönlendirmesi istemci bileşenindedir.
export const metadata = {
  title: 'Pratium | MEB Müfredatına Uygun Yapay Zekâ Destekli Test ve Sınav Hazırlık',
  description: 'MEB müfredatına uygun, yapay zekâ destekli test çöz: kazanım bazlı sorular, anında analiz ve kişisel çalışma planı. İlkokul, ortaokul ve lise için.',
  alternates: { canonical: '/' },
}

export default function Home() {
  return <LandingPage />
}
