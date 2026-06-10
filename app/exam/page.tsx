'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/client'

// ─── TIPLER ──────────────────────────────────────────────────────────────────
interface Question { q: string; opts: string[]; ans: number; exp: string; difficulty?: string }
interface Section { id: string; label: string; count: number; netCoef: number; subject: string; grade: string }
interface ExamFormat {
  label: string; fullName: string; duration: number; color: string
  sections: Section[]; scoring: { correct: number; wrong: number }
  maxScore: number; description: string; targetAudience: string
}
interface SectionAnswer { chosen: number | null; correct: boolean | null }

type Screen = 'select' | 'confirm' | 'loading' | 'exam' | 'result'

const EXAM_META = {
  LGS:        { emoji: '🏫', badge: '8. Sınıf',   color: '#6366f1', bg: 'rgba(99,102,241,0.08)'  },
  TYT:        { emoji: '🎓', badge: 'Lise',        color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)'  },
  AYT:        { emoji: '🏆', badge: 'YKS',         color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  KPSS_GENEL: { emoji: '📋', badge: 'Mezun',       color: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
}

// ─── YARDIMCI ────────────────────────────────────────────────────────────────
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pctColor(p: number) {
  return p >= 70 ? '#16a34a' : p >= 45 ? '#d97706' : '#dc2626'
}

// ─── ANA COMPONENT ───────────────────────────────────────────────────────────
export default function ExamPage() {
  const router = useRouter()
  const supabase = createClient() as any

  // Ekranlar
  const [screen, setScreen] = useState<Screen>('select')
  const [profile, setProfile] = useState<any>(null)
  const [formats, setFormats] = useState<Record<string, ExamFormat>>({})
  const [selectedExam, setSelectedExam] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(true)

  // Sınav durumu
  const [examId, setExamId] = useState<string | null>(null)
  const [examFormat, setExamFormat] = useState<ExamFormat | null>(null)
  const [sections, setSections] = useState<Record<string, Question[]>>({})
  const [currentSection, setCurrentSection] = useState<string>('')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, SectionAnswer[]>>({})
  const [chosen, setChosen] = useState<number | null>(null)
  const [showExp, setShowExp] = useState(false)

  // Zamanlayıcı
  const [timeLeft, setTimeLeft] = useState(0)
  const [timeSpent, setTimeSpent] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  // Sonuç
  const [result, setResult] = useState<any>(null)
  const [aiAnalysis, setAiAnalysis] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')

  // ── YÜKLEMELERl ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: p } = await supabase.from('profiles').select('name,plan,grade').eq('id', user.id).maybeSingle()
      setProfile(p)

      // Format listesini API'den çek
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-exam', {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setFormats(data.formats || {})
      }
    }
    load()
  }, [])

  // ── ZAMANLAYICI ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'exam') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          finishExam()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [screen])

  // ── SINAV BAŞLAT ─────────────────────────────────────────────────────────
  async function startExam() {
    if (!selectedExam) return
    setScreen('loading')

    const msgs = [
      `${selectedExam} soruları hazırlanıyor...`,
      'Bölümler oluşturuluyor...',
      'Sorular derleniyor...',
      'Son kontroller yapılıyor...',
    ]
    let mi = 0
    setLoadingMsg(msgs[0])
    const msgInterval = setInterval(() => {
      mi = (mi + 1) % msgs.length
      setLoadingMsg(msgs[mi])
    }, 2500)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ examType: selectedExam, demo: demoMode }),
      })

      clearInterval(msgInterval)

      if (!res.ok) {
        const err = await res.json()
        if (err.error === 'premium_required') {
          setScreen('select')
          router.push('/pricing')
          return
        }
        setScreen('select')
        return
      }

      const data = await res.json()
      setExamId(data.examId)
      setExamFormat(data.format)
      setSections(data.sections)

      // Cevap state'ini başlat
      const initAnswers: Record<string, SectionAnswer[]> = {}
      const firstSection = data.format.sections[0]?.id
      for (const s of data.format.sections) {
        const qs = data.sections[s.id] || []
        initAnswers[s.id] = qs.map(() => ({ chosen: null, correct: null }))
      }
      setAnswers(initAnswers)
      setCurrentSection(firstSection || '')
      setCurrentQ(0)
      setChosen(null)
      setShowExp(false)

      // Zamanlayıcı
      const durationSec = demoMode
        ? Math.round(data.format.duration * 60 * 0.25)
        : data.format.duration * 60
      setTimeLeft(durationSec)
      startTimeRef.current = Date.now()

      setScreen('exam')
    } catch (e) {
      clearInterval(msgInterval)
      console.error(e)
      setScreen('select')
    }
  }

  // ── CEVAP VER ────────────────────────────────────────────────────────────
  function selectAnswer(idx: number) {
    if (chosen !== null) return
    const q = sections[currentSection]?.[currentQ]
    if (!q) return
    const isCorrect = idx === q.ans
    setChosen(idx)
    setShowExp(true)

    setAnswers(prev => {
      const updated = { ...prev }
      const sectionAnswers = [...(updated[currentSection] || [])]
      sectionAnswers[currentQ] = { chosen: idx, correct: isCorrect }
      updated[currentSection] = sectionAnswers
      return updated
    })
  }

  // ── SONRAKİ SORU ─────────────────────────────────────────────────────────
  function nextQuestion() {
    const sectionQs = sections[currentSection] || []
    if (currentQ < sectionQs.length - 1) {
      setCurrentQ(q => q + 1)
      const nextAns = answers[currentSection]?.[currentQ + 1]
      setChosen(nextAns?.chosen ?? null)
      setShowExp(nextAns?.chosen !== null && nextAns?.chosen !== undefined)
    } else {
      // Bölüm bitti — sonraki bölüme geç
      const sectionList = examFormat?.sections || []
      const ci = sectionList.findIndex(s => s.id === currentSection)
      if (ci < sectionList.length - 1) {
        const nextSec = sectionList[ci + 1].id
        setCurrentSection(nextSec)
        setCurrentQ(0)
        const nextAns = answers[nextSec]?.[0]
        setChosen(nextAns?.chosen ?? null)
        setShowExp(false)
      } else {
        finishExam()
      }
    }
  }

  function prevQuestion() {
    if (currentQ > 0) {
      setCurrentQ(q => q - 1)
      const prevAns = answers[currentSection]?.[currentQ - 1]
      setChosen(prevAns?.chosen ?? null)
      setShowExp(prevAns?.chosen !== null)
    }
  }

  function jumpToSection(secId: string) {
    setCurrentSection(secId)
    setCurrentQ(0)
    const ans = answers[secId]?.[0]
    setChosen(ans?.chosen ?? null)
    setShowExp(ans?.chosen !== null)
  }

  // ── SINAV BİTİR ──────────────────────────────────────────────────────────
  const analyzeWrongAnswers = async () => {
    // answers: { [sectionId]: {questionIndex, answer, ...}[] }
    const wrongQs: string[] = []
    for (const [secId, sectionAnswers] of Object.entries(answers)) {
      for (const sa of (sectionAnswers as any[])) {
        if (wrongQs.length >= 5) break
        const qIdx = sa.questionIndex ?? sa.qIndex ?? sa.idx ?? 0
        const q = sections[secId]?.[qIdx]
        if (q && sa.answer !== undefined && sa.answer !== null && sa.answer !== q.ans) {
          wrongQs.push(`Soru: ${q.q}\nVerilen: ${q.opts?.[sa.answer] || '?'}\nDoğru: ${q.opts?.[q.ans]}\nAçıklama: ${q.exp || ''}`)
        }
      }
    }


    if (wrongQs.length === 0) return
    setAiLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Öğrenci şu soruları yanlış yaptı. Her birini kısaca (2-3 cümle) analiz et ve neden yanlış yaptığını, nasıl öğreneceğini açıkla:\n\n${wrongQs.join('\n---\n')}`
          }],
          topic: 'sınav analizi',
          language: 'Türkçe'
        })
      })
      const data = await res.json()
      setAiAnalysis(data.reply || '')
    } catch {}
    setAiLoading(false)
  }

  const finishExam = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const spent = Math.round((Date.now() - startTimeRef.current) / 1000)
    setTimeSpent(spent)
    setScreen('loading')
    setLoadingMsg('Sonuçlar hesaplanıyor...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-exam', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ examId, answers, timeSpent: spent, examType: selectedExam }),
      })
      const data = await res.json()
      setResult(data)
      setScreen('result')
      // AI yanlış analizi başlat
      setTimeout(() => analyzeWrongAnswers(), 500)
    } catch {
      setScreen('result')
    }
  }, [examId, answers, selectedExam])

  // ── İSTATİSTİKLER ────────────────────────────────────────────────────────
  function getSectionStats(secId: string) {
    const ans = answers[secId] || []
    const answered = ans.filter(a => a.chosen !== null).length
    const correct = ans.filter(a => a.correct === true).length
    const wrong = ans.filter(a => a.correct === false).length
    const total = sections[secId]?.length || 0
    const net = Math.max(0, correct - wrong * 0.25)
    return { answered, correct, wrong, total, net }
  }

  function getTotalStats() {
    let correct = 0, wrong = 0, answered = 0, total = 0
    for (const secId of Object.keys(answers)) {
      const s = getSectionStats(secId)
      correct += s.correct; wrong += s.wrong
      answered += s.answered; total += s.total
    }
    const net = Math.max(0, correct - wrong * 0.25)
    return { correct, wrong, answered, total, net }
  }

  // ─── EKRANLAR ────────────────────────────────────────────────────────────

  // YÜKLEME
  if (screen === 'loading') return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: '16px' }}>
      <div style={{ width: 48, height: 48, border: '4px solid var(--bg2)', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: '15px', color: 'var(--text2)', fontWeight: 500 }}>{loadingMsg}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  )

  // SINAV SEÇİM
  if (screen === 'select') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <PageHeader title="Sınav Simülasyonu" subtitle="Gerçek sınav formatında pratik yap" icon="🎯" color="#6366f1" backHref="/quiz" backLabel="Teste dön" />

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '0 1rem' }}>

        {profile?.plan === 'free' && (
          <div style={{ padding: '14px 16px', borderRadius: '14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#6366f1' }}>Premium özellik</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Sınav simülasyonu Premium ve Unlimited planlarda kullanılabilir.</div>
            </div>
            <button onClick={() => router.push('/pricing')} style={{ padding: '8px 16px', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
              Yükselt
            </button>
          </div>
        )}

        {/* Demo / Tam mod */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            { val: true, label: '⚡ Demo', desc: 'Her bölümden ~4 soru, kısa süre' },
            { val: false, label: '📋 Tam Sınav', desc: 'Gerçek soru sayısı ve süre' },
          ].map(opt => (
            <button key={String(opt.val)} onClick={() => setDemoMode(opt.val)} style={{
              flex: 1, padding: '12px', borderRadius: '12px', border: `2px solid ${demoMode === opt.val ? '#6366f1' : 'var(--border)'}`,
              background: demoMode === opt.val ? 'rgba(99,102,241,0.08)' : 'var(--bg2)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
            }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: demoMode === opt.val ? '#6366f1' : 'var(--primary)' }}>{opt.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Sınav kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '12px' }}>
          {Object.entries(EXAM_META).map(([key, meta]) => {
            const fmt = formats[key]
            const isSelected = selectedExam === key
            return (
              <button key={key} onClick={() => setSelectedExam(isSelected ? null : key)}
                disabled={profile?.plan === 'free'}
                style={{
                  textAlign: 'left', padding: '18px', borderRadius: '16px', cursor: profile?.plan === 'free' ? 'not-allowed' : 'pointer',
                  border: `2px solid ${isSelected ? meta.color : 'var(--border)'}`,
                  background: isSelected ? meta.bg : 'var(--bg2)',
                  transition: 'all 0.15s', opacity: profile?.plan === 'free' ? 0.6 : 1,
                  fontFamily: 'var(--font-sans)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ fontSize: '28px' }}>{meta.emoji}</div>
                  <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '99px', background: meta.bg, color: meta.color, fontWeight: 600, border: `1px solid ${meta.color}33` }}>{meta.badge}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '20px', color: isSelected ? meta.color : 'var(--primary)', marginBottom: '4px' }}>{key === 'KPSS_GENEL' ? 'KPSS' : key}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }}>{fmt?.fullName || key}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  {fmt?.description || '...'}
                </div>
                {fmt && (
                  <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {fmt.sections.slice(0, 4).map((s: any) => (
                      <span key={s.id} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
                        {s.label} ({s.count})
                      </span>
                    ))}
                    {fmt.sections.length > 4 && (
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '99px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text3)' }}>
                        +{fmt.sections.length - 4} bölüm
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {selectedExam && (
          <div style={{ marginTop: '1.5rem', padding: '16px', borderRadius: '16px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>
                  {demoMode ? '⚡ Demo' : '📋 Tam'} {selectedExam === 'KPSS_GENEL' ? 'KPSS' : selectedExam} sınavı hazır
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '3px' }}>
                  {demoMode
                    ? `~${(formats[selectedExam]?.sections.length || 0) * 4} soru · ${Math.round((formats[selectedExam]?.duration || 60) * 0.25)} dakika`
                    : `${formats[selectedExam]?.sections.reduce((a: number, s: any) => a + s.count, 0)} soru · ${formats[selectedExam]?.duration} dakika`
                  }
                </div>
              </div>
              <button onClick={startExam} style={{
                padding: '12px 24px', borderRadius: '12px', background: EXAM_META[selectedExam as keyof typeof EXAM_META]?.color || '#6366f1',
                color: '#fff', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                🚀 Sınavı Başlat
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )

  // SINAV EKRANI
  if (screen === 'exam' && examFormat) {
    const sectionQs = sections[currentSection] || []
    const q = sectionQs[currentQ]
    const stats = getTotalStats()
    const sectionMeta = EXAM_META[selectedExam as keyof typeof EXAM_META]
    const timeWarning = timeLeft < 300
    const currentSectionInfo = examFormat.sections.find(s => s.id === currentSection)

    // Soru numarası (tüm sınav içinde)
    let globalQNum = 0
    for (const sec of examFormat.sections) {
      if (sec.id === currentSection) { globalQNum += currentQ + 1; break }
      globalQNum += sections[sec.id]?.length || 0
    }
    const totalQCount = examFormat.sections.reduce((a, s) => a + (sections[s.id]?.length || 0), 0)

    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>

        {/* ── FLOATING TIMER — Sağ köşe, masaüstü ── */}
        <div className="desktop-only" style={{
          position: 'fixed', right: '24px', top: '80px', zIndex: 200,
          background: timeWarning ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' : 'linear-gradient(135deg, #082465, #1e3a8a)',
          borderRadius: '20px',
          padding: '16px 20px',
          boxShadow: timeWarning ? '0 8px 32px rgba(220,38,38,0.4)' : '0 8px 32px rgba(8,36,101,0.4)',
          border: `1px solid ${timeWarning ? 'rgba(252,165,165,0.3)' : 'rgba(255,255,255,0.1)'}`,
          textAlign: 'center',
          minWidth: '120px',
          animation: timeWarning && timeLeft < 60 ? 'pulse 1s infinite' : 'none',
        }}>
          {/* Saat ikonu */}
          <div style={{ fontSize: '28px', marginBottom: '6px', lineHeight: 1 }}>
            {timeWarning ? '⏰' : '🕐'}
          </div>
          {/* Zaman */}
          <div style={{
            fontFamily: 'monospace', fontWeight: 800, fontSize: '28px',
            color: timeWarning ? '#fca5a5' : '#fff',
            letterSpacing: '2px', lineHeight: 1,
          }}>
            {formatTime(timeLeft)}
          </div>
          {/* Alt etiket */}
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '6px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {timeWarning ? 'Az kaldı!' : 'Kalan Süre'}
          </div>
        </div>

        {/* ── ÜST BAR ── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: '#082465',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 2px 12px rgba(8,36,101,0.3)',
        }}>
          {/* Sınav adı */}
          <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff', flexShrink: 0 }}>
            {selectedExam === 'KPSS_GENEL' ? 'KPSS' : selectedExam}
          </div>

          {/* İlerleme barı */}
          <div style={{ flex: 1, height: 6, borderRadius: '99px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: '99px', background: sectionMeta?.color || '#6366f1', width: `${(stats.answered / Math.max(totalQCount, 1)) * 100}%`, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>{stats.answered}/{totalQCount}</div>

          {/* Üst bardaki timer — sadece mobilde görünür */}
          <div className="mobile-only" style={{
            padding: '5px 12px', borderRadius: '8px',
            background: timeWarning ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.1)',
            border: `1px solid ${timeWarning ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.15)'}`,
            fontFamily: 'monospace', fontWeight: 700, fontSize: '14px',
            color: timeWarning ? '#fca5a5' : '#fff',
            flexShrink: 0,
          }}>
            {formatTime(timeLeft)}
          </div>

          <button onClick={() => { if (confirm('Sınavı bitirmek istediğinize emin misiniz?')) finishExam() }}
            style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)', color: '#fca5a5', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
            Bitir
          </button>
        </div>

        {/* ── BÖLÜM SEKMELERI ── */}
        <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '0 8px', display: 'flex', gap: '2px', overflowX: 'auto' }}>
          {examFormat.sections.map(sec => {
            const s = getSectionStats(sec.id)
            const isActive = sec.id === currentSection
            return (
              <button key={sec.id} onClick={() => jumpToSection(sec.id)} style={{
                padding: '10px 12px', borderRadius: 0, border: 'none', cursor: 'pointer',
                background: 'transparent', fontFamily: 'var(--font-sans)',
                borderBottom: isActive ? `3px solid ${sectionMeta?.color || '#6366f1'}` : '3px solid transparent',
                color: isActive ? (sectionMeta?.color || '#6366f1') : 'var(--text3)',
                fontWeight: isActive ? 700 : 400, fontSize: '12px', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}>
                {sec.label}
                <span style={{ marginLeft: '5px', fontSize: '10px', opacity: 0.7 }}>
                  {s.answered}/{s.total}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── SORU ALANI ── */}
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.25rem 1rem' }}>

          {/* Bölüm başlığı */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: sectionMeta?.color || '#6366f1', background: sectionMeta?.bg, padding: '3px 10px', borderRadius: '99px' }}>
              {currentSectionInfo?.label}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
              Soru {currentQ + 1} / {sectionQs.length} · Genel {globalQNum}/{totalQCount}
            </span>
          </div>

          {q ? (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--primary)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
                {q.q.split(/(\[[^\]]+\])/).map((part: string, idx: number) =>
                  part.startsWith('[') && part.endsWith(']')
                    ? <span key={idx} style={{ textDecoration: 'underline', textDecorationStyle: 'double', textDecorationColor: '#6366f1', fontWeight: 700 }}>{part.slice(1, -1)}</span>
                    : <span key={idx}>{part}</span>
                )}
              </div>

              {/* Şıklar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {q.opts.map((opt, i) => {
                  const isChosen = chosen === i
                  const isCorrect = i === q.ans
                  let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--primary)'

                  if (chosen !== null) {
                    if (isCorrect) { bg = 'rgba(22,163,74,0.1)'; border = '#16a34a'; color = '#15803d' }
                    else if (isChosen) { bg = 'rgba(220,38,38,0.1)'; border = '#dc2626'; color = '#dc2626' }
                  } else if (isChosen) {
                    bg = 'rgba(99,102,241,0.1)'; border = '#6366f1'; color = '#6366f1'
                  }

                  return (
                    <button key={i} onClick={() => selectAnswer(i)} disabled={chosen !== null}
                      style={{
                        textAlign: 'left', padding: '12px 14px', borderRadius: '10px',
                        border: `1.5px solid ${border}`, background: bg, color, cursor: chosen !== null ? 'default' : 'pointer',
                        fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: 1.5,
                        display: 'flex', gap: '10px', alignItems: 'flex-start', transition: 'all 0.15s',
                      }}>
                      <span style={{ fontWeight: 700, flexShrink: 0, width: '18px' }}>
                        {['A', 'B', 'C', 'D'][i]}
                      </span>
                      {opt}
                      {chosen !== null && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
                      {chosen !== null && isChosen && !isCorrect && <span style={{ marginLeft: 'auto' }}>✗</span>}
                    </button>
                  )
                })}
              </div>

              {/* Açıklama */}
              {showExp && q.exp && (
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(30,207,184,0.08)', border: '1px solid rgba(30,207,184,0.2)', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                  💡 {q.exp}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>Bu bölümde soru yüklenemedi.</div>
          )}

          {/* Navigasyon */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={prevQuestion} disabled={currentQ === 0 && currentSection === examFormat.sections[0]?.id}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 500 }}>
              ← Önceki
            </button>
            <button onClick={nextQuestion}
              style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: sectionMeta?.color || '#6366f1', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700 }}>
              {currentQ === sectionQs.length - 1 && currentSection === examFormat.sections[examFormat.sections.length - 1]?.id
                ? '🏁 Sınavı Bitir'
                : 'Sonraki →'}
            </button>
          </div>

          {/* Soru haritası — mevcut bölüm */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>Soru haritası — {currentSectionInfo?.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {sectionQs.map((_, qi) => {
                const ans = answers[currentSection]?.[qi]
                const isActive = qi === currentQ
                let bg = 'var(--bg2)', border = '1px solid var(--border)', color = 'var(--text3)'
                if (isActive) { bg = sectionMeta?.color || '#6366f1'; border = 'none'; color = '#fff' }
                else if (ans?.correct === true) { bg = 'rgba(22,163,74,0.15)'; border = '1px solid #16a34a'; color = '#15803d' }
                else if (ans?.correct === false) { bg = 'rgba(220,38,38,0.15)'; border = '1px solid #dc2626'; color = '#dc2626' }

                return (
                  <button key={qi} onClick={() => { setCurrentQ(qi); const a = answers[currentSection]?.[qi]; setChosen(a?.chosen ?? null); setShowExp(a?.chosen !== null) }}
                    style={{ width: 30, height: 30, borderRadius: '6px', border, background: bg, color, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    {qi + 1}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      </main>
    )
  }

  // SONUÇ EKRANI
  if (screen === 'result' && examFormat) {
    const stats = getTotalStats()
    const scorePct = examFormat.maxScore > 0 ? Math.round((result?.estimatedScore || 0) / examFormat.maxScore * 100) : 0
    const sectionMeta = EXAM_META[selectedExam as keyof typeof EXAM_META]

    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
        <PageHeader title="Sınav Sonucu" subtitle={examFormat.fullName} icon="🏁" color={sectionMeta?.color || '#6366f1'} backHref="/exam" backLabel="Yeni sınav" />

        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 1rem' }}>

          {/* Büyük skor */}
          <div style={{ textAlign: 'center', padding: '2rem 1rem', marginBottom: '1rem', borderRadius: '20px', background: `linear-gradient(135deg, #082465, ${sectionMeta?.color || '#6366f1'})`, color: '#fff' }}>
            <div style={{ fontSize: '13px', opacity: 0.7, marginBottom: '8px' }}>Tahmini Puan</div>
            <div style={{ fontSize: '56px', fontWeight: 900, lineHeight: 1 }}>{result?.estimatedScore ?? '—'}</div>
            <div style={{ fontSize: '14px', opacity: 0.6, marginTop: '4px' }}>/ {examFormat.maxScore}</div>
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '13px' }}>
              <span>✓ {stats.correct} doğru</span>
              <span>✗ {stats.wrong} yanlış</span>
              <span>— {stats.total - stats.answered} boş</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '13px', opacity: 0.7 }}>
              ⏱ {formatTime(timeSpent)} sürede tamamlandı
            </div>
          </div>

          {/* Bölüm bazlı sonuçlar */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
              Bölüm bazlı sonuçlar
            </div>
            {examFormat.sections.map(sec => {
              const sNet = result?.sectionNets?.[sec.id] || getSectionStats(sec.id)
              const secPct = sec.count > 0 ? Math.round(((sNet.correct || 0) / sec.count) * 100) : 0
              return (
                <div key={sec.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>{sec.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '8px' }}>
                        {sNet.correct || 0}D · {sNet.wrong || 0}Y · Net {(sNet.net || 0).toFixed(2)}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: pctColor(secPct) }}>%{secPct}</span>
                  </div>
                  <div style={{ height: '5px', borderRadius: '99px', background: 'var(--bg2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '99px', background: pctColor(secPct), width: `${secPct}%`, transition: 'width 0.6s' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Aksiyon butonları */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setScreen('select'); setSelectedExam(null); setResult(null) }}
              style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              🔄 Tekrar Dene
            </button>
            <button onClick={() => router.push('/analysis')}
              style={{ flex: 1, padding: '13px', borderRadius: '12px', border: 'none', background: sectionMeta?.color || '#6366f1', color: '#fff', fontWeight: 600, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              📊 Analize Git
            </button>
          </div>

          {/* AI Yanlış Analizi */}
          {(aiLoading || aiAnalysis) && (
            <div style={{ marginTop: '1rem', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div style={{ background: 'linear-gradient(135deg, #082465, #1e3a8a)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🤖</span>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>AI Yanlış Analizi</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>Pratium Asistan yanlışlarını değerlendiriyor</div>
                </div>
              </div>
              <div style={{ padding: '16px', background: 'var(--bg2)' }}>
                {aiLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text3)', fontSize: '13px' }}>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(99,102,241,0.2)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    Yanlışların analiz ediliyor...
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {aiAnalysis}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    )
  }

  return null
}
