// Öğrencinin sesli komutları: "açık uçlu soruları aç", "ana sayfaya git", "sesi durdur" …
// Komut sayılması için sayfa adının yanında bir EYLEM sözcüğü (aç, git, götür, başlat, geç) gerekir;
// böylece "anlık test nasıl çözülür?" gibi normal sorular koça gider, yanlışlıkla sayfa değiştirmez.

export type VoiceCommand =
  | { type: 'navigate'; href: string; label: string }
  | { type: 'stop' }      // sesi durdur / sus
  | { type: 'repeat' }    // son cevabı oku
  | { type: 'clear' }     // yazılanı temizle

const norm = (text: string) => text.toLocaleLowerCase('tr').replace(/[.,!?;:'"“”’()]/g, ' ').replace(/\s+/g, ' ').trim()

// Sayfa adı (kök) → hedef. Daha özgül olanlar önce gelir.
const PAGES: Array<{ keys: string[]; href: string; label: string }> = [
  { keys: ['yazılıya hazırlan', 'yazılı'], href: '/yazili', label: 'Yazılıya Hazırlanıyorum' },
  { keys: ['açık uçlu'], href: '/acik-uclu', label: 'Açık Uçlu Sorular' },
  { keys: ['anlık test'], href: '/quiz', label: 'Anlık Test' },
  { keys: ['günlük test'], href: '/daily', label: 'Günlük Test' },
  { keys: ['sınav simülasyon', 'deneme sınav'], href: '/exam', label: 'Sınav Simülasyonu' },
  { keys: ['canlı quiz'], href: '/live', label: 'Canlı Quiz' },
  { keys: ['sesli kitap'], href: '/reading', label: 'Sesli Kitap' },
  { keys: ['istatistik'], href: '/analysis', label: 'İstatistiklerim' },
  { keys: ['gelişim plan'], href: '/plan', label: 'Gelişim Planı' },
  { keys: ['tekrar merkezi'], href: '/review', label: 'Tekrar Merkezi' },
  { keys: ['sıralama'], href: '/leaderboard', label: 'Sıralama' },
  { keys: ['ödevlerim', 'ödevler'], href: '/assignments', label: 'Ödevlerim' },
  { keys: ['sınıflarım'], href: '/classes', label: 'Sınıflarım' },
  { keys: ['soru arşiv', 'arşiv'], href: '/archive', label: 'Soru Arşivi' },
  { keys: ['notlarım'], href: '/notes', label: 'Notlarım' },
  { keys: ['koç'], href: '/koc', label: 'Koç' },
  { keys: ['profil'], href: '/profile/edit', label: 'Profilim' },
  { keys: ['ana sayfa', 'ana ekran'], href: '/home', label: 'Ana Sayfa' },
]

const ACTION = /(^| )(aç|açar mısın|git|gider misin|götür|başlat|geç|göster|ac)( |$)/

export function matchVoiceCommand(raw: string): VoiceCommand | null {
  const text = norm(raw)
  if (!text) return null
  if (/^(sesi |okumayı )?(durdur|kapat|sus)$/.test(text) || text === 'sesi kapat') return { type: 'stop' }
  if (/^(tekrar )?(oku|dinle|tekrar söyle|bir daha söyle)$/.test(text)) return { type: 'repeat' }
  if (/^(yazılanı |metni )?(temizle|sil)$/.test(text)) return { type: 'clear' }
  // Çok uzun cümleler komut değil sohbettir (komutlar kısadır).
  if (text.split(' ').length > 7) return null
  if (!ACTION.test(text) && !/ sayfası$/.test(text)) return null
  const page = PAGES.find(p => p.keys.some(key => text.includes(key)))
  return page ? { type: 'navigate', href: page.href, label: page.label } : null
}
