// Notifications are stored as plain Turkish text by cron jobs and API routes. This helper translates the known
// static titles and the body templates when they are displayed; unknown texts (AI-written nudges, e-mail
// subjects, teacher-written messages) are returned unchanged.
type T = (text: string, params?: Record<string, string | number>) => string

// Static texts that the cron jobs/API routes store; they are translated by exact match through t().
export const KNOWN_NOTIFICATION_TEXTS = [
  '⏰ Ödev yarın bitiyor!',
  '🚨 Ödev bugün bitiyor!',
  '🎯 Canlı Quiz Başlıyor!',
  '📅 Yeni çalışma planın hazır!',
  '📊 Haftalık özet gönderildi',
  'Altın öğretmen üyeliğin açıldı 🎉',
  '🎓 Yeni AI bilgi testin hazır',
  '📚 Öğretmeninizden çalışma önerisi',
  '🎓 Öğretmen başvurunuz onaylandı!',
  '⚠️ Ajan kalite alarmı',
  '🔍 Otomatik içerik taraması sorun buldu',
  '👋 Pratium Koç seni bekliyor',
  "✦ Pratium Koç'tan bir öneri",
  'Performansına göre güncellenen 4 haftalık planını incelemek için tıkla.',
  'Pratium Öğretmen Paneline erişebilirsiniz. Sınıf oluşturabilir ve ödev atayabilirsiniz.',
]

const BODY_TEMPLATES: { re: RegExp; key: string; names: string[] }[] = [
  { re: /^"([\s\S]*)" ödevinin son tarihi yarın\. Hemen çöz!$/, key: '"{title}" ödevinin son tarihi yarın. Hemen çöz!', names: ['title'] },
  { re: /^"([\s\S]*)" ödevinin son günü bugün\. Son şansın!$/, key: '"{title}" ödevinin son günü bugün. Son şansın!', names: ['title'] },
  { re: /^([\s\S]*) sınıfında "([\s\S]*)" konusunda quiz başlıyor\. Katılmak için tıkla!$/, key: '{name} sınıfında "{topic}" konusunda quiz başlıyor. Katılmak için tıkla!', names: ['name', 'topic'] },
  { re: /^([\s\S]+) planın başarıyla aktive edildi\. İyi çalışmalar!$/, key: '{plan} planın başarıyla aktive edildi. İyi çalışmalar!', names: ['plan'] },
  { re: /^(\d+) öğrencin yıllık Altın üyelik aldı\. 1 yıl boyunca tüm öğretmen özellikleri açık\.$/, key: '{n} öğrencin yıllık Altın üyelik aldı. 1 yıl boyunca tüm öğretmen özellikleri açık.', names: ['n'] },
  { re: /^Seviye (\d+)\/(\d+)\. Dört kısa soru; her başarıdan sonra sorular zorlaşır\.$/, key: 'Seviye {level}/{max}. Dört kısa soru; her başarıdan sonra sorular zorlaşır.', names: ['level', 'max'] },
  { re: /^([\s\S]+) konusunda kısa bir tekrar yapman öneriliyor\.$/, key: '{topic} konusunda kısa bir tekrar yapman öneriliyor.', names: ['topic'] },
  { re: /^([\s\S]+), (\d+) gündür pratik yapmadı \(önceki dönemde haftada ortalama ([\d.,]+) test çözüyordu\)\.$/, key: '{child}, {days} gündür pratik yapmadı (önceki dönemde haftada ortalama {avg} test çözüyordu).', names: ['child', 'days', 'avg'] },
  { re: /^([\s\S]+) ajanında son 7 günde boş karar oranı %(\d+) seviyesinde\.$/, key: '{agent} ajanında son 7 günde boş karar oranı %{rate} seviyesinde.', names: ['agent', 'rate'] },
]

const TITLE_TEMPLATES: { re: RegExp; key: string; names: string[] }[] = [
  { re: /^(\S+) ([\s\S]+) aktif!$/, key: '{emoji} {plan} aktif!', names: ['emoji', 'plan'] },
]

function apply(text: string, templates: typeof BODY_TEMPLATES, t: T): string | null {
  for (const tpl of templates) {
    const m = tpl.re.exec(text)
    if (!m) continue
    const params: Record<string, string> = {}
    tpl.names.forEach((name, i) => { params[name] = m[i + 1] })
    if (params.plan) params.plan = t(params.plan)
    if (params.topic) params.topic = t(params.topic)
    return t(tpl.key, params)
  }
  return null
}

export function localizeNotificationTitle(title: string, t: T): string {
  const translated = t(title)
  if (translated !== title) return translated
  return apply(title, TITLE_TEMPLATES, t) ?? title
}

export function localizeNotificationBody(body: string, t: T): string {
  const translated = t(body)
  if (translated !== body) return translated
  return apply(body, BODY_TEMPLATES, t) ?? body
}
