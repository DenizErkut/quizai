// lib/university-departments.ts
// Üniversite öğrencisi kayıt olurken seçtiği bölüm listesi — fakülteye göre
// gruplu, en yaygın Türkiye üniversite programlarını kapsar. Listede olmayan
// bir bölüm için en sondaki "Diğer" seçilir ve serbest metin alanı açılır
// (bkz. components/DepartmentSelect.tsx).
//
// Bu liste sadece kayıt formundaki seçim kutusu içindir — soru üretimi
// (generate-quiz) MEB müfredatı gibi bir "bölüm müfredatı" havuzuna
// bağlanmaz, öğrencinin seçtiği bölüm bağlamı doğrudan AI prompt'una
// verilir (üniversitede tek bir resmi müfredat yok).

export interface DepartmentGroup {
  group: string
  options: string[]
}

export const UNIVERSITY_DEPARTMENTS: DepartmentGroup[] = [
  {
    group: 'Mühendislik',
    options: [
      'Bilgisayar Mühendisliği',
      'Biyomedikal Mühendisliği',
      'Çevre Mühendisliği',
      'Elektrik-Elektronik Mühendisliği',
      'Endüstri Mühendisliği',
      'Gıda Mühendisliği',
      'Harita Mühendisliği',
      'İnşaat Mühendisliği',
      'Kimya Mühendisliği',
      'Maden Mühendisliği',
      'Makine Mühendisliği',
      'Metalurji ve Malzeme Mühendisliği',
      'Uçak ve Uzay Mühendisliği',
      'Yazılım Mühendisliği',
    ],
  },
  {
    group: 'Sağlık Bilimleri',
    options: [
      'Beslenme ve Diyetetik',
      'Diş Hekimliği',
      'Ebelik',
      'Eczacılık',
      'Fizyoterapi ve Rehabilitasyon',
      'Hemşirelik',
      'Odyoloji',
      'Sağlık Yönetimi',
      'Tıp',
      'Veterinerlik',
    ],
  },
  {
    group: 'Hukuk',
    options: ['Hukuk'],
  },
  {
    group: 'İktisadi ve İdari Bilimler',
    options: [
      'Bankacılık ve Finans',
      'Çalışma Ekonomisi ve Endüstri İlişkileri',
      'İktisat',
      'İşletme',
      'Maliye',
      'Muhasebe ve Finans Yönetimi',
      'Siyaset Bilimi ve Kamu Yönetimi',
      'Uluslararası İlişkiler',
    ],
  },
  {
    group: 'Eğitim',
    options: [
      'Fen Bilgisi Öğretmenliği',
      'İngilizce Öğretmenliği',
      'Matematik Öğretmenliği',
      'Okul Öncesi Öğretmenliği',
      'Özel Eğitim Öğretmenliği',
      'Rehberlik ve Psikolojik Danışmanlık',
      'Sınıf Öğretmenliği',
      'Türkçe Öğretmenliği',
    ],
  },
  {
    group: 'Fen-Edebiyat',
    options: [
      'Arkeoloji',
      'Biyoloji',
      'Coğrafya',
      'Felsefe',
      'Fizik',
      'Kimya',
      'Matematik',
      'Moleküler Biyoloji ve Genetik',
      'Psikoloji',
      'Sosyoloji',
      'Tarih',
      'Türk Dili ve Edebiyatı',
    ],
  },
  {
    group: 'İletişim',
    options: [
      'Gazetecilik',
      'Halkla İlişkiler ve Tanıtım',
      'Radyo, Televizyon ve Sinema',
      'Reklamcılık',
    ],
  },
  {
    group: 'Mimarlık ve Tasarım',
    options: [
      'Endüstri Ürünleri Tasarımı',
      'İç Mimarlık',
      'Mimarlık',
      'Peyzaj Mimarlığı',
      'Şehir ve Bölge Planlama',
    ],
  },
  {
    group: 'Ziraat ve Doğa Bilimleri',
    options: ['Orman Mühendisliği', 'Su Ürünleri Mühendisliği', 'Ziraat Mühendisliği'],
  },
  {
    group: 'Diğer',
    options: ['Diğer'],
  },
]

export const OTHER_DEPARTMENT_VALUE = 'Diğer'
