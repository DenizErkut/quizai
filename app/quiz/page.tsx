'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import OnboardingModal from '@/components/OnboardingModal'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { type UploadedFile } from '@/components/FileUploader'
import QuizResult from '@/components/QuizResult'
import QuizSetup from '@/components/quiz/QuizSetup'
import QuizQuestion from '@/components/quiz/QuizQuestion'

type QuestionType = 'multiple_choice' | 'fill_blank' | 'matching' | 'true_false' | 'ordering' | 'short_answer' | 'multi_true_false' | 'table_fill' | 'mixed'

interface Question {
  q: string; opts: string[]; ans: number; exp: string
  svg?: string | null; qtype?: 'text' | 'svg'
  type?: QuestionType
  blank?: string          
  pairs?: {left:string; right:string}[]  
  items?: string[]        
  correctOrder?: number[] 
  statement?: boolean     
  statements?: {text: string; correct: boolean}[]  
  tableData?: {headers: string[]; rows: {cells: string[]; blanks: number[]}[]} 
  tableAnswers?: string[] 
}
interface Profile { name: string; grade: string; language: string; plan: string; monthly_test_count: number; daily_test_count?: number; daily_test_date?: string; onboarding_completed?: boolean }

const SUBJECT_MAP: Record<string, Record<string, string[]>> = {
  ilkokul: {
    'Matematik': ['Doğal sayılar', 'Toplama işlemi', 'Çıkarma işlemi', 'Kesirler'],
    'Türkçe': ['Okuma ve anlama', 'Sözcük ve anlam', 'Cümle bilgisi', 'Yazım kuralları'],
    'Fen Bilimleri': ['Canlılar dünyası', 'Madde ve özellikleri', 'Kuvvet ve hareket'],
    'Hayat Bilgisi': ['Okul heyecanım', 'Sağlıklı yaşam', 'Güvenli yaşam']
  },
  ortaokul: {
    'Matematik': ['Tam sayılar ve işlemler', 'Oran ve orantı', 'Yüzdeler', 'Üslü ifadeler', 'Kareköklü ifadeler'],
    'Fen Bilimleri': ['Hücre ve yapısı', 'Fotosentez', 'Sindirim sistemi', 'Maddenin yapısı', 'Güneş sistemi'],
    'Türkçe': ['Sözcük türleri', 'Cümle ögeleri', 'Sözcükte anlam', 'Paragraf', 'Yazım kuralları'],
    'T.C. İnkılap Tarihi': ['I. Dünya Savaşı', 'Kurtuluş Savaşı hazırlık dönemi', 'Atatürk ilkeleri']
  },
  lise: {
    'Matematik': ['Mantık', 'Kümeler', 'Fonksiyonlar', 'Trigonometri', 'Logaritma', 'Türev', 'İntegral'],
    'Fizik': ['Fizik bilimine giriş', 'Kuvvet ve hareket', 'Newton yasaları', 'Elektrik akımı', 'Optik'],
    'Kimya': ['Atom modelleri', 'Periyodik sistem', 'Kimyasal bağlar', 'Mol kavramı', 'Organik kimya'],
    'Biyoloji': ['Hücre', 'Hücre bölünmeleri', 'Kalıtım ve genetik', 'Protein sentezi', 'Sistemler']
  },
  universite: {
    'Matematik': ['Diferansiyel ve integral hesap', 'Lineer cebir', 'Diferansiyel denklemler'],
    'Fizik': ['Klasik mekanik', 'Elektromanyetizma', 'Kuantum mekaniği'],
    'Bilişim ve Yazılım': ['Veri yapıları ve algoritmalar', 'Nesne yönelimli programlama', 'Yapay zeka']
  }
}

const TOPIC_MAP: Record<string, { topic: string; subject: string }[]> = {
  ilkokul: Object.entries(SUBJECT_MAP.ilkokul).flatMap(([subj, topics]) => topics.map(t => ({ topic: t, subject: subj }))),
  ortaokul: Object.entries(SUBJECT_MAP.ortaokul).flatMap(([subj, topics]) => topics.map(t => ({ topic: t, subject: subj }))),
  lise: Object.entries(SUBJECT_MAP.lise).flatMap(([subj, topics]) => topics.map(t => ({ topic: t, subject: subj }))),
  universite: Object.entries(SUBJECT_MAP.universite).flatMap(([subj, topics]) => topics.map(t => ({ topic: t, subject: subj })))
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
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [quizError, setQuizError] = useState<{code: string; title: string; desc: string; retry: boolean} | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [currentLang, setCurrentLang] = useState('Türkçe')
  const [screen, setScreen] = useState<Screen>('topic')
  
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [favorites, setFavorites] = useState<string[]>([])
  const [mebTopics, setMebTopics] = useState<Record<string, string[]>>({})
  const [topicSummary, setTopicSummary] = useState<any>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

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
  const answersRef = useRef<{ userAns: number; correct: boolean }[]>([])
  const isSavingRef = useRef(false)
  const [chosen, setChosen] = useState<number | null>(null)
  const [loadMsg, setLoadMsg] = useState('Profilin analiz ediliyor...')
  const [topicErr, setTopicErr] = useState('')
  const [youtubeLinks, setYoutubeLinks] = useState<Record<string, any>>({})
  const [showPaywall, setShowPaywall] = useState<'qcount' | 'daily' | 'topic' | null>(null)
  const supabase = createClient() as any

  const [shortInput, setShortInput] = useState('')
  const [fillInput, setFillInput] = useState('')
  const [checkingAnswer, setCheckingAnswer] = useState(false)
  
  // Birleştirilmiş ve senkronize edilmiş Yapılandırılmış Soru Stateleri
  const [orderAnswer, setOrderAnswer] = useState<string[]>([])
  const [matchAnswer, setMatchAnswer] = useState<Record<number, number>>({})
  const [multiTFAnswer, setMultiTFAnswer] = useState<Record<number, boolean | null>>({})
  const [tableFillAnswer, setTableFillAnswer] = useState<string[]>([])
  const [shuffledPairs, setShuffledPairs] = useState<string[]>([])
  const [shuffledIndexMap, setShuffledIndexMap] = useState<number[]>([])

  const PLAN_DAILY_LIMIT: Record<string, number> = { free: 10, premium: 25, unlimited: 9999 }
  const PLAN_MAX_QCOUNT: Record<string, number> = { free: 5, premium: 20, unlimited: 20 }

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return null }
    const { data } = await supabase
      .from('profiles').select('name,grade,language,plan,monthly_test_count,daily_test_count,daily_test_date,onboarding_completed')
      .eq('id', user.id).single()
    if (!data || !data.grade || !data.name) { router.push('/profile'); return null }
    const lang = getActiveLang(data.language)
    setProfile({ ...data, language: lang })
    if (data && !data.onboarding_completed) setShowOnboarding(true)
    setCurrentLang(lang)
    return { ...data, language: lang }
  }, [router, supabase])

  useEffect(() => { fetchProfile() }, [fetchProfile])

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
          : userGradeRaw.includes('ilkokul') ? 'ilkokul' : 'ortaokul'

        for (const r of (data.resources || [])) {
          const resGradeRaw = (r.grade || '').toLowerCase()
          const resGradeNum = (resGradeRaw.match(/\d+/) || [])[0] || ''
          const resLevel = resGradeRaw.includes('universite') ? 'universite'
            : resGradeRaw.includes('lise') ? 'lise'
            : resGradeRaw.includes('ortaokul') ? 'ortaokul'
            : resGradeRaw.includes('ilkokul') ? 'ilkokul' : (r.level || '')

          if (resLevel === userLevel && (!resGradeNum || !userGradeNum || resGradeNum === userGradeNum)) {
            const key = r.subject || 'Diger'
            if (!map[key]) map[key] = []
            if (r.unit && !map[key].includes(r.unit)) map[key].push(r.unit)
          }
        }
        setMebTopics(map)
      } catch {}
    }
    if (profile?.grade) loadMebTopics()
  }, [profile?.grade])

  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem('pratium_favs') || '[]'))
      const lastSettings = JSON.parse(localStorage.getItem('pratium_last_settings') || '{}')
      if (lastSettings.difficulty) setDifficulty(lastSettings.difficulty)
      if (lastSettings.questionType) setQuestionType(lastSettings.questionType)
      if (lastSettings.qCount) setQCount(lastSettings.qCount)
    } catch {}
  }, [])

  // Soru Tipi Bazlı State Değişim Takibi ve Yapay Rastgeleleştirme (Shuffle)
  useEffect(() => {
    const q = questions[current]
    if (!q) return
    setFillInput('')
    setShortInput('')
    setMatchAnswer({})
    setMultiTFAnswer({})
    setTableFillAnswer(Array(q.tableData?.rows?.reduce((s: number, r: any) => s + (r.blanks?.length || 0), 0) || 0).fill(''))
    if (q.items) setOrderAnswer([...q.items].sort(() => Math.random() - 0.5))
    if (q.pairs) {
      const rights = q.pairs.map((p: any, i: number) => ({ text: p.right, originalIndex: i }))
      const shuffled = [...rights].sort(() => Math.random() - 0.5)
      setShuffledPairs(shuffled.map((s: any) => s.text))
      setShuffledIndexMap(shuffled.map((s: any) => s.originalIndex))
    }
  }, [current, questions])

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

  const combinedContent = uploadedFiles.map(f => `[${f.name}]\n${f.content}`).join('\n\n---\n\n')
  const hasFiles = uploadedFiles.length > 0

  function getErrorInfo(errorCode: string, status?: number) {
    if (status === 429 || errorCode === 'daily_limit_reached') return { code: 'daily_limit', title: "⏰ Günlük limit doldu", desc: "Bugünkü test hakkını kullandın. Yarın yenilenir ya da Premium'a geçerek sınırsız test çöz.", retry: false }
    if (errorCode === 'limit_reached') return { code: 'monthly_limit', title: "📚 Aylık limit doldu", desc: "Bu ay için test hakkın bitti. Sınırsız test için Premium'a geç.", retry: false }
    if (status === 503 || status === 502 || status === 504) return { code: 'server', title: "🔧 Sunucu meşgul", desc: "Sunucularımız yoğun, birkaç saniye bekleyip tekrar dene.", retry: true }
    return { code: 'unknown', title: "❌ Bir sorun oluştu", desc: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.", retry: true }
  }

  async function startQuiz() {
    const topic = customTopic.trim() || selectedTopic || (hasFiles ? uploadedFiles.map(f => f.name.replace(/\.[^.]+$/, '')).join(', ') : '')
    if (!topic) { setTopicErr('Bir konu seç veya yaz.'); return }
    setTopicErr('')
    const lang = getActiveLang(profile?.language)
    setScreen('loading')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          topic, questionCount: qCount, difficulty, language: lang,
          fileContent: combinedContent || undefined,
          fileType: uploadedFiles[0]?.fileType || undefined,
          includeVisuals, questionType,
        }),
      })
      const data = await res.json()

      if (res.status === 429 && data.error === 'limit_reached') { setScreen('limit'); return }
      if (res.status === 429 && data.error === 'daily_limit_reached') { setScreen('topic'); setShowPaywall('daily'); return }
      if (!res.ok) { setQuizError(getErrorInfo(data.error || 'unknown', res.status)); setScreen('error'); return }

      try {
        localStorage.setItem('pratium_last_settings', JSON.stringify({ difficulty, questionType, qCount }))
      } catch {}

      setQuestions(data.questions)
      setSessionId(data.sessionId)
      setCurrent(0); setAnswers([]); answersRef.current = []; setChosen(null); setCheckingAnswer(false)
      setScreen('quiz')
    } catch (e: any) {
      setQuizError(getErrorInfo(e?.message || 'unknown')); setScreen('error')
    }
  }

  function choose(idx: number) {
    if (chosen !== null) return
    setChosen(idx)
    const q = questions[current]
    const correct = idx === q.ans
    setAnswers(prev => {
      const next = [...prev, { userAns: idx, correct }]
      answersRef.current = next
      return next
    })
  }

  function isSimilarEnough(user: string, correct: string): boolean {
    const u = user.toLowerCase().trim()
    const c = correct.toLowerCase().trim()
    if (!u || !c) return false
    if (u === c || c.includes(u) || u.includes(c)) return true
    return false
  }

  async function submitShortAnswer() {
    if (!fillInput.trim() && !shortInput.trim()) return
    if (checkingAnswer) return
    const q = questions[current]
    const userText = (fillInput || shortInput).trim()
    const correctAnswer = q.blank || q.opts?.[q.ans] || ''
    let correct = isSimilarEnough(userText, correctAnswer)

    setCheckingAnswer(true)
    if (!correct) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/check-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ question: q.q, correctAnswer, userAnswer: userText, language: currentLang }),
        })
        if (res.ok) { const d = await res.json(); correct = d.correct === true }
      } catch {}
    }

    setChosen(correct ? q.ans : -1)
    setAnswers(prev => {
      const next = [...prev, { userAns: correct ? q.ans : -1, correct }]
      answersRef.current = next
      return next
    })
    setCheckingAnswer(false)
  }

  async function next() {
    if (current + 1 >= questions.length) {
      if (isSavingRef.current) return
      isSavingRef.current = true
      const finalAnswers = answersRef.current
      const score = finalAnswers.filter(a => a.correct).length

      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()

      if (sessionId && currentUser?.id) {
        try {
          await fetch('/api/save-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ sessionId, answers: finalAnswers, score }),
          })
        } catch {}
      }

      if (assignmentId && currentUser) {
        const pct = Math.round((score / questions.length) * 100)
        const enrichedAnswers = finalAnswers.map((a, i) => ({
          correct: a.correct,
          question: questions[i]?.q || '',
          student_answer: a.userAns !== -1 ? (questions[i]?.opts?.[a.userAns] ?? '') : '(Boş)',
          correct_answer: questions[i]?.opts?.[questions[i]?.ans] ?? questions[i]?.blank ?? '',
          explanation: questions[i]?.exp ?? ''
        }))
        await supabase.from('assignment_completions').upsert({
          assignment_id: assignmentId, student_id: currentUser.id, session_id: sessionId, score, pct, answers: enrichedAnswers, completed_at: new Date().toISOString()
        }, { onConflict: 'assignment_id,student_id' })
      }

      try {
        const ytRes = await fetch('/api/youtube-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ topics: [customTopic.trim() || selectedTopic] }),
        })
        const ytData = await ytRes.json()
        if (ytData.links) setYoutubeLinks(ytData.links)
      } catch {}

      isSavingRef.current = false
      setScreen('result')
    } else {
      setCurrent(c => c + 1); setChosen(null)
    }
  }

  const plan = profile?.plan || 'free'
  const maxQCount = PLAN_MAX_QCOUNT[plan] ?? 5
  const today = new Date().toISOString().split('T')[0]
  const dailyUsed = profile?.daily_test_date === today ? (profile?.daily_test_count || 0) : 0
  const dailyLeft = plan === 'unlimited' ? null : Math.max(0, (PLAN_DAILY_LIMIT[plan] ?? 10) - dailyUsed)
  const testsLeft = profile?.plan === 'free' ? Math.max(0, 10 - (profile?.monthly_test_count || 0)) : null

  if (screen === 'limit') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="bento-card anim-pop" style={{ maxWidth: '460px', textAlign: 'center' }}>
        <h2>Aylık limit bitti 📚</h2>
        <p style={{ margin: '1rem 0' }}>Sınırsız test paketi için planları inceleyebilirsiniz.</p>
        <Link href="/pricing" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Planları Gör ➔</Link>
      </div>
    </main>
  )

  if (screen === 'topic') return (
    <>
      {showOnboarding && profile && <OnboardingModal userName={profile.name} grade={profile.grade} onComplete={() => setShowOnboarding(false)} />}
      <QuizSetup
        profile={profile} currentLang={currentLang} selectedTopic={selectedTopic} setSelectedTopic={setSelectedTopic}
        customTopic={customTopic} setCustomTopic={setCustomTopic} qCount={qCount} setQCount={setQCount}
        difficulty={difficulty} setDifficulty={setDifficulty} includeVisuals={includeVisuals} setIncludeVisuals={setIncludeVisuals}
        questionType={questionType} setQuestionType={setQuestionType} uploadedFiles={uploadedFiles} setUploadedFiles={setUploadedFiles}
        favorites={favorites} mebTopics={mebTopics} topicSummary={topicSummary} summaryLoading={summaryLoading}
        showSummary={showSummary} setShowSummary={setShowSummary} onFetchSummary={fetchTopicSummary}
        onToggleFavorite={toggleFavorite} onStartQuiz={startQuiz} testsLeft={testsLeft} dailyLeft={dailyLeft} maxQCount={maxQCount} topicErr={topicErr}
      />
    </>
  )

  if (screen === 'loading') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <div>Yapay zeka Maarif sorularını hazırlıyor...</div>
      </div>
    </main>
  )

  if (screen === 'quiz' && questions.length > 0) return (
    <QuizQuestion
      questions={questions} current={current} answers={answers} difficulty={difficulty} currentLang={currentLang}
      checkingAnswer={checkingAnswer} fillInput={fillInput} shortInput={shortInput} chosen={chosen}
      orderAnswer={orderAnswer} matchAnswer={matchAnswer} multiTFAnswer={multiTFAnswer} tableFillAnswer={tableFillAnswer}
      onSelectAnswer={choose} onFillSubmit={submitShortAnswer} onNext={next} setFillInput={setFillInput} setShortInput={setShortInput}
      setOrderAnswer={setOrderAnswer} setMatchAnswer={setMatchAnswer} setMultiTFAnswer={setMultiTFAnswer} setTableFillAnswer={setTableFillAnswer}
      onFinish={() => setScreen('result')} shuffledPairs={shuffledPairs} shuffledIndexMap={shuffledIndexMap}
    />
  )

  if (screen === 'result') return (
    <main style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <QuizResult
        questions={questions} answers={answers} topic={customTopic.trim() || selectedTopic} difficulty={difficulty}
        language={currentLang} youtubeLinks={youtubeLinks} onNewTest={() => { setScreen('topic'); setSelectedTopic(''); setCustomTopic('') }}
        onRetryWrong={(wq) => { setQuestions(wq); setCurrent(0); setAnswers([]); answersRef.current = []; setChosen(null); setScreen('quiz') }}
      />
    </main>
  )

  return null
}

export default function QuizPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <QuizPageContent />
    </Suspense>
  )
}