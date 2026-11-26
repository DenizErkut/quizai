import LandingPage from '@/components/LandingPage'

// Ana sayfa sunucuda render edilir (içerik ilk HTML'de bulunur); oturum açmış ziyaretçilerin yönlendirmesi istemci bileşenindedir.
export const metadata = { alternates: { canonical: '/' } }

export default function Home() {
  return <LandingPage />
}
