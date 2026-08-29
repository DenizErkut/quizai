'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import OnboardingModal from '@/components/OnboardingModal'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveName } from '@/lib/identity/resolve-client'
import FileUploader, { type UploadedFile } from '@/components/FileUploader'
import QuizResult from '@/components/QuizResult'
import QuizSetup from '@/components/quiz/QuizSetup'
import QuizQuestion from '@/components/quiz/QuizQuestion'
import { SUBJECT_MAP } from '@/lib/subject-map'
import { nextChunkDifficulty, shouldShowIntervention, type DifficultyValue } from '@/lib/adaptive-difficulty'

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
  passage?: string        // kaynak metin (MEB/dosya) — öğrenciye gösterilir
}
interface Profile { name: string; grade: string; language: string; plan: string; monthly_test_count: number; daily_test_count?: number; daily_test_date?: string; onboarding_completed?: boolean }

// MEB müfredatına göre ders ve konu haritası (bkz. lib/subject-map.ts)

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

// 29 Ağustos 2026 — Deniz'in "ne eksik ne fazla" talebiyle eklendi: backend
// (generate-quiz/route.ts) artık kendi içinde 4 tur tamamlama deniyor ama
// nadir uç durumlarda (ör. çok az MEB kaynağı olan bir konu, ya da zaman
// bütçesi dolduğu için erken kesilmesi) yine de eksik dönebilir. Bu, o son
// güvenlik ağı: sunucudan istenenden AZ soru dönerse, İSTEMCİ TARAFINDA da
// (aynı sessionId'ye continueSessionId ile eklenerek — kota/oturum
// tekrarına yol AÇMADAN) eksik kalan miktar için sınırlı sayıda (en fazla 2)
// ek istek daha atılır. İlerleme olmazsa (0 yeni soru dönerse) döngü hemen
// durur — sonsuz bekleme riski yok.
async function fetchQuizTopup(params: {
  topic: string
  subject?: string
  language: string
  questionType: string
  includeVisuals: boolean
  sessionId: string
  missing: number
  existingTexts: string[]
  accessToken?: string
}): Promise<any[]> {
  try {
    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.accessToken}` },
      body: JSON.stringify({
        topic: params.topic,
        questionCount: params.missing,
        difficulty: 'auto',
        language: params.language,
        questionType: params.questionType,
        includeVisuals: params.includeVisuals,
        subject: params.subject || undefined,
        unit: params.topic || undefined,
        continueSessionId: params.sessionId, // kota/yeni-session tekrarını önler
        excludeQuestionTexts: params.existingTexts,
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.questions) ? data.questions : []
  } catch {
    return []
  }
}

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
  // 17 Ağustos 2026: eski "openSubject" burada tanımlıydı ama HİÇBİR YERDE
  // set edilmiyordu (components/quiz/QuizSetup.tsx'in KENDİ ayrı/yerel
  // openSubject'i vardı, akordiyon durumunu yönetiyordu, page.tsx'e hiç
  // aktarılmıyordu) -- yani subject BİLGİSİ HER ZAMAN undefined
  // gönderiliyordu, İngilizce dersinde AI'ın konu dışına (Türkçe okuma-
  // anlama sorularına) kaymasına yol açan kök nedenlerden biriydi.
  // Artık QuizSetup, konu seçildiği ANDA (akordiyon kapanmadan HEMEN
  // ÖNCE) doğru ders adını buraya "yukarı taşıyor" (state lifting).
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
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
        const userGrade = profile?.grade || '' // örn: "ortaokul 6. sınıf"
        // Kullanıcının tam sınıf numarasını çıkar
        const userGradeNum = (userGrade.match(/\d+/) || [])[0] || ''
        const userLevel = userGrade.toLowerCase().includes('lise') ? 'lise'
          : userGrade.toLowerCase().includes('ortaokul') ? 'ortaokul'
          : userGrade.toLowerCase().includes('ilkokul') ? 'ilkokul'
          : 'universite'

        const subjects = (data.curriculum || [])
          .filter((c: any) => {
            if (!c.is_active) return false
            // Level eşleşmeli
            if (c.level !== userLevel) return false
            // Sınıf numarası tam eşleşmeli (örn: "6. sınıf" → "6")
            const cGradeNum = (c.grade.match(/\d+/) || [])[0] || ''
            return cGradeNum === userGradeNum
          })
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
  const [answers, setAnswers] = useState<{ userAns: number; correct: boolean; timeMs?: number }[]>([])
  // ── Adaptif Test Motoru (Faz 2) ──
  // chunkBoundary: ilk parçanın kaç sorudan oluştuğu (null = adaptif değil
  // veya ikinci parça zaten getirilmiş). resolvedDifficulty: sunucunun
  // (mastery skoruna göre) seçtiği o anki zorluk — bir sonraki parça için
  // referans noktası. showIntervention/interventionInfo: aynı soru tipinde
  // art arda 2 yanlış yapıldığında gösterilen öğretici ara ekran.
  const [chunkBoundary, setChunkBoundary] = useState<number | null>(null)
  const [resolvedDifficulty, setResolvedDifficulty] = useState<DifficultyValue>('normal')
  const [fetchingNextChunk, setFetchingNextChunk] = useState(false)
  const [showIntervention, setShowIntervention] = useState(false)
  const [interventionInfo, setInterventionInfo] = useState<{ exp: string; typeLabel: string } | null>(null)
  // ✅ answersRef: save-quiz için her zaman güncel değeri tut (React state async sorununu çözer)
  const answersRef = useRef<{ userAns: number; correct: boolean; timeMs?: number }[]>([])
  // Faz 11 (kalan tahmin modeli — uygun çalışma süresi): her soru
  // gösterildiğinde bu referans güncellenir, cevap gönderilirken
  // "bu soruda ne kadar zaman geçirildi" hesaplanabilsin diye. Tek bir
  // useEffect ile güncelleniyor — 4 ayrı cevap işleyicisinin (çoktan
  // seçmeli/doğru-yanlış, boşluk doldurma, eşleştirme, sıralama) her
  // biri aynı referansı okur, kopya zamanlama mantığı yazılmaz.
  const questionShownAtRef = useRef<number>(Date.now())
  useEffect(() => {
    questionShownAtRef.current = Date.now()
  }, [current, questions.length])
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
      .from('profiles').select('grade,language,plan,monthly_test_count,daily_test_count,daily_test_date,onboarding_completed')
      .eq('id', user.id).single()
    // İsim artik profiles'ta degil, TR-PG kimliginde — resolve ile cekilir
    const displayName = await resolveName(supabase, user.id)
    // NOT: 'age' kolonu profiles tablosunda yok (bkz. profile/page.tsx içindeki not).
    // Önceden buradaki select 'age' istediği için Supabase 400 döndürüyor, data null
    // kalıyor ve kullanıcı /quiz <-> /profile arasında sonsuz döngüye giriyordu.
    if (!data || !data.grade || !displayName) { router.push('/profile'); return null }
    const lang = getActiveLang(data.language)
    setProfile({ ...data, name: displayName, language: lang })
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
            subject: selectedSubject || undefined,
            unit: topicDecoded || undefined,
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
      'Senin seviyene uygun sorular hazırlanıyor...',
      includeVisuals ? 'Görsel içerikler hazırlanıyor...' : 'Şıklar karıştırılıyor...',
      'Son kontroller...',
    ]
    let mi = 0
    const iv = setInterval(() => { mi = (mi + 1) % msgs.length; setLoadMsg(msgs[mi]) }, 1000)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      // Adaptif Test Motoru: kullanıcıya zorluk sorulmuyor. İlk parça,
      // sunucunun bu konudaki mastery skoruna göre seçtiği zorlukla
      // ('auto') üretilir. qCount yeterince büyükse (>=4) test 2 parçaya
      // bölünür — ikinci parçanın zorluğu, ilk parçadaki performansa göre
      // next() içinde ayarlanır (bkz. lib/adaptive-difficulty.ts).
      const isAdaptiveEligible = qCount >= 4
      const firstChunkSize = isAdaptiveEligible ? Math.ceil(qCount / 2) : qCount

      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          topic, questionCount: firstChunkSize, difficulty: 'auto', language: lang,
          fileContent: combinedContent || undefined,
          fileType: uploadedFiles[0]?.fileType || undefined,
          includeVisuals,
          questionType,
          subject: selectedSubject || undefined,
          unit: topic || undefined,
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
      // ÖNEMLİ: chunkBoundary, İSTENEN soru sayısına (firstChunkSize) değil
      // GERÇEKTEN DÖNEN dizi uzunluğuna göre ayarlanmalı — sunucu tarafında
      // bir soru filtrelenirse (ör. kaynak-kitap-metadata güvenlik ağı,
      // bkz. generate-quiz/route.ts) dönen dizi istenenden kısa olabilir.
      // Eskiden firstChunkSize kullanılıyordu; bu durumda "current+1===
      // chunkBoundary" tetikleyicisi hiç ateşlenmeden "current+1>=
      // questions.length" (bitti) kontrolü önce tetiklenip quiz ikinci
      // parça hiç getirilmeden erken bitiyordu.
      //
      // 29 Ağustos 2026 — istemci-taraflı son güvenlik ağı: backend kendi
      // içinde 4 tur dener ama yine de kısa dönebilir. Burada, dönen sayı
      // bu parçanın hedefinden (firstChunkSize) azsa, AYNI session'a
      // (continueSessionId ile — kota tekrar SAYILMAZ) en fazla 2 ek istek
      // daha atılır. Eskiden actualFirstChunkLen<2 durumunda adaptif akış
      // TAMAMEN terk edilip (chunkBoundary=null) ikinci parça HİÇ
      // getirilmiyordu — bu da testi sessizce çok kısa bitiriyordu; artık
      // bu döngü sayesinde o uç durum da telafi ediliyor.
      let collected: any[] = Array.isArray(data.questions) ? data.questions : []
      if (collected.length < firstChunkSize && data.sessionId) {
        let topupAttempts = 0
        while (collected.length < firstChunkSize && topupAttempts < 2) {
          topupAttempts++
          const { data: { session: freshSession } } = await supabase.auth.getSession()
          const extra = await fetchQuizTopup({
            topic, subject: selectedSubject || undefined, language: lang, questionType, includeVisuals,
            sessionId: data.sessionId, missing: firstChunkSize - collected.length,
            existingTexts: collected.map((q: any) => q.q).filter(Boolean),
            accessToken: freshSession?.access_token,
          })
          if (extra.length === 0) break // ilerleme yok, tekrar denemenin faydası yok
          collected = [...collected, ...extra].slice(0, firstChunkSize)
        }
      }
      setQuestions(collected)
      setSessionId(data.sessionId)
      setResolvedDifficulty((data.resolvedDifficulty || 'normal') as DifficultyValue)
      setDifficulty(data.resolvedDifficulty || 'normal') // QuizQuestion'a giden gösterim rozeti bununla senkron kalsın
      const actualFirstChunkLen = collected.length
      setChunkBoundary(isAdaptiveEligible && actualFirstChunkLen >= 2 ? actualFirstChunkLen : null)
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
    setChunkBoundary(null) // yanlışları tekrar çözme adaptif değil, sabit bir set
    setShowIntervention(false)
    setInterventionInfo(null)
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
      const nextArr = [...prev, { userAns: idx, correct, timeMs: Date.now() - questionShownAtRef.current }]
      answersRef.current = nextArr

      // Öğretici müdahale tespiti (Faz 2): son 2 cevap AYNI soru tipinde
      // ve ikisi de yanlışsa, "İleri" butonunun bir sonraki basışında
      // normal ilerleme yerine kısa bir öğretici ara ekran gösterilir.
      if (current >= 1) {
        const recentTypes = [questions[current - 1]?.type, q.type]
        const recentAnswers = nextArr.slice(-2)
        if (shouldShowIntervention(recentAnswers, recentTypes)) {
          const typeLabels: Record<string, string> = {
            multiple_choice: 'çoktan seçmeli', fill_blank: 'boşluk doldurma', true_false: 'doğru/yanlış',
            multi_true_false: 'çoklu doğru/yanlış', matching: 'eşleştirme', table_fill: 'tablo doldurma',
            short_answer: 'kısa cevap', ordering: 'sıralama',
          }
          setInterventionInfo({
            exp: q.exp || questions[current - 1]?.exp || '',
            typeLabel: typeLabels[q.type] || q.type,
          })
          setShowIntervention(true)
        }
      }

      return nextArr
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
      const next = [...prev, { userAns: correct ? q.ans : -1, correct, timeMs: Date.now() - questionShownAtRef.current }]
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
      const next = [...prev, { userAns: correct ? q.ans : -1, correct, timeMs: Date.now() - questionShownAtRef.current }]
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
      const next = [...prev, { userAns: correct ? 0 : -1, correct, timeMs: Date.now() - questionShownAtRef.current }]
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
    // Öğretici müdahale ekranı gösteriliyorsa: "İleri"nin bu basışı sadece
    // kartı kapatır, henüz ilerlemez. Kullanıcı bir daha basınca normal
    // akış devam eder.
    if (showIntervention) {
      setShowIntervention(false)
      setInterventionInfo(null)
      return
    }

    // Adaptif Test Motoru — chunk sınırı: ilk parçanın son sorusundan sonra
    // (henüz questions.length'e ikinci parça eklenmediği için current+1,
    // "bitti" kontrolüyle aynı görünür — bu yüzden BU kontrol ondan ÖNCE
    // çalışmalı). İkinci parça, ilk parçadaki performansa göre ayarlanmış
    // zorlukla getirilip mevcut soru listesine eklenir.
    if (chunkBoundary !== null && current + 1 === chunkBoundary) {
      setFetchingNextChunk(true)
      try {
        const chunk1Answers = answersRef.current.slice(0, chunkBoundary)
        const nextDiff = nextChunkDifficulty(resolvedDifficulty, chunk1Answers)
        const excludeTexts = questions.slice(0, chunkBoundary).map(q => q.q).filter(Boolean)
        const topic = customTopic.trim() || selectedTopic
        const targetSecondChunk = qCount - chunkBoundary
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/generate-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            topic,
            questionCount: targetSecondChunk,
            difficulty: nextDiff,
            language: currentLang,
            questionType,
            includeVisuals,
            continueSessionId: sessionId,
            subject: selectedSubject || undefined,
            excludeQuestionTexts: excludeTexts,
          }),
        })
        let secondChunk: any[] = []
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.questions)) secondChunk = data.questions
        }
        // 29 Ağustos 2026 — istemci-taraflı son güvenlik ağı: chunk 2 de
        // istenenden az dönebilir (ya da fetch tamamen başarısız olabilir —
        // res.ok false). Eskiden bu durumda sessizce "test istenenden kısa
        // biter" diye pes ediliyordu. Artık aynı sessionId'ye (kota tekrar
        // SAYILMAZ) en fazla 2 ek istek daha atılıp hedefe (targetSecondChunk)
        // ulaşılmaya çalışılıyor.
        if (secondChunk.length < targetSecondChunk && sessionId) {
          let topupAttempts = 0
          while (secondChunk.length < targetSecondChunk && topupAttempts < 2) {
            topupAttempts++
            const { data: { session: freshSession } } = await supabase.auth.getSession()
            const extra = await fetchQuizTopup({
              topic, subject: selectedSubject || undefined, language: currentLang, questionType, includeVisuals,
              sessionId, missing: targetSecondChunk - secondChunk.length,
              existingTexts: [...excludeTexts, ...secondChunk.map((q: any) => q.q).filter(Boolean)],
              accessToken: freshSession?.access_token,
            })
            if (extra.length === 0) break
            secondChunk = [...secondChunk, ...extra].slice(0, targetSecondChunk)
          }
        }
        if (secondChunk.length > 0) {
          setQuestions(prev => [...prev, ...secondChunk])
          setResolvedDifficulty(nextDiff)
          setDifficulty(nextDiff) // gösterim rozeti senkron kalsın
        }
      } catch {
        // İkinci parça tamamen getirilemezse (ağ hatası vb.) mevcut
        // sorularla devam edilir — bu artık son çare, çünkü yukarıdaki
        // güvenlik ağı normal şartlarda hedefe ulaşmayı garantiliyor.
      }
      setFetchingNextChunk(false)
      setChunkBoundary(null) // tek geçişlik — bu v1'de sadece 2 parça var
      setCurrent(c => c + 1); setChosen(null)
      return
    }

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
            { plan: 'Premium', price: '1.200₺/yıl', features: ['20 soru/test', 'Sınırsız test', 'Tüm konular', 'Koç desteği yok'], color: '#2563eb', highlight: false },
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
        dynamicSubjects={dynamicSubjects}
        selectedSubject={selectedSubject}
        setSelectedSubject={setSelectedSubject}
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
                window.open(`mailto:destek@pratium.com.tr?subject=Hata Bildirimi&body=${msg}`)
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
    // Adaptif Test Motoru: bir sonraki parça (performansa göre ayarlanmış
    // zorlukla) getirilirken kısa bir bekleme ekranı — chunk boyutları
    // küçük olduğu için (Haiku ile) genelde çok kısa sürer.
    if (fetchingNextChunk) {
      return (
        <main style={{ maxWidth: '520px', margin: '0 auto', padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ padding: '48px 24px', borderRadius: '16px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
            <div style={{ fontSize: '14px', color: 'var(--text2)' }}>Sıradaki sorular hazırlanıyor...</div>
          </div>
        </main>
      )
    }

    // Öğretici müdahale: son 2 cevap aynı soru tipinde ve ikisi de yanlışsa,
    // yeni bir soruya geçmeden önce kısa bir ara ekran gösterilir. "İleri"
    // butonu (QuizQuestion içinde) tekrar basılınca normal akış devam eder
    // (bkz. next() içindeki showIntervention kontrolü).
    if (showIntervention && interventionInfo) {
      return (
        <main style={{ maxWidth: '560px', margin: '0 auto', padding: '2rem 1rem' }}>
          <div style={{ padding: '28px 24px', borderRadius: '16px', background: 'var(--bg2)', border: '1.5px solid var(--accent)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '10px' }}>
              💡 Bir dakika, bunu birlikte gözden geçirelim
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 16px' }}>
              Son iki soruda <strong>{interventionInfo.typeLabel}</strong> tipinde benzer bir noktada zorlandın.
              Devam etmeden önce şunu bir daha okuyalım:
            </p>
            {interventionInfo.exp && (
              <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '18px' }}>
                {interventionInfo.exp}
              </div>
            )}
            <button className="btn btn-primary" onClick={next} style={{ width: '100%', justifyContent: 'center' }}>
              Anladım, devam et →
            </button>
          </div>
        </main>
      )
    }

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