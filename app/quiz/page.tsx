'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import FileUploader, { type UploadedFile } from '@/components/FileUploader'
import QuizResult from '@/components/QuizResult'

type QuestionType = 'multiple_choice' | 'fill_blank' | 'matching' | 'true_false' | 'ordering' | 'short_answer'

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
}
interface Profile { name: string; grade: string; language: string; plan: string; monthly_test_count: number }

const TOPIC_MAP: Record<string, { topic: string; subject: string }[]> = {
  ilkokul: [
    { topic: 'Toplama ve cikarma', subject: 'Matematik' },
    { topic: 'Hayvanlar alemi', subject: 'Fen' },
    { topic: 'Mevsimler ve iklim', subject: 'Fen' },
    { topic: 'Turkiye haritasi', subject: 'Sosyal' },
    { topic: 'Carpim tablosu', subject: 'Matematik' },
  ],
  ortaokul: [
    { topic: 'Ondalik sayilar', subject: 'Matematik' },
    { topic: 'Hucre ve organeller', subject: 'Fen' },
    { topic: 'Osmanli tarihi', subject: 'Tarih' },
    { topic: 'Denklemler', subject: 'Matematik' },
    { topic: 'Tam sayilar', subject: 'Matematik' },
  ],
  lise: [
    { topic: 'Turev temelleri', subject: 'Matematik' },
    { topic: 'Organik kimya', subject: 'Kimya' },
    { topic: 'Ataturk ilkeleri', subject: 'Tarih' },
    { topic: 'Logaritma', subject: 'Matematik' },
    { topic: 'Genetik ve DNA', subject: 'Biyoloji' },
  ],
  universite: [
    { topic: 'Ucagin kisimlar', subject: 'Havacilik' },
    { topic: 'Termodinamik', subject: 'Fizik' },
    { topic: 'Diferansiyel denklemler', subject: 'Matematik' },
    { topic: 'Makroekonomi', subject: 'Iktisat' },
    { topic: 'Veri yapilari', subject: 'Bilisim' },
  ],
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

type Screen = 'topic' | 'loading' | 'quiz' | 'result' | 'limit'

export default function QuizPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentLang, setCurrentLang] = useState('Türkçe')
  const [screen, setScreen] = useState<Screen>('topic')
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [qCount, setQCount] = useState(10)
  const [difficulty, setDifficulty] = useState('normal')
  const [includeVisuals, setIncludeVisuals] = useState(true)
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

  const [questions, setQuestions] = useState<Question[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<{ userAns: number; correct: boolean }[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [loadMsg, setLoadMsg] = useState('Profilin analiz ediliyor...')
  const [topicErr, setTopicErr] = useState('')
  const [youtubeLinks, setYoutubeLinks] = useState<Record<string, any>>({})
  const supabase = createClient() as any

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return null }
    const { data } = await supabase
      .from('profiles').select('name,grade,language,plan,monthly_test_count,age')
      .eq('id', user.id).single()
    if (!data || !data.grade || !data.age || !data.name) { router.push('/profile'); return null }
    const lang = getActiveLang(data.language)
    setProfile({ ...data, language: lang })
    setCurrentLang(lang)
    return { ...data, language: lang }
  }, [])

  useEffect(() => { fetchProfile() }, [])

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

  async function startQuiz() {
    const topic = customTopic.trim() || selectedTopic
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

      if (!res.ok) throw new Error(data.error)

      fetchProfile()
      setQuestions(data.questions)
      setSessionId(data.sessionId)
      setCurrent(0); setAnswers([]); setChosen(null)
      setScreen('quiz')
    } catch {
      clearInterval(iv)
      setLoadMsg('Hata oluştu, tekrar deneyin.')
      setTimeout(() => setScreen('topic'), 2000)
    }
  }

  function retryWrong(wrongQuestions: Question[]) {
    setQuestions(wrongQuestions)
    setCurrent(0)
    setAnswers([])
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
    setAnswers(prev => [...prev, { userAns: idx, correct }])
  }

  const [shortInput, setShortInput] = useState('')
  const [matchSelections, setMatchSelections] = useState<Record<number, number>>({})
  const [orderItems, setOrderItems] = useState<string[]>([])
  const [fillInput, setFillInput] = useState('')

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
    const q = questions[current]
    const userText = (fillInput || shortInput).trim()
    const correctAnswer = q.blank || q.opts?.[q.ans] || ''
    let correct = false

    if (isSimilarEnough(userText, correctAnswer)) {
      correct = true
    } else {
      // AI ile semantik kontrol
      try {
        const res = await fetch('/api/check-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    setAnswers(prev => [...prev, { userAns: correct ? q.ans : -1, correct }])
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
    setAnswers(prev => [...prev, { userAns: correct ? q.ans : -1, correct }])
  }

  function submitOrdering() {
    const q = questions[current]
    const items = q.items || []
    const correct = orderItems.every((item, i) => item === items[q.correctOrder?.[i] ?? i])
    setChosen(correct ? 0 : -1)
    setAnswers(prev => [...prev, { userAns: correct ? 0 : -1, correct }])
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
    if (q.items) setOrderItems([...q.items].sort(() => Math.random() - 0.5))
    // Eşleştirme: sağ tarafı karıştır, orijinal index'i sakla
    if (q.pairs) {
      const rights = q.pairs.map((p: any, i: number) => ({ text: p.right, originalIndex: i }))
      const shuffled = [...rights].sort(() => Math.random() - 0.5)
      setShuffledPairs(shuffled.map((s: any) => s.text))
      // shuffledIndexMap: karışık pozisyon → orijinal index
      setShuffledIndexMap(shuffled.map((s: any) => s.originalIndex))
    }
  }, [current, questions])

  const [shuffledIndexMap, setShuffledIndexMap] = useState<number[]>([])

  async function next() {
    if (current + 1 >= questions.length) {
      // chosen henuz answers state'e yansimamis olabilir — son cevabi dahil et
      const lastCorrect = chosen !== null && chosen === questions[current].ans
      const finalAnswers = chosen !== null && answers.length < questions.length
        ? [...answers, { userAns: chosen, correct: lastCorrect }]
        : answers
      const score = finalAnswers.filter(a => a.correct).length
      const { data: { session } } = await supabase.auth.getSession()
      if (sessionId) {
        await fetch('/api/generate-quiz', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ sessionId, answers: finalAnswers, score }),
        })
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
      setScreen('result')
    } else { setCurrent(c => c + 1); setChosen(null) }
  }

  const level = profile ? getLevel(profile.grade) : 'ortaokul'
  const suggestions = TOPIC_MAP[level] || TOPIC_MAP.ortaokul
  const testsLeft = profile?.plan === 'free' ? Math.max(0, 10 - (profile?.monthly_test_count || 0)) : null
  const activeDiff = DIFFICULTIES.find(d => d.value === difficulty)!

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

  // ── TOPIC ──
  if (screen === 'topic') return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
      {/* Dekoratif arka plan elementleri */}
      <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.08) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '60px', left: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(8,36,101,0.06) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: '40%', left: '60%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.05) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {profile && (
          <div className="anim-up" style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent-bg)', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 600, fontSize: '15px' }}>
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 500 }}>Merhaba, {profile.name.split(' ')[0]}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>{profile.grade}</span>
                <span>·</span>
                <span>{currentLang}</span>
                {testsLeft !== null && (
                  <span style={{
                    padding: '1px 8px', borderRadius: '99px', fontSize: '11px',
                    background: testsLeft === 0 ? 'var(--red-bg)' : testsLeft <= 2 ? 'rgba(217,119,6,0.1)' : 'var(--bg3)',
                    color: testsLeft === 0 ? 'var(--red)' : testsLeft <= 2 ? 'var(--amber)' : 'var(--text3)',
                    border: `1px solid ${testsLeft === 0 ? 'rgba(220,38,38,0.2)' : testsLeft <= 2 ? 'rgba(217,119,6,0.2)' : 'var(--border)'}`,
                    fontWeight: 600,
                  }}>
                    {testsLeft === 0 ? '⚠ Hak kalmadı' : `${testsLeft} test kaldı`}
                  </span>
                )}
                {profile.plan === 'premium' && (
                  <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid rgba(91,76,245,0.2)', fontWeight: 600 }}>★ Premium</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Limit uyarısı */}
        {testsLeft !== null && testsLeft <= 3 && testsLeft > 0 && (
          <div className="anim-up" style={{ marginBottom: '1rem', padding: '12px 16px', borderRadius: '10px', background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)', fontSize: '13px', color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠ Bu ay {testsLeft} test hakkın kaldı.</span>
            <Link href="/pricing" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '12px', textDecoration: 'none' }}>Yükselt →</Link>
          </div>
        )}

        <div className="card anim-up-1">
          <h2 className="serif" style={{ fontSize: '24px', marginBottom: '0.25rem' }}>Hangi konuyu test edelim?</h2>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.5rem' }}>
            Hazır konulardan seç, kendi konunu yaz veya dosya yükle.
            {currentLang !== 'Türkçe' && <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>· Sorular {currentLang} dilinde</span>}
          </p>

          <label className="field-label">Önerilen konular</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px', marginBottom: '1rem' }}>
            {suggestions.map(s => (
              <button key={s.topic} className={`tag ${selectedTopic === s.topic ? 'active' : ''}`}
                onClick={() => { setSelectedTopic(s.topic); setCustomTopic('') }}>
                <span style={{ fontSize: '10px', color: 'var(--text3)', marginRight: '4px' }}>{s.subject}</span>
                {s.topic}
              </button>
            ))}
          </div>

          <label className="field-label">Veya kendi konunu yaz</label>
          <textarea className="input" rows={2}
            placeholder="Örn: Güneş sistemi, Osmanlı kuruluşu, Fotosentez..."
            value={customTopic} onChange={e => { setCustomTopic(e.target.value); setSelectedTopic('') }}
            style={{ resize: 'none' }} />

          {/* Dosya yükleme */}
          <label className="field-label" style={{ marginTop: '16px' }}>Dosyadan soru üret</label>
          <FileUploader onFilesChange={setUploadedFiles} maxFiles={5} maxMB={20} />
          {hasFiles && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--green)' }}>
              ✓ {uploadedFiles.length} dosya hazır · {uploadedFiles.reduce((s, f) => s + f.content.split(' ').length, 0)} kelime · Sorular bu içeriklerden üretilecek
            </div>
          )}

          {/* Zorluk */}
          <label className="field-label" style={{ marginTop: '16px' }}>Zorluk seviyesi</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '6px' }}>
            {DIFFICULTIES.map(d => (
              <button key={d.value} onClick={() => setDifficulty(d.value)}
                style={{ padding: '10px 8px', borderRadius: '10px', border: `1.5px solid ${difficulty === d.value ? d.border : 'var(--border)'}`, background: difficulty === d.value ? d.bg : 'var(--bg2)', color: difficulty === d.value ? d.color : 'var(--text2)', fontSize: '13px', fontWeight: difficulty === d.value ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{d.label}</div>
                <div style={{ fontSize: '11px', opacity: 0.75 }}>{d.desc}</div>
              </button>
            ))}
          </div>

          {/* Soru tipi seçici */}
          <div style={{ marginTop: '16px' }}>
            <label className="field-label">Soru tipi</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
              {[
                { value: 'multiple_choice', label: 'Çoktan Seçmeli', icon: '🔤', desc: 'A/B/C/D klasik' },
                { value: 'fill_blank', label: 'Boşluk Doldurma', icon: '✏️', desc: 'Eksik kelimeyi bul' },
                { value: 'true_false', label: 'Doğru / Yanlış', icon: '✓✗', desc: 'Gerekçeli D/Y' },
                { value: 'matching', label: 'Eşleştirme', icon: '🔗', desc: 'Kavram – tanım' },
                { value: 'ordering', label: 'Sıralama', icon: '📋', desc: 'Doğru sıraya koy' },
                { value: 'short_answer', label: 'Kısa Cevap', icon: '💬', desc: 'AI puanlar' },
              ].map(t => (
                <button key={t.value} onClick={() => setQuestionType(t.value as QuestionType)}
                  style={{
                    padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                    border: `1.5px solid ${questionType === t.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: questionType === t.value ? 'var(--accent-bg)' : 'var(--bg2)',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{t.icon}</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: questionType === t.value ? 'var(--accent)' : 'var(--primary)', lineHeight: 1.3 }}>{t.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Soru sayısı + görsel */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Soru sayısı</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {[5, 10, 15, ...(profile?.plan === 'premium' ? [20] : [])].map(n => (
                  <button key={n} className={`btn btn-sm ${qCount === n ? 'btn-primary' : ''}`} onClick={() => setQCount(n)}>{n} soru</button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">Görsel sorular</label>
              <button onClick={() => setIncludeVisuals(v => !v)}
                style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${includeVisuals ? 'var(--accent)' : 'var(--border)'}`, background: includeVisuals ? 'var(--accent-bg)' : 'var(--bg2)', color: includeVisuals ? 'var(--accent)' : 'var(--text2)', fontSize: '13px', fontWeight: includeVisuals ? 600 : 400, transition: 'all 0.15s' }}>
                {includeVisuals ? '📊 Grafik & SVG açık' : '📝 Sadece metin'}
              </button>
            </div>
          </div>

          {/* Özet */}
          <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text2)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span>📝 {qCount} soru</span>
            <span style={{ color: 'var(--accent)' }}>{
              {'multiple_choice':'🔤 Çoktan Seçmeli','fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ D/Y','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap'}[questionType]
            }</span>
            <span style={{ color: activeDiff.color }}>⚡ {activeDiff.label}</span>
            <span>🌐 {currentLang}</span>
            {hasFiles && <span style={{ color: 'var(--green)' }}>📎 {uploadedFiles.length} dosya</span>}
            {includeVisuals && <span style={{ color: 'var(--accent)' }}>📊 Görsel</span>}
          </div>

          {topicErr && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)' }}>{topicErr}</div>}

          <button className="btn btn-primary btn-lg" onClick={startQuiz} disabled={testsLeft === 0}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', opacity: testsLeft === 0 ? 0.5 : 1 }}>
            {testsLeft === 0 ? 'Test hakkın doldu — Yükselt' : 'Test oluştur ⚡'}
          </button>

          {testsLeft === 0 && (
            <Link href="/pricing" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
              💎 Premium'a geç
            </Link>
          )}
        </div>
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
        <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{loadMsg}</div>
      </div>
    </main>
  )

  // ── QUIZ ──
  if (screen === 'quiz' && questions.length > 0) {
    const q = questions[current]
    const progPct = Math.round((current / questions.length) * 100)
    const diff = DIFFICULTIES.find(d => d.value === difficulty)!
    return (
      <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
        <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.07) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', bottom: '60px', left: '-100px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(8,36,101,0.05) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <img src='/pratium-logo-new.svg' alt='Pratium' style={{ height: '32px' }} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '99px', background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`, fontWeight: 600 }}>{diff.label}</span>
              <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{answers.filter(a => a.correct).length}/{current} doğru</span>
            </div>
          </div>
          <div className="progress-bar" style={{ marginBottom: '1.5rem' }}>
            <div className="progress-fill" style={{ width: `${progPct}%` }} />
          </div>
          <div className="card anim-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 500 }}>Soru {current + 1} / {questions.length}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {q.qtype === 'svg' && q.svg && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid rgba(91,76,245,0.2)' }}>📊 Görsel</span>}
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>🌐 {currentLang}</span>
              </div>
            </div>
            {q.qtype === 'svg' && q.svg && (
              <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div dangerouslySetInnerHTML={{ __html: q.svg }} style={{ width: '100%' }} />
              </div>
            )}
            {/* Soru tipi badge */}
            {q.type && q.type !== 'multiple_choice' && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: 'rgba(8,36,101,0.08)', color: 'var(--primary)', fontWeight: 700, border: '1px solid rgba(8,36,101,0.15)' }}>
                  {{'fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ Doğru / Yanlış','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap'}[q.type]}
                </span>
              </div>
            )}

            <p style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.55, marginBottom: '1.5rem' }}>{q.q}</p>

            {/* ── ÇOKTAN SEÇMELİ (default) ── */}
            {(!q.type || q.type === 'multiple_choice') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(q.opts || []).map((opt, i) => {
                  let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--text)'
                  if (chosen !== null) {
                    if (i === q.ans) { bg = 'var(--green-bg)'; border = 'rgba(22,163,74,0.35)'; color = 'var(--green)' }
                    else if (i === chosen) { bg = 'var(--red-bg)'; border = 'rgba(220,38,38,0.35)'; color = 'var(--red)' }
                  }
                  return (
                    <button key={i} onClick={() => choose(i)} disabled={chosen !== null}
                      style={{ textAlign: 'left', padding: '12px 15px', borderRadius: '10px', border: `1.5px solid ${border}`, background: bg, color, fontSize: '14px', lineHeight: 1.45, cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}>
                      <span style={{ fontWeight: 700, marginRight: '8px', opacity: 0.5 }}>{String.fromCharCode(65 + i)}.</span>{opt}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── DOĞRU / YANLIŞ ── */}
            {q.type === 'true_false' && (
              <div style={{ display: 'flex', gap: '12px' }}>
                {[{label: '✓ Doğru', val: 0, c: 'var(--green)', bg: 'var(--green-bg)'}, {label: '✗ Yanlış', val: 1, c: 'var(--red)', bg: 'var(--red-bg)'}].map(opt => {
                  const isChosen = chosen === opt.val
                  const isCorrect = opt.val === q.ans
                  const showResult = chosen !== null
                  return (
                    <button key={opt.val} onClick={() => choose(opt.val)} disabled={chosen !== null}
                      style={{ flex: 1, padding: '18px', borderRadius: '12px', fontSize: '18px', fontWeight: 700,
                        border: `2px solid ${showResult && isCorrect ? 'rgba(22,163,74,0.5)' : showResult && isChosen && !isCorrect ? 'rgba(220,38,38,0.5)' : 'var(--border)'}`,
                        background: showResult && isCorrect ? 'var(--green-bg)' : showResult && isChosen && !isCorrect ? 'var(--red-bg)' : 'var(--bg2)',
                        color: showResult && isCorrect ? 'var(--green)' : showResult && isChosen && !isCorrect ? 'var(--red)' : 'var(--text2)',
                        cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── BOŞLUK DOLDURMA ── */}
            {q.type === 'fill_blank' && (
              <div>
                <input value={fillInput} onChange={e => setFillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && chosen === null && submitShortAnswer()}
                  disabled={chosen !== null}
                  placeholder="Cevabınızı yazın..."
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', fontSize: '16px', fontFamily: 'var(--font-sans)', border: `2px solid ${chosen !== null ? (answers[answers.length-1]?.correct ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: chosen !== null ? (answers[answers.length-1]?.correct ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }} />
                {chosen === null && (
                  <button className="btn btn-primary" onClick={submitShortAnswer} disabled={!fillInput.trim()}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
                    Cevapla →
                  </button>
                )}
                {chosen !== null && (
                  <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600, color: answers[answers.length-1]?.correct ? 'var(--green)' : 'var(--red)' }}>
                    {answers[answers.length-1]?.correct ? '✓ Doğru!' : `✗ Doğru cevap: "${q.blank || q.opts?.[q.ans]}"`}
                  </div>
                )}
              </div>
            )}

            {/* ── KISA CEVAP ── */}
            {q.type === 'short_answer' && (
              <div>
                <textarea value={shortInput} onChange={e => setShortInput(e.target.value)}
                  disabled={chosen !== null}
                  placeholder="Cevabınızı buraya yazın..."
                  rows={3}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontFamily: 'var(--font-sans)', border: '2px solid var(--border)', background: 'var(--bg2)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', color: 'var(--text)' }} />
                {chosen === null && (
                  <button className="btn btn-primary" onClick={submitShortAnswer} disabled={!shortInput.trim()}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
                    Gönder →
                  </button>
                )}
                {chosen !== null && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text3)' }}>
                    <strong style={{ color: 'var(--primary)' }}>Örnek cevap:</strong> {q.opts?.[q.ans] || q.blank}
                  </div>
                )}
              </div>
            )}

            {/* ── EŞLEŞTİRME ── */}
            {q.type === 'matching' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '4px' }}>Kavram</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '4px' }}>Tanım</div>
                  {(q.pairs || []).map((pair: any, i: number) => {
                    // matchSelections[i] = kullanıcının seçtiği shuffledPairs index'i
                    // Doğru cevap: shuffledIndexMap[seçilen] === i (orijinal index eşleşmeli)
                    const userShuffledIdx = matchSelections[i]
                    const isAnswered = chosen !== null && userShuffledIdx !== undefined
                    const isCorrect = isAnswered && shuffledIndexMap[userShuffledIdx] === i
                    return (
                      <>
                        <div key={`l${i}`} style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(8,36,101,0.06)', border: '1px solid rgba(8,36,101,0.1)', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
                          {pair.left}
                        </div>
                        <select key={`r${i}`}
                          value={userShuffledIdx ?? ''}
                          onChange={e => setMatchSelections(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                          disabled={chosen !== null}
                          style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${isAnswered ? (isCorrect ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: isAnswered ? (isCorrect ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
                          <option value="">Seç...</option>
                          {shuffledPairs.map((right: string, j: number) => (
                            <option key={j} value={j}>{right}</option>
                          ))}
                        </select>
                      </>
                    )
                  })}
                </div>
                {chosen === null && (
                  <button className="btn btn-primary" onClick={submitMatching}
                    disabled={Object.keys(matchSelections).length < (q.pairs || []).length}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    Eşleştir →
                  </button>
                )}
                {chosen !== null && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text3)' }}>
                    <strong style={{ color: 'var(--primary)' }}>Doğru eşleşmeler:</strong>
                    {(q.pairs || []).map((p: any, i: number) => (
                      <div key={i} style={{ marginTop: '4px' }}>{p.left} → {p.right}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SIRALAMA ── */}
            {q.type === 'ordering' && (
              <div>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Öğeleri sürükleyerek doğru sıraya koy:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {orderItems.map((item, i) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${chosen !== null ? ((q.correctOrder || []).indexOf(q.items?.indexOf(item) ?? i) === i ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)') : 'var(--border)'}`, background: chosen !== null ? ((q.correctOrder || []).indexOf(q.items?.indexOf(item) ?? i) === i ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontSize: '13px', cursor: chosen !== null ? 'default' : 'grab' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text4)', fontSize: '12px', width: '20px' }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{item}</span>
                      {chosen === null && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button onClick={() => i > 0 && moveItem(i, i-1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '12px', padding: '0 4px', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                          <button onClick={() => i < orderItems.length-1 && moveItem(i, i+1)} disabled={i === orderItems.length-1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '12px', padding: '0 4px', opacity: i === orderItems.length-1 ? 0.3 : 1 }}>▼</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {chosen === null && (
                  <button className="btn btn-primary" onClick={submitOrdering}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                    Sıralamayı onayla →
                  </button>
                )}
              </div>
            )}
            {chosen !== null && (
              <>
                <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', borderLeft: '3px solid var(--accent)', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.65 }}>
                  <strong style={{ color: chosen === q.ans ? 'var(--green)' : 'var(--red)' }}>{chosen === q.ans ? 'Doğru! ' : 'Yanlış. '}</strong>{q.exp}
                </div>
                <button className="btn btn-primary" onClick={next} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                  {current + 1 < questions.length ? 'Sonraki soru →' : 'Sonuçları gör →'}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    )
  }

  // ── RESULT ──
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