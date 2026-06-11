'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import OnboardingModal from '@/components/OnboardingModal'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FileUploader, { type UploadedFile } from '@/components/FileUploader'
import QuizResult from '@/components/QuizResult'
import QuizSetup from '@/components/quiz/QuizSetup'
import QuizQuestion from '@/components/quiz/QuizQuestion'

type QuestionType = 'multiple_choice' | 'fill_blank' | 'matching' | 'true_false' | 'ordering' | 'short_answer' | 'multi_true_false' | 'table_fill' | 'mixed'

interface Question {
  q: string; opts: string[]; ans: number; exp: string
  svg?: string | null; qtype?: 'text' | 'svg'
  // Yeni soru tipleri
  type?: QuestionType
  blank?: string          // boşluk doldurma: doğru cevap
  pairs?: {left:string; right:string}[]  // eşleştirme
  items?: string[]        // sıralama: karışık liste
  correctOrder?: number[] // sıralama: doğru sıra
  statement?: boolean     // D/Y: doğru mu?
  statements?: {text: string; correct: boolean}[]  // çoklu D/Y (Maarif)
  tableData?: {headers: string[]; rows: {cells: string[]; blanks: number[]}[]} // tablo (Maarif)
  tableAnswers?: string[] // tablo: doğru cevaplar sırayla
}
interface Profile { name: string; grade: string; language: string; plan: string; monthly_test_count: number; daily_test_count?: number; daily_test_date?: string; onboarding_completed?: boolean }

// MEB müfredatına göre ders ve konu haritası
const SUBJECT_MAP: Record<string, Record<string, string[]>> = {
  ilkokul: {
    'Matematik': [
      'Doğal sayılar', 'Toplama işlemi', 'Çıkarma işlemi', 'Çarpma işlemi', 'Bölme işlemi',
      'Çarpım tablosu', 'Kesirler', 'Ondalık gösterim', 'Ölçme ve ölçü birimleri',
      'Geometrik şekiller', 'Simetri', 'Örüntüler', 'Problem çözme', 'Zaman ölçme',
    ],
    'Türkçe': [
      'Okuma ve anlama', 'Dinleme becerileri', 'Konuşma becerileri', 'Yazma becerileri',
      'Sözcük ve anlam', 'Cümle bilgisi', 'Yazım kuralları', 'Noktalama işaretleri',
      'Metin türleri', 'Şiir ve duygu', 'Atasözleri ve deyimler',
    ],
    'Fen Bilimleri': [
      'Canlılar dünyası', 'Bitkiler ve hayvanlar', 'İnsan vücudu', 'Duyu organları',
      'Madde ve özellikleri', 'Kuvvet ve hareket', 'Işık ve ses', 'Hava ve iklim',
      'Mevsimler', 'Çevre ve doğa', 'Geri dönüşüm', 'Sağlıklı yaşam',
    ],
    'Sosyal Bilgiler': [
      'Aile ve toplum', 'Yakın çevre', 'Türkiye haritası', 'Ülkemizin güzellikleri',
      'Milli değerler', 'Atatürk ve Kurtuluş Savaşı', 'Haklar ve sorumluluklar',
      'Üretim ve tüketim', 'Doğal kaynaklar', 'Kültürel miras',
    ],
    'Din Kültürü ve Ahlak Bilgisi': [
      'Allah inancı', 'Peygamberler', 'Namaz ve ibadet', 'Ahlaki değerler',
      'Dini bayramlar', 'Kuran-ı Kerim', 'Dua ve zihin',
    ],
    'Hayat Bilgisi': [
      'Okul heyecanım', 'Benim eşsiz yuvam', 'Dün bugün yarın',
      'Sağlıklı yaşam', 'Güvenli yaşam', 'Doğa ve çevre',
    ],
  },

  ortaokul: {
    'Matematik': [
      'Tam sayılar ve işlemler', 'Ondalık sayılar', 'Kesirler ve işlemler',
      'Oran ve orantı', 'Yüzdeler', 'Asal çarpanlara ayırma', 'OBEB ve OKEK',
      'Denklemler ve eşitsizlikler', 'Cebirsel ifadeler', 'Koordinat sistemi',
      'Üçgenler ve özellikler', 'Dörtgenler', 'Çember ve daire',
      'Alan ve çevre hesaplama', 'Hacim', 'Veri analizi ve grafik', 'Olasılık',
      'Örüntü ve ilişkiler', 'Rasyonel sayılar', 'Üslü ifadeler', 'Kareköklü ifadeler',
    ],
    'Fen Bilimleri': [
      'Hücre ve yapısı', 'Hücre organelleri', 'Canlıların sınıflandırılması',
      'Fotosentez', 'Solunum', 'Sindirim sistemi', 'Dolaşım sistemi',
      'Boşaltım sistemi', 'Destek ve hareket sistemi', 'Sinir sistemi',
      'Üreme ve gelişme', 'Kalıtım', 'Ekosistem ve biyoçeşitlilik',
      'Madde ve atom', 'Elementler ve bileşikler', 'Kimyasal tepkimeler',
      'Asit ve bazlar', 'Kuvvet ve enerji', 'Basınç', 'Elektrik',
      'Manyetizma', 'Işık ve ses', 'Dalgalar', 'Güneş sistemi',
    ],
    'Türkçe': [
      'Sözcük türleri', 'İsim ve isim çekimi', 'Sıfatlar', 'Zarflar', 'Zamirler',
      'Fiiller ve çekimi', 'Cümle çeşitleri', 'Cümle ögeleri',
      'Anlam bilgisi', 'Sözcükte anlam', 'Paragraf', 'Metin türleri',
      'Hikaye edici metin', 'Bilgilendirici metin', 'Şiir bilgisi',
      'Yazım kuralları', 'Noktalama işaretleri', 'Anlatım bozukluğu',
    ],
    'T.C. İnkılap Tarihi ve Atatürkçülük': [
      'Osmanlı Devleti son dönem', 'I. Dünya Savaşı', 'Mondros Ateşkesi',
      'Kurtuluş Savaşı hazırlık dönemi', 'Misak-ı Millî', 'TBMM açılışı',
      'Cepheler ve savaşlar', 'Mudanya Ateşkesi', 'Lozan Antlaşması',
      'Cumhuriyetin ilanı', 'Atatürk ilkeleri', 'İnkılaplar',
      'Siyasi alanda yenilikler', 'Eğitimde yenilikler', 'Ekonomik yenilikler',
    ],
    'Sosyal Bilgiler': [
      'Birey ve kimlik', 'Kültür ve miras', 'İnsanlar yerler çevreler',
      'Üretim dağıtım tüketim', 'Bilim teknoloji toplum',
      'Gruplar kurumlar sosyal örgütler', 'Küresel bağlantılar',
      'Türkiye coğrafyası', 'Nüfus ve yerleşme', 'Ekonomik faaliyetler',
      'Türk tarihinde yolculuk', 'Demokrasi ve insan hakları',
    ],
    'İngilizce': [
      'Greetings and introductions', 'Present simple tense', 'Present continuous',
      'Past simple tense', 'Future tense (will/going to)', 'Modals (can/must/should)',
      'Comparatives and superlatives', 'Prepositions', 'Question words',
      'Vocabulary: family', 'Vocabulary: food and health', 'Vocabulary: environment',
      'Reading comprehension', 'Listening skills', 'Writing paragraphs',
    ],
    'Din Kültürü ve Ahlak Bilgisi': [
      'Allah ve sıfatları', 'Melekler', 'Kitaplar', 'Peygamberler', 'Ahiret inancı',
      'Kader', 'İbadetler', 'Namaz', 'Oruç', 'Zekat', 'Hac',
      'Kuran-ı Kerim', 'Hz. Muhammed', 'Ahlaki değerler', 'Dini bayramlar',
    ],
    'Görsel Sanatlar': [
      'Renk teorisi', 'Perspektif', 'Sanat akımları', 'Türk sanatı', 'Heykel ve seramik',
    ],
    'Müzik': [
      'Nota bilgisi', 'Ritim', 'Türk halk müziği', 'Türk sanat müziği', 'Evrensel müzik',
    ],
    'Beden Eğitimi': [
      'Atletizm', 'Jimnastik', 'Takım sporları', 'Sağlıklı yaşam', 'Oyun ve spor',
    ],
  },

  lise: {
    'Matematik': [
      'Mantık', 'Kümeler', 'Denklemler ve eşitsizlikler', 'Üslü ve köklü sayılar',
      'Mutlak değer', 'Polinomlar', 'Rasyonel ifadeler', 'Fonksiyonlar',
      'Birinci ve ikinci dereceden fonksiyonlar', 'Trigonometri', 'Logaritma',
      'Diziler (aritmetik ve geometrik)', 'Limit ve süreklilik', 'Türev',
      'Türevin uygulamaları', 'İntegral', 'İntegralin uygulamaları',
      'Analitik geometri', 'Vektörler', 'Matrisler', 'Kombinasyon ve permütasyon',
      'Binom açılımı', 'Olasılık', 'İstatistik', 'Karmaşık sayılar',
    ],
    'Fizik': [
      'Fizik bilimine giriş', 'Madde ve özellikleri', 'Kuvvet ve hareket',
      'Newton yasaları', 'İş güç enerji', 'İtme ve momentum', 'Tork ve açısal hareket',
      'Basit harmonik hareket', 'Dalgalar', 'Ses dalgaları', 'Işık ve optik',
      'Elektrostatik', 'Elektrik akımı', 'Manyetizma', 'Elektromanyetik indüksiyon',
      'Atom fiziği', 'Nükleer fizik', 'Modern fizik', 'Termodinamik',
    ],
    'Kimya': [
      'Kimyanın temelleri', 'Atom modelleri', 'Periyodik sistem', 'Kimyasal bağlar',
      'Maddenin halleri', 'Gaz kanunları', 'Çözeltiler ve derişim', 'Asit ve bazlar',
      'Kimyasal tepkimeler ve denkleştirme', 'Mol kavramı ve hesaplamalar',
      'Kimyasal denge', 'Organik kimyaya giriş', 'Hidrokarbonlar',
      'Fonksiyonlu organik bileşikler', 'Polimer ve plastikler', 'Elektrokimya',
    ],
    'Biyoloji': [
      'Bilimsel düşünce ve biyoloji', 'Hücre', 'Hücre zarı ve transportu',
      'Hücre bölünmeleri (mitoz-mayoz)', 'Kalıtım ve Mendel genetiği',
      'DNA ve gen teknolojisi', 'Protein sentezi', 'Evrim', 'Canlı çeşitliliği',
      'Bitki biyolojisi', 'Hayvan fizyolojisi', 'Sindirim sistemi',
      'Dolaşım sistemi', 'Solunum sistemi', 'Boşaltım sistemi',
      'Sinir sistemi', 'Endokrin sistem', 'Üreme sistemi', 'Ekosistem ekolojisi',
      'Biyoteknoloji ve genetik mühendisliği',
    ],
    'Türk Dili ve Edebiyatı': [
      'Dil bilgisi: Ses bilgisi', 'Dil bilgisi: Sözcük yapısı', 'Dil bilgisi: Cümle',
      'Anlatım türleri', 'Şiir türleri ve özellikleri', 'Şiir dönemleri',
      'Halk edebiyatı', 'Divan edebiyatı', 'Tanzimat edebiyatı',
      'Servet-i Fünun dönemi', 'Milli edebiyat dönemi', 'Cumhuriyet dönemi edebiyatı',
      'Roman ve hikaye', 'Tiyatro', 'Deneme ve makale', 'Söz sanatları',
    ],
    'T.C. İnkılap Tarihi ve Atatürkçülük': [
      'Osmanlı Devleti çöküş dönemi', 'Kurtuluş Savaşı', 'Lozan Antlaşması',
      'Cumhuriyetin ilanı', 'Halifeliğin kaldırılması', 'Çok partili hayat',
      'Atatürk ilkeleri (Cumhuriyetçilik, Milliyetçilik, Halkçılık)',
      'Atatürk ilkeleri (Devletçilik, Laiklik, Devrimcilik)',
      'Hukuk alanında inkılaplar', 'Eğitim ve kültür inkılapları',
      'Ekonomik kalkınma', 'Atatürk dönemi dış politika', 'İkinci Dünya Savaşı',
    ],
    'Tarih': [
      'Tarih öncesi dönemler', 'İlk uygarlıklar', 'Orta Asya Türk tarihi',
      'İslamiyet öncesi Türk tarihi', 'İslam medeniyeti', 'Türk-İslam devletleri',
      'Osmanlı kuruluş dönemi', 'Osmanlı yükseliş dönemi', 'Osmanlı duraklama',
      'Osmanlı gerileme ve çöküş', 'Fransız İhtilali', 'Sanayi Devrimi',
      'I. Dünya Savaşı', 'Komünizm ve Faşizm', 'II. Dünya Savaşı', 'Soğuk Savaş',
      'Günümüz Türkiye ve dünya', 'Medeniyetler tarihi',
    ],
    'Coğrafya': [
      'Coğrafyanın konusu ve önemi', 'Harita bilgisi', 'Atmosfer ve iklim',
      'İklim tipleri', 'Türkiye iklimi', 'Litosfer ve yer şekilleri',
      'Türkiye yer şekilleri', 'Hidrosfer (sular)', 'Türkiye su kaynakları',
      'Nüfus ve nüfus artışı', 'Göç', 'Yerleşme', 'Türkiye nüfusu',
      'Tarım coğrafyası', 'Sanayi coğrafyası', 'Enerji kaynakları',
      'Türkiye ekonomisi', 'Bölgesel coğrafya', 'Çevre sorunları', 'Küresel ısınma',
    ],
    'Felsefe': [
      'Felsefeye giriş', 'Bilgi felsefesi (epistemoloji)', 'Varlık felsefesi (ontoloji)',
      'Ahlak felsefesi (etik)', 'Siyaset felsefesi', 'Estetik',
      'Din felsefesi', 'Antik Yunan felsefesi', 'Orta Çağ felsefesi',
      'Modern felsefe', 'Çağdaş felsefe', 'Türk İslam düşüncesi',
    ],
    'Din Kültürü ve Ahlak Bilgisi': [
      'İslam düşüncesinde inanç', 'Ahlak ve değerler', 'İbadet',
      'Hz. Muhammed ve örnek ahlakı', 'Kuran mesajı',
      'Dünya dinleri', 'Din ve laiklik', 'Güncel dini meseleler',
    ],
    'İngilizce': [
      'Advanced grammar', 'Reading strategies', 'Writing essays',
      'Listening for detail', 'Speaking fluency', 'Academic vocabulary',
      'Conditionals', 'Passive voice', 'Reported speech',
      'Phrasal verbs', 'Idioms', 'YDS/YÖKDİL hazırlık',
    ],
    'Sağlık Bilgisi': [
      'Sağlıklı beslenme', 'Fiziksel aktivite', 'Ruh sağlığı',
      'Bulaşıcı hastalıklar', 'Bağımlılık', 'İlk yardım',
    ],
  },

  universite: {
    'Matematik': [
      'Diferansiyel ve integral hesap', 'Diferansiyel denklemler', 'Lineer cebir',
      'Sayısal analiz', 'İstatistik ve olasılık', 'Kompleks analiz',
      'Topoloji', 'Ayrık matematik', 'Fonksiyonel analiz',
    ],
    'Fizik': [
      'Klasik mekanik', 'Elektromanyetizma', 'Termodinamik ve istatistik mekanik',
      'Kuantum mekaniği', 'Optik', 'Nükleer ve parçacık fiziği',
      'Katıhal fiziği', 'Görelilik teorisi',
    ],
    'Kimya': [
      'Genel kimya', 'Organik kimya', 'Anorganik kimya', 'Fiziksel kimya',
      'Analitik kimya', 'Biyokimya', 'Polimer kimyası',
    ],
    'Biyoloji': [
      'Moleküler biyoloji', 'Genetik', 'Hücre biyolojisi', 'Mikrobiyoloji',
      'Fizyoloji', 'Ekoloji', 'Evrimsel biyoloji', 'Biyoteknoloji',
    ],
    'İktisat': [
      'Mikroekonomi', 'Makroekonomi', 'Uluslararası iktisat', 'Para teorisi',
      'Kalkınma ekonomisi', 'Oyun teorisi', 'Ekonometri',
    ],
    'Bilişim ve Yazılım': [
      'Veri yapıları ve algoritmalar', 'Nesne yönelimli programlama',
      'Veritabanı yönetimi', 'İşletim sistemleri', 'Bilgisayar ağları',
      'Yazılım mühendisliği', 'Yapay zeka ve makine öğrenmesi',
      'Siber güvenlik', 'Mobil uygulama geliştirme',
    ],
    'Havacılık': [
      'Uçak yapısı ve sistemleri', 'Aerodinamik', 'Uçuş mekaniği',
      'Navigasyon ve seyrüsefer', 'Meteoroloji', 'Hava trafik kontrolü',
      'Havacılık güvenliği', 'Uçuş kuralları (VFR/IFR)', 'Aviyonik sistemler',
      'Uçak motoru (piston/jet)', 'Hidrolik ve pnömatik sistemler',
    ],
    'Hukuk': [
      'Medeni hukuk', 'Borçlar hukuku', 'Ticaret hukuku', 'Ceza hukuku',
      'İdare hukuku', 'Anayasa hukuku', 'Uluslararası hukuk', 'İş hukuku',
    ],
    'İşletme': [
      'Muhasebe', 'Finansman', 'Pazarlama', 'Yönetim ve organizasyon',
      'İnsan kaynakları', 'Girişimcilik', 'Stratejik yönetim',
    ],
    'İngilizce': [
      'Academic writing', 'Reading comprehension', 'Listening skills',
      'Grammar and syntax', 'Vocabulary building', 'Presentation skills',
      'Business English', 'Research writing', 'IELTS / TOEFL hazırlık',
      'YDS / YÖKDİL hazırlık', 'Conversational English',
    ],
    'Türk Dili ve Edebiyatı': [
      'Türkçe yazım kuralları', 'Akademik yazım', 'Metin analizi',
      'Türk edebiyatı tarihi', 'Dilbilgisi', 'İletişim becerileri',
    ],
    'Atatürk İlkeleri ve İnkılap Tarihi': [
      'Osmanlı son dönemi', 'Kurtuluş Savaşı', 'Cumhuriyetin ilanı',
      'Atatürk ilkeleri', 'Türkiye Cumhuriyeti tarihi',
    ],
    'Sosyoloji': [
      'Sosyolojiye giriş', 'Toplumsal yapı', 'Kültür ve toplum',
      'Sosyal değişme', 'Araştırma yöntemleri',
    ],
    'Psikoloji': [
      'Psikolojiye giriş', 'Gelişim psikolojisi', 'Sosyal psikoloji',
      'Klinik psikoloji', 'Bilişsel psikoloji', 'Araştırma yöntemleri',
    ],
  },
}

// Eski format ile uyumluluk — suggestions için
const TOPIC_MAP: Record<string, { topic: string; subject: string }[]> = {
  ilkokul: Object.entries(SUBJECT_MAP.ilkokul).flatMap(([subj, topics]) => topics.slice(0,1).map(t => ({ topic: t, subject: subj }))),
  ortaokul: Object.entries(SUBJECT_MAP.ortaokul).flatMap(([subj, topics]) => topics.slice(0,1).map(t => ({ topic: t, subject: subj }))),
  lise: Object.entries(SUBJECT_MAP.lise).flatMap(([subj, topics]) => topics.slice(0,1).map(t => ({ topic: t, subject: subj }))),
  universite: Object.entries(SUBJECT_MAP.universite).flatMap(([subj, topics]) => topics.slice(0,1).map(t => ({ topic: t, subject: subj }))),
}

const DIFFICULTIES = [
  { value: 'kolay', label: 'Kolay', desc: 'Temel kavramlar', color: '#16a34a', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.3)' },
  { value: 'normal', label: 'Normal', desc: 'Müfredat seviyesi', color: '#2563eb', bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.3)' },
  { value: 'zor', label: 'Zor', desc: 'Analiz gerektiren', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  { value: 'cok zor', label: 'Çok Zor', desc: 'Olimpiyat seviyesi', color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
]

function getActiveLang(profileLang?: string): string {
  if (typeof window === 'undefined') return profileLang || 'Türkçe'
  return localStorage.getItem('pratium_lang') || profileLang || 'Türkçe'
}

type Screen = 'topic' | 'loading' | 'quiz' | 'result' | 'limit' | 'error'

function QuizPageContent() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [quizError, setQuizError] = useState<{code: string; title: string; desc: string; retry: boolean} | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [currentLang, setCurrentLang] = useState('Türkçe')
  const [screen, setScreen] = useState<Screen>('topic')
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [openSubject, setOpenSubject] = useState<string | null>(null) // Accordion
  const [advancedOpen, setAdvancedOpen] = useState(false) // Gelişmiş ayarlar
  const [favorites, setFavorites] = useState<string[]>([]) // Favori konular
  const [mebTopics, setMebTopics] = useState<Record<string, string[]>>({}) // subject -> units (grade filtreli)
  const [topicSummary, setTopicSummary] = useState<{summary: string; keyPoints: string[]; keyTerms: {term: string; definition: string}[]; rememberThis: string} | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  // Dinamik müfredat — DB'den yükle
  const [dynamicSubjects, setDynamicSubjects] = useState<string[]>([])
  useEffect(() => {
    async function loadCurriculum() {
      try {
        const res = await fetch('/api/admin/curriculum')
        const data = await res.json()
        const userGrade = profile?.grade || ''
        const subjects = (data.curriculum || [])
          .filter((c: any) => c.is_active && (
            userGrade.toLowerCase().includes(c.grade.toLowerCase().split('.')[0].trim()) ||
            userGrade.toLowerCase().includes(c.level)
          ))
          .map((c: any) => c.subject)
        setDynamicSubjects([...new Set(subjects)] as string[])
      } catch {}
    }
    if (profile) loadCurriculum()
  }, [profile?.grade])

  // MEB kaynaklarini cek — sadece kullanicinin sinifina uygun olanlar
  useEffect(() => {
    async function loadMebTopics() {
      try {
        const res = await fetch('/api/admin/meb-upload?sort=asc')
        if (!res.ok) return
        const data = await res.json()
        const map: Record<string, string[]> = {}

        const userGradeRaw = (profile?.grade || '').toLowerCase()
        const userGradeNum = (userGradeRaw.match(/\d+/) || [])[0] || ''
        const userLevel = userGradeRaw.includes('universite') ? 'universite'
          : userGradeRaw.includes('lise') ? 'lise'
          : userGradeRaw.includes('ortaokul') ? 'ortaokul'
          : userGradeRaw.includes('ilkokul') ? 'ilkokul'
          : 'ortaokul'

        for (const r of (data.resources || [])) {
          const resGradeRaw = (r.grade || '').toLowerCase()
          const resGradeNum = (resGradeRaw.match(/\d+/) || [])[0] || ''
          const resLevel = resGradeRaw.includes('universite') ? 'universite'
            : resGradeRaw.includes('lise') ? 'lise'
            : resGradeRaw.includes('ortaokul') ? 'ortaokul'
            : resGradeRaw.includes('ilkokul') ? 'ilkokul'
            : (r.level || '')

          const levelMatch = resLevel === userLevel
          const gradeMatch = !resGradeNum || !userGradeNum || resGradeNum === userGradeNum

          if (levelMatch && gradeMatch) {
            const key = r.subject || 'Diger'
            if (!map[key]) map[key] = []
            if (r.unit && !map[key].includes(r.unit)) map[key].push(r.unit)
          }
        }
        setMebTopics(map)
      } catch {}
    }
    loadMebTopics()
  }, [profile?.grade])

  // localStorage'dan favori ve son ayarları yükle
  useEffect(() => {
    try {
      const favs = JSON.parse(localStorage.getItem('pratium_favs') || '[]')
      setFavorites(favs)
      const lastSettings = JSON.parse(localStorage.getItem('pratium_last_settings') || '{}')
      if (lastSettings.difficulty) setDifficulty(lastSettings.difficulty)
      if (lastSettings.questionType) setQuestionType(lastSettings.questionType)
      if (lastSettings.qCount) setQCount(lastSettings.qCount)
    } catch {}
  }, [])

  async function fetchTopicSummary(topic: string) {
    if (!topic) return
    setShowSummary(true)
    setSummaryLoading(true)
    setTopicSummary(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/topic-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ topic, grade: profile?.grade, language: currentLang }),
      })
      const data = await res.json()
      if (res.ok) setTopicSummary(data)
    } catch {}
    setSummaryLoading(false)
  }

  function toggleFavorite(topic: string) {
    setFavorites(prev => {
      const next = prev.includes(topic) ? prev.filter(f => f !== topic) : [...prev, topic]
      localStorage.setItem('pratium_favs', JSON.stringify(next))
      return next
    })
  }

  function saveLastSettings() {
    try {
      localStorage.setItem('pratium_last_settings', JSON.stringify({
        difficulty, questionType, qCount
      }))
    } catch {}
  }
  const [qCount, setQCount] = useState(10)
  const [difficulty, setDifficulty] = useState('normal')
  const [includeVisuals, setIncludeVisuals] = useState(true)
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice')
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

  const [questions, setQuestions] = useState<Question[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<{ userAns: number; correct: boolean }[]>([])
  // ✅ answersRef: save-quiz için her zaman güncel değeri tut (React state async sorununu çözer)
  const answersRef = useRef<{ userAns: number; correct: boolean }[]>([])
  const isSavingRef = useRef(false) // ✅ Çift save-quiz çağrısını önle
  const [chosen, setChosen] = useState<number | null>(null)
  const searchParams = useSearchParams()
  const [loadMsg, setLoadMsg] = useState('Profilin analiz ediliyor...')
  const [topicErr, setTopicErr] = useState('')
  const [youtubeLinks, setYoutubeLinks] = useState<Record<string, any>>({})
  const [showPaywall, setShowPaywall] = useState<'qcount' | 'daily' | 'topic' | null>(null)
  const supabase = createClient() as any

  // Plan limitleri
  const PLAN_DAILY_LIMIT: Record<string, number> = { free: 10, premium: 25, unlimited: 9999 }
  const PLAN_MAX_QCOUNT: Record<string, number> = { free: 5, premium: 20, unlimited: 20 }

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return null }
    const { data } = await supabase
      .from('profiles').select('name,grade,language,plan,monthly_test_count,daily_test_count,daily_test_date,age,onboarding_completed')
      .eq('id', user.id).single()
    if (!data || !data.grade || !data.age || !data.name) { router.push('/profile'); return null }
    const lang = getActiveLang(data.language)
    setProfile({ ...data, language: lang })
    // ✅ Onboarding: ilk kez giren kullanıcı için modal göster
    if (data && !data.onboarding_completed) {
      setShowOnboarding(true)
    }
    setCurrentLang(lang)
    return { ...data, language: lang }
  }, [])

  useEffect(() => { fetchProfile() }, [])

  // Auto-start from assignment URL params
  useEffect(() => {
    const asgId = searchParams.get('assignment')
    const asgTopic = searchParams.get('topic')
    const asgCount = searchParams.get('count')
    const asgDiff = searchParams.get('difficulty')
    const asgType = searchParams.get('type')
    const retrySession = searchParams.get('retry_session')

    if (asgId && asgTopic) {
      setAssignmentId(asgId)
      setCustomTopic(decodeURIComponent(asgTopic))
      if (asgCount) setQCount(parseInt(asgCount))
      if (asgDiff) setDifficulty(asgDiff)
      if (asgType) setQuestionType(asgType as QuestionType)
    }

    // Arşivden "Yanlışlarımı tekrar çöz" — topic + count otomatik doldur
    if (retrySession && asgTopic) {
      setCustomTopic(decodeURIComponent(asgTopic))
      if (asgCount) setQCount(parseInt(asgCount))
      if (asgDiff) setDifficulty(asgDiff)
    }
  }, [searchParams])

  // Auto-trigger quiz start when assignment params + profile ready
  useEffect(() => {
    const asgId = searchParams.get('assignment')
    const asgTopic = searchParams.get('topic')
    const asgCount = searchParams.get('count')
    const asgDiff = searchParams.get('difficulty')
    const asgType = searchParams.get('type')

    if (asgId && asgTopic && profile && screen === 'topic') {
      const topicDecoded = decodeURIComponent(asgTopic)
      const count = asgCount ? parseInt(asgCount) : 5
      const diff = asgDiff || 'normal'
      const qtype = (asgType || 'multiple_choice') as QuestionType

      setAssignmentId(asgId)
      setCustomTopic(topicDecoded)
      setQCount(count)
      setDifficulty(diff)
      setQuestionType(qtype)

      // Use timeout to let React flush state updates, then manually start
      const timer = setTimeout(async () => {
        const lang = getActiveLang(profile?.language)
        setCurrentLang(lang)
        setScreen('loading')

        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/generate-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            topic: topicDecoded,
            questionCount: count,
            difficulty: diff,
            language: lang,
            questionType: qtype,
          }),
        })
        const data = await res.json()
        if (res.status === 429 && data.error === 'limit_reached') { setScreen('limit'); return }
        if (!data.questions?.length) { setScreen('topic'); return }
        setQuestions(data.questions)
        setSessionId(data.sessionId)
        setCurrent(0)
        setAnswers([])
        answersRef.current = []
        setChosen(null)
        setFillInput('')
        setShortInput('')
        setMatchSelections({})
        setOrderItems([])
        isSavingRef.current = false
        setScreen('quiz')
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [profile])

  useEffect(() => {
    const iv = setInterval(() => {
      const lang = getActiveLang(profile?.language)
      if (lang !== currentLang) {
        setCurrentLang(lang)
        setProfile(prev => prev ? { ...prev, language: lang } : prev)
      }
    }, 500)
    return () => clearInterval(iv)
  }, [currentLang, profile?.language])

  useEffect(() => { if (screen === 'topic') fetchProfile() }, [screen])

  function getLevel(grade: string) {
    return grade.startsWith('ilk') ? 'ilkokul'
      : grade.startsWith('orta') ? 'ortaokul'
      : grade.startsWith('lise') ? 'lise' : 'universite'
  }

  // Tüm yüklü dosyaların içeriğini birleştir
  const combinedContent = uploadedFiles.map(f => `[${f.name}]\n${f.content}`).join('\n\n---\n\n')
  const hasFiles = uploadedFiles.length > 0

  // ── HATA MESAJLARI ──
  function getErrorInfo(errorCode: string, status?: number): {code: string; title: string; desc: string; retry: boolean} {
    if (status === 429 || errorCode === 'daily_limit_reached') return { code: 'daily_limit', title: "⏰ Günlük limit doldu", desc: "Bugünkü test hakkını kullandın. Yarın yenilenir ya da Premium'a geçerek sınırsız test çöz.", retry: false }
    if (errorCode === 'limit_reached') return { code: 'monthly_limit', title: "📚 Aylık limit doldu", desc: "Bu ay için test hakkın bitti. Sınırsız test için Premium'a geç.", retry: false }
    if (errorCode === 'out_of_curriculum') return { code: 'curriculum', title: "📖 Müfredat dışı konu", desc: "Bu konu MEB müfredatında yer almıyor. Başka bir konu dene ya da Premium ile tüm konulara eriş.", retry: false }
    if (errorCode === 'pdf_too_long') return { code: 'pdf', title: "📄 PDF çok uzun", desc: "PDF dosyan 100 sayfadan fazla. Daha kısa bir bölüm yükle ya da metni kopyalayıp yapıştır.", retry: false }
    if (errorCode === 'pdf_image_only') return { code: 'pdf', title: "🖼️ PDF okunemiyor", desc: "Bu PDF taranmış görsel içeriyor, metin çıkarılamıyor. Word veya metin dosyası yükle.", retry: false }
    if (status === 503 || status === 502 || status === 504) return { code: 'server', title: "🔧 Sunucu meşgul", desc: "Sunucularımız şu an yoğun. Birkaç saniye bekleyip tekrar dene.", retry: true }
    if (errorCode?.includes('invalid response')) return { code: 'ai_error', title: "🤖 AI yanıt hatası", desc: "Yapay zeka bu konu için geçerli soru üretemedi. Farklı bir konu veya daha kısa içerik dene.", retry: true }
    if (errorCode?.includes('timeout') || errorCode?.includes('abort')) return { code: 'timeout', title: "⏱️ Zaman aşımı", desc: "Sorular üretilirken zaman doldu. Daha az soru sayısı seç veya tekrar dene.", retry: true }
    return { code: 'unknown', title: "❌ Bir sorun oluştu", desc: "Beklenmeyen bir hata oluştu. Tekrar deneyebilir veya bize bildirebilirsin.", retry: true }
  }

  async function startQuiz() {
    const topic = customTopic.trim() || selectedTopic || (hasFiles ? uploadedFiles.map(f => f.name.replace(/\.[^.]+$/, '')).join(', ') : '')
    if (!topic) { setTopicErr('Bir konu seç veya yaz.'); return }
    setTopicErr('')
    const lang = getActiveLang(profile?.language)
    setCurrentLang(lang)
    setScreen('loading')

    const msgs = [
      hasFiles ? `${uploadedFiles.length} dosya analiz ediliyor...` : 'Profilin analiz ediliyor...',
      'Müfredat kontrol ediliyor...',
      `${difficulty.toUpperCase()} zorlukta sorular oluşturuluyor...`,
      includeVisuals ? 'Görsel içerikler hazırlanıyor...' : 'Şıklar karıştırılıyor...',
      'Son kontroller...',
    ]
    let mi = 0
    const iv = setInterval(() => { mi = (mi + 1) % msgs.length; setLoadMsg(msgs[mi]) }, 1000)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          topic, questionCount: qCount, difficulty, language: lang,
          fileContent: combinedContent || undefined,
          fileType: uploadedFiles[0]?.fileType || undefined,
          includeVisuals,
          questionType,
        }),
      })
      const data = await res.json()
      clearInterval(iv)

      if (res.status === 429 && data.error === 'limit_reached') {
        setScreen('limit')
        return
      }

      if (res.status === 429 && data.error === 'daily_limit_reached') {
        setScreen('topic')
        setShowPaywall('daily')
        return
      }

      if (res.status === 403 && data.error === 'out_of_curriculum') {
        setScreen('topic')
        setShowPaywall('topic')
        return
      }

      if (!res.ok) {
        if (data.error === 'pdf_too_long' || data.error === 'pdf_image_only' || data.error === 'pdf_error') {
          clearInterval(iv)
          setLoadMsg('__PDF_ERROR__:' + (data.message || 'PDF işlenemedi.'))
          setTimeout(() => setScreen('topic'), 8000)
          return
        }
        const errInfo = getErrorInfo(data.error || 'unknown', res.status)
        setQuizError(errInfo)
        setScreen('error')
        clearInterval(iv)
        return
      }

      fetchProfile()
      setQuestions(data.questions)
      setSessionId(data.sessionId)
      setCurrent(0); setAnswers([]); answersRef.current = []; setChosen(null); setCheckingAnswer(false)
      setScreen('quiz')
    } catch (e: any) {
      clearInterval(iv)
      const errCode = e?.message || 'unknown'
      const errInfo = getErrorInfo(errCode)
      setQuizError(errInfo)
      setScreen('error')
    }
  }

  function retryWrong(wrongQuestions: Question[]) {
    setQuestions(wrongQuestions)
    setCurrent(0)
    setAnswers([])
    answersRef.current = []
    setChosen(null)
    setSessionId(null)
    setScreen('quiz')
  }

  function choose(idx: number) {
    if (chosen !== null) return
    setChosen(idx)
    const q = questions[current]
    let correct = false
    if (q.type === 'true_false') {
      correct = idx === q.ans
    } else if (q.type === 'fill_blank' || q.type === 'short_answer') {
      correct = idx === q.ans // AI puanladıysa ans=0 doğru demek
    } else {
      correct = idx === q.ans
    }
    setAnswers(prev => {
      const next = [...prev, { userAns: idx, correct }]
      answersRef.current = next
      return next
    })
  }

  const [shortInput, setShortInput] = useState('')
  const [matchSelections, setMatchSelections] = useState<Record<number, number>>({})
  const [orderItems, setOrderItems] = useState<string[]>([])
  const [fillInput, setFillInput] = useState('')
  const [checkingAnswer, setCheckingAnswer] = useState(false)
  const [orderAnswer, setOrderAnswer] = useState<string[]>([])
  const [matchAnswer, setMatchAnswer] = useState<Record<number, number>>({})
  const [multiTFAnswer, setMultiTFAnswer] = useState<Record<number, boolean | null>>({})
  const [tableFillAnswer, setTableFillAnswer] = useState<string[]>([])
  const [mTFAnswers, setMTFAnswers] = useState<Record<number, boolean | null>>({})
  const [tInputs, setTInputs] = useState<string[]>([])

  // Levenshtein distance — yazım hatası toleransı
  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    const dp: number[][] = Array.from({length: m+1}, (_, i) => [i, ...Array(n).fill(0)])
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    return dp[m][n]
  }

  function isSimilarEnough(user: string, correct: string): boolean {
    const u = user.toLowerCase().trim()
    const c = correct.toLowerCase().trim()
    if (!u || !c) return false
    // Tam eşleşme
    if (u === c) return true
    // İçerme
    if (c.includes(u) || u.includes(c)) return true
    // Kelime bazlı — herhangi bir anahtar kelime eşleşirse
    const cWords = c.split(/\s+/).filter(w => w.length > 3)
    const uWords = u.split(/\s+/).filter(w => w.length > 3)
    if (cWords.some(w => u.includes(w)) || uWords.some(w => c.includes(w))) return true
    // Yazım hatası toleransı — kısa kelimelerde 1, uzunlarda 2 harf farkı kabul et
    const maxDist = Math.max(1, Math.floor(Math.min(u.length, c.length) / 5))
    if (levenshtein(u, c) <= maxDist) return true
    // Her kelimeyi ayrı karşılaştır
    for (const uw of uWords) {
      for (const cw of cWords) {
        const dist = levenshtein(uw, cw)
        if (dist <= Math.max(1, Math.floor(Math.min(uw.length, cw.length) / 4))) return true
      }
    }
    return false
  }

  async function submitShortAnswer() {
    if (!fillInput.trim() && !shortInput.trim()) return
    if (checkingAnswer) return // ✅ Çift submit önle
    const q = questions[current]
    const userText = (fillInput || shortInput).trim()
    const correctAnswer = q.blank || q.opts?.[q.ans] || ''
    let correct = false

    setCheckingAnswer(true) // ✅ Butonu kilitle

    if (isSimilarEnough(userText, correctAnswer)) {
      correct = true
    } else {
      // AI ile semantik kontrol
      try {
        const { data: { session: ckSession } } = await supabase.auth.getSession()
        const res = await fetch('/api/check-answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ckSession?.access_token}`,
          },
          body: JSON.stringify({
            question: q.q,
            correctAnswer,
            userAnswer: userText,
            language: currentLang,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          correct = data.correct === true
        }
      } catch { /* fallback */ }
    }

    setChosen(correct ? q.ans : -1)
    setAnswers(prev => {
      const next = [...prev, { userAns: correct ? q.ans : -1, correct }]
      answersRef.current = next
      return next
    })
    setCheckingAnswer(false) // ✅ Kilidi aç
  }

  function submitMatching() {
    const q = questions[current]
    const pairs = q.pairs || []

    // Check if right values are unique (proper matching) or repeated (D/Y style)
    const rightValues = pairs.map((p: any) => p.right)
    const uniqueRights = new Set(rightValues)
    const isProperMatching = uniqueRights.size === pairs.length

    let correctCount = 0

    if (isProperMatching) {
      // Standard: shuffledIndexMap[userSelection] must equal original pair index
      pairs.forEach((_: any, i: number) => {
        const userShuffledIdx = matchSelections[i]
        if (userShuffledIdx !== undefined && shuffledIndexMap[userShuffledIdx] === i) correctCount++
      })
    } else {
      // Repeated values (e.g. True/False): match by text content directly
      pairs.forEach((pair: any, i: number) => {
        const userShuffledIdx = matchSelections[i]
        if (userShuffledIdx !== undefined) {
          const selectedText = shuffledPairs[userShuffledIdx]
          if (selectedText === pair.right) correctCount++
        }
      })
    }

    const correct = correctCount === pairs.length
    setChosen(correct ? q.ans : -1)
    setAnswers(prev => {
      const next = [...prev, { userAns: correct ? q.ans : -1, correct }]
      answersRef.current = next
      return next
    })
  }

  function submitOrdering() {
    const q = questions[current]
    const items = q.items || []
    const correct = orderItems.every((item, i) => item === items[q.correctOrder?.[i] ?? i])
    setChosen(correct ? 0 : -1)
    setAnswers(prev => {
      const next = [...prev, { userAns: correct ? 0 : -1, correct }]
      answersRef.current = next
      return next
    })
  }

  function moveItem(from: number, to: number) {
    setOrderItems(prev => {
      const arr = [...prev]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }

  const [shuffledPairs, setShuffledPairs] = useState<string[]>([])

  // Reset type-specific state on question change
  useEffect(() => {
    const q = questions[current]
    if (!q) return
    setFillInput('')
    setShortInput('')
    setMatchSelections({})
    setMTFAnswers({})
    setTInputs(Array(
      q.tableData?.rows?.reduce((s: number, r: any) => s + (r.blanks?.length || 0), 0) || 0
    ).fill(''))
    if (q.items) setOrderItems([...q.items].sort(() => Math.random() - 0.5))
    if (q.pairs) {
      const rights = q.pairs.map((p: any, i: number) => ({ text: p.right, originalIndex: i }))
      const shuffled = [...rights].sort(() => Math.random() - 0.5)
      setShuffledPairs(shuffled.map((s: any) => s.text))
      setShuffledIndexMap(shuffled.map((s: any) => s.originalIndex))
    }
  }, [current, questions])

  const [shuffledIndexMap, setShuffledIndexMap] = useState<number[]>([])

  async function next() {
    if (current + 1 >= questions.length) {
      // ✅ Çift tıklama / çift tetiklenme koruması
      if (isSavingRef.current) return
      isSavingRef.current = true
      // Son sorunun correct değerini answers array'inden al
      // answers state async — son eklenen correct field'ını kullan
      // ✅ answersRef: React state async sorunundan bağımsız, her zaman güncel
      const finalAnswers = answersRef.current
      const score = finalAnswers.filter(a => a.correct).length
      console.log('[quiz] finish: finalAnswers.length=', finalAnswers.length, 'score=', score, 'questions=', questions.length)

      // getUser() ile userId al — getSession().user güvenilmez
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()

      if (sessionId && currentUser?.id) {
        try {
          const saveRes = await fetch('/api/save-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ sessionId, answers: finalAnswers, score }),
          })
          if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}))
            console.error('[save-quiz] failed:', saveRes.status, err)
          } else {
            console.log('[save-quiz] success')
          }
        } catch (e) {
          console.error('[save-quiz] fetch error:', e)
        }
      } else {
        console.warn('[save-quiz] skipped — sessionId:', sessionId, 'userId:', currentUser?.id)
      }

      // Save assignment completion if this was an assignment
      if (assignmentId) {
        const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Cevapları öğretmen analizi için zenginleştir (soru metni + doğru cevap dahil)
          const enrichedAnswers = finalAnswers.map((a, i) => {
            const q = questions[i]
            if (!q) return a
            const correctAnswerText = q.opts?.[q.ans] ?? q.blank ?? ''
            const studentAnswerText = a.userAns !== -1 ? (q.opts?.[a.userAns] ?? '') : '(Boş)'
            return {
              correct: a.correct,
              question: q.q,
              student_answer: studentAnswerText,
              correct_answer: correctAnswerText,
              explanation: q.exp ?? '',
            }
          })
          await supabase.from('assignment_completions').upsert({
            assignment_id: assignmentId,
            student_id: user.id,
            session_id: sessionId,
            score,
            pct,
            answers: enrichedAnswers,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'assignment_id,student_id' })
        }
      }
      // YouTube linkleri cek
      const topic = customTopic.trim() || selectedTopic
      try {
        const ytRes = await fetch('/api/youtube-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ topics: [topic] }),
        })
        const ytData = await ytRes.json()
        if (ytData.links) setYoutubeLinks(ytData.links)
      } catch { /* YouTube linki olmasa da devam et */ }
      isSavingRef.current = false
      setScreen('result')
    } else { setCurrent(c => c + 1); setChosen(null) }
  }

  const level = profile ? getLevel(profile.grade) : 'ortaokul'
  const suggestions = TOPIC_MAP[level] || TOPIC_MAP.ortaokul
  const plan = profile?.plan || 'free'
  const dailyLimit = PLAN_DAILY_LIMIT[plan] ?? 10
  const maxQCount = PLAN_MAX_QCOUNT[plan] ?? 5
  const today = new Date().toISOString().split('T')[0]
  const dailyUsed = profile?.daily_test_date === today ? (profile?.daily_test_count || 0) : 0
  const dailyLeft = plan === 'unlimited' ? null : Math.max(0, dailyLimit - dailyUsed)
  const testsLeft = profile?.plan === 'free' ? Math.max(0, 10 - (profile?.monthly_test_count || 0)) : null
  const activeDiff = DIFFICULTIES.find(d => d.value === difficulty)!

  // ── PAYWALL MODAL ──
  const PaywallModal = ({ reason }: { reason: 'qcount' | 'daily' | 'topic' }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div className="card anim-up" style={{ maxWidth: '460px', width: '100%', position: 'relative' }}>
        <button onClick={() => setShowPaywall(null)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text3)' }}>✕</button>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '0.75rem' }}>
            {reason === 'qcount' ? '🎯' : reason === 'daily' ? '⏰' : '🔒'}
          </div>
          <h3 className="serif" style={{ fontSize: '22px', marginBottom: '0.5rem' }}>
            {reason === 'qcount' ? 'Daha fazla soru için Premium' :
             reason === 'daily' ? 'Günlük test limitin doldu' :
             'Bu konu müfredat dışı'}
          </h3>
          <p style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: 1.7 }}>
            {reason === 'qcount' ? 'Ücretsiz planda en fazla 5 soru oluşturabilirsin. Premium veya Unlimited üyelikle 20 soruya kadar test oluştur.' :
             reason === 'daily' ? `Bugün ${dailyLimit} test hakkını kullandın. Yarın yenilenir ya da Unlimited'a geç.` :
             'Bu konu Türkiye Millî Eğitim müfredatında bulunmuyor. Unlimited planda müfredat dışı konularda da test oluşturabilirsin.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { plan: 'Freemium', price: 'Ücretsiz', features: ['5 soru/test', 'Günde 10 test', 'Sadece müfredat konuları'], color: '#64748b', highlight: false },
            { plan: 'Premium', price: '600₺/yıl', features: ['20 soru/test', 'Günde 25 test', 'Tüm konular', 'Koç desteği yok'], color: '#2563eb', highlight: false },
            { plan: 'Unlimited', price: '6.000₺/yıl', features: ['20 soru/test', 'Sınırsız test', 'Müfredat dışı konular', '12× koça danışma'], color: 'var(--accent)', highlight: true },
          ].map(p => (
            <div key={p.plan} style={{ padding: '14px 16px', borderRadius: '12px', border: `2px solid ${p.highlight ? p.color : 'var(--border)'}`, background: p.highlight ? 'var(--accent-bg)' : 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, color: p.color, fontSize: '14px' }}>{p.plan} {p.highlight && '⭐'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{p.features.join(' · ')}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: p.color }}>{p.price}</div>
                {p.plan !== 'Freemium' && (
                  <a href="/pricing" style={{ fontSize: '11px', color: p.color, textDecoration: 'none', fontWeight: 600 }}>Satın al →</a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── LIMIT ──
  if (screen === 'limit') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', paddingBottom: '5rem', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '460px', textAlign: 'center' }} className="anim-up">
        <div style={{ fontSize: '56px', marginBottom: '1.25rem' }}>📚</div>
        <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>Bu ayki test hakkın doldu</h2>
        <p style={{ color: 'var(--text2)', fontSize: '15px', marginBottom: '2rem', lineHeight: 1.7 }}>
          Ücretsiz planda ayda <strong>10 test</strong> hakkın var.<br />
          Sınırsız test için Premium'a geç veya <strong>10 arkadaşını davet ederek</strong> 1 yıl ücretsiz premium kazan.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px', margin: '0 auto' }}>
          <Link href="/pricing" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
            💎 Premium'a geç
          </Link>
          <Link href="/pricing#referral" className="btn btn-lg" style={{ justifyContent: 'center' }}>
            🎁 Arkadaşını davet et (ücretsiz)
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={() => setScreen('topic')}>
            ← Geri dön
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '1.5rem' }}>
          Ay başında (her ayın 1'i) test hakkın otomatik sıfırlanır.
        </p>
      </div>
    </main>
  )

  // ── TOPIC ── (QuizSetup component'e delege edildi)
  if (screen === 'topic') return (
    <>
      {showOnboarding && profile && (
        <OnboardingModal
          userName={profile.name}
          grade={profile.grade}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
      <QuizSetup
        profile={profile}
        currentLang={currentLang}
        selectedTopic={selectedTopic}
        setSelectedTopic={setSelectedTopic}
        customTopic={customTopic}
        setCustomTopic={setCustomTopic}
        qCount={qCount}
        setQCount={setQCount}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        includeVisuals={includeVisuals}
        setIncludeVisuals={setIncludeVisuals}
        questionType={questionType}
        setQuestionType={setQuestionType}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        favorites={favorites}
        mebTopics={mebTopics}
        topicSummary={topicSummary}
        summaryLoading={summaryLoading}
        showSummary={showSummary}
        setShowSummary={setShowSummary}
        onFetchSummary={fetchTopicSummary}
        onToggleFavorite={toggleFavorite}
        onStartQuiz={startQuiz}
        testsLeft={testsLeft}
        dailyLeft={dailyLeft}
        maxQCount={maxQCount}
      />
    </>
  )
  if (screen === 'error' && quizError) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }} className="anim-up">
        {/* Hata ikonu */}
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>
          {quizError.code === 'daily_limit' || quizError.code === 'monthly_limit' ? '⏰' :
           quizError.code === 'curriculum' ? '📖' :
           quizError.code === 'pdf' ? '📄' :
           quizError.code === 'server' || quizError.code === 'timeout' ? '🔧' : '❌'}
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem' }}>
          {quizError.title}
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          {quizError.desc}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '320px', margin: '0 auto' }}>
          {/* Retry butonu */}
          {quizError.retry && retryCount < 1 && (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                setRetryCount(r => r + 1)
                setQuizError(null)
                setScreen('loading')
                startQuiz()
              }}
              style={{ justifyContent: 'center' }}>
              🔄 Tekrar dene
            </button>
          )}

          {/* Plana göre CTA */}
          {(quizError.code === 'daily_limit' || quizError.code === 'monthly_limit') && (
            <a href="/pricing" className="btn btn-primary btn-lg" style={{ justifyContent: 'center', textDecoration: 'none' }}>
              💎 Premium'a geç
            </a>
          )}

          {quizError.code === 'curriculum' && (
            <a href="/pricing" className="btn btn-lg" style={{ justifyContent: 'center', textDecoration: 'none' }}>
              🔓 Tüm konular için Premium
            </a>
          )}

          {/* Geri dön */}
          <button
            className="btn btn-ghost"
            onClick={() => { setQuizError(null); setRetryCount(0); setScreen('topic') }}
            style={{ justifyContent: 'center' }}>
            ← Farklı konu seç
          </button>

          {/* Hata bildir */}
          {(quizError.code === 'unknown' || quizError.code === 'ai_error' || quizError.code === 'server') && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const msg = encodeURIComponent(`Hata kodu: ${quizError.code}\nKonu: ${customTopic || selectedTopic}\nHata: ${quizError.title}`)
                window.open(`mailto:destek@pratium.com?subject=Hata Bildirimi&body=${msg}`)
              }}
              style={{ justifyContent: 'center', color: 'var(--text3)', fontSize: '12px' }}>
              📧 Hatayı bildir
            </button>
          )}
        </div>

        {/* Tekrar deneme geçmişi */}
        {retryCount >= 1 && quizError.retry && (
          <div style={{ marginTop: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', fontSize: '12px', color: '#92400e' }}>
            ⚠️ Bir kez daha denendi ama başarısız oldu. Lütfen daha sonra tekrar dene veya hatayı bildir.
          </div>
        )}
      </div>
    </main>
  )

  // ── LOADING ──
  if (screen === 'loading') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
      <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient)', margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-accent)' }}>
          <div className="spinner" style={{ width: 28, height: 28, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
        </div>
        <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '0.4rem' }}>Sorular hazırlanıyor...</div>
        {loadMsg.startsWith('__PDF_ERROR__:') ? (
          <div style={{ marginTop: '1rem', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '12px', padding: '16px', textAlign: 'left', maxWidth: '320px' }}>
            <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: '8px', fontSize: '13px' }}>⚠️ PDF Yüklenemedi</div>
            <div style={{ color: 'var(--text2)', fontSize: '12px', lineHeight: 1.6, marginBottom: '10px' }}>
              {loadMsg.replace('__PDF_ERROR__:', '')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.7, marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text2)' }}>Çözüm önerileri:</strong><br/>
              • PDF'i Word dosyasına çevir, tekrar yükle<br/>
              • Büyük PDF'i 50 sayfalık parçalara böl<br/>
              • Metni kopyalayıp konu kutusuna yapıştır
            </div>
            <a href="https://bigconvert.11zon.com/" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '8px', background: '#082465', color: '#fff', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
              🔄 Ücretsiz PDF Dönüştür / Küçült →
            </a>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{loadMsg}</div>
        )}
      </div>
    </main>
  )

  // ── QUIZ ── (QuizQuestion component'e delege edildi)
  if (screen === 'quiz' && questions.length > 0) {
    return (
      <QuizQuestion
        questions={questions}
        current={current}
        answers={answers}
        difficulty={difficulty}
        currentLang={currentLang}
        checkingAnswer={checkingAnswer}
        fillInput={fillInput}
        shortInput={shortInput}
        chosen={chosen}
        orderAnswer={orderAnswer}
        matchAnswer={matchAnswer}
        multiTFAnswer={multiTFAnswer}
        tableFillAnswer={tableFillAnswer}
        onSelectAnswer={choose}
        onFillSubmit={submitShortAnswer}
        onNext={next}
        setFillInput={setFillInput}
        setShortInput={setShortInput}
        setOrderAnswer={setOrderAnswer}
        setMatchAnswer={setMatchAnswer}
        setMultiTFAnswer={setMultiTFAnswer}
        setTableFillAnswer={setTableFillAnswer}
        onFinish={() => setScreen('result')}
        shuffledPairs={shuffledPairs}
        shuffledIndexMap={shuffledIndexMap}
      />
    )
  }
  if (screen === 'result') {
    const topic = customTopic.trim() || selectedTopic
    return (
      <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <QuizResult
            questions={questions}
            answers={answers}
            topic={topic}
            difficulty={difficulty}
            language={currentLang}
            youtubeLinks={youtubeLinks}
            onNewTest={() => { setScreen('topic'); setSelectedTopic(''); setCustomTopic('') }}
            onRetryWrong={retryWrong}
          />
        </div>
      </main>
    )
  }
  return null
}

export default function QuizPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <QuizPageContent />
    </Suspense>
  )
}