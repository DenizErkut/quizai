'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const QUESTION_INTERVAL_SECONDS = 90 // dikkat sorusu aralığı

type Phase = 'upload' | 'ready' | 'playing' | 'question' | 'finished'

interface Question {
  question: string
  options: string[]
  correct_index: number
}

export default function ReadingPage() {
  const router = useRouter()
  const supabase = createClient() as any

  const [phase, setPhase] = useState<Phase>('upload')
  const [grade, setGrade] = useState<string>('')

  // Yükleme
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingText, setProcessingText] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Materyal & oturum
  const [materialId, setMaterialId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [chunks, setChunks] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string>('')

  // Oynatıcı
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  const [showText, setShowText] = useState(false) // varsayılan gizli — asıl amaç dinleme dikkatini ölçmek
  const [needsResumeTap, setNeedsResumeTap] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCache = useRef<Map<number, string>>(new Map())
  const accumulatedSeconds = useRef(0)
  const pendingText = useRef('')

  // Dikkat soruları — artık bir kerede en az 3 soru geliyor, sırayla soruluyor
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionIdx, setQuestionIdx] = useState(0)
  const [chosenIndex, setChosenIndex] = useState<number | null>(null)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  // Kitaplık — daha önce yüklenen kitapların SADECE başlığı (içerik saklanmıyor)
  const [library, setLibrary] = useState<{ id: string; title: string; created_at: string }[]>([])

  useEffect(() => {
    loadLibrary()
  }, [])

  async function loadLibrary() {
    try {
      const headers = await authHeader()
      const res = await fetch('/api/reading/upload', { headers })
      const data = await res.json()
      if (res.ok) setLibrary(data.materials || [])
    } catch {}
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (!user) { router.push('/login'); return }
      supabase.from('profiles').select('grade').eq('id', user.id).maybeSingle()
        .then(({ data }: any) => { if (data?.grade) setGrade(data.grade) })
    })
  }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  // ── Dosya yükleme ──
  // Dosya doğrudan Supabase Storage'a yüklenir (kendi user_id klasörüne),
  // sonra API'ye sadece dosya yolu gönderilir. Önceki parçalı yükleme Vercel
  // serverless'ta güvenilir değildi (parçalar farklı sunucu kopyalarına düşüp
  // birleşemiyordu ve yükleme %40-70 arasında takılıyordu).
  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      setUploadError('Sadece PDF, Word (.docx) veya düz metin (.txt) dosyaları desteklenir.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Dosya çok büyük (en fazla 50MB).')
      return
    }
    setUploadError('')
    setUploading(true)
    setUploadProgress(5)
    setProcessingText(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // 1) Storage'a yükle
      const storagePath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      setUploadProgress(15)
      const { error: upErr } = await supabase.storage
        .from('reading-uploads')
        .upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
      if (upErr) throw new Error('Dosya yüklenemedi: ' + upErr.message)

      // 2) API'ye işlet — metin çıkarma/OCR bu aşamada
      setUploadProgress(60)
      setProcessingText(true)
      const headers = await authHeader()
      const res = await fetch('/api/reading/upload', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: storagePath, ext, title: file.name.replace(/\.[^.]+$/, '') }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Dosya işlenemedi.')

      setProcessingText(false)
      setUploadProgress(100)
      setMaterialId(data.material_id)
      setTitle(data.title)
      setChunks(data.chunks)

      // Okuma oturumu oluştur
      const { data: sessionRow } = await supabase.from('reading_sessions').insert({
        user_id: user.id,
        material_id: data.material_id,
        total_chunks: data.chunk_count,
      }).select('id').single()

      setSessionId(sessionRow?.id || '')
      setPhase('ready')
      loadLibrary()
    } catch (e: any) {
      setUploadError(e.message || 'Dosya yüklenemedi.')
    } finally {
      setUploading(false)
      setProcessingText(false)
    }
  }

  // ── TTS sesini getir (cache'li) ──
  const getAudioUrl = useCallback(async (index: number): Promise<string | null> => {
    if (audioCache.current.has(index)) return audioCache.current.get(index)!
    if (index < 0 || index >= chunks.length) return null
    const headers = await authHeader()
    const res = await fetch('/api/reading/tts', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunks[index] }),
    })
    if (!res.ok) return null
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    audioCache.current.set(index, url)
    return url
  }, [chunks])

  // Sıradaki parçayı arka planda önden getir
  function prefetchNext(index: number) {
    const next = index + 1
    if (next < chunks.length && !audioCache.current.has(next)) {
      getAudioUrl(next).catch(() => {})
    }
  }

  async function playChunk(index: number) {
    setAudioLoading(true)
    setNeedsResumeTap(false)
    const url = await getAudioUrl(index)
    setAudioLoading(false)
    if (!url || !audioRef.current) return
    audioRef.current.src = url
    try {
      await audioRef.current.play()
      setIsPlaying(true)
      prefetchNext(index)
    } catch {
      // Tarayıcı otomatik oynatmayı engellemiş olabilir — kullanıcıdan dokunma iste
      setNeedsResumeTap(true)
      setIsPlaying(false)
    }
  }

  function startReading() {
    setPhase('playing')
    setCurrentIndex(0)
    accumulatedSeconds.current = 0
    pendingText.current = ''
    setTimeout(() => playChunk(0), 50)
  }

  async function handleAudioEnded() {
    const dur = audioRef.current?.duration || 0
    accumulatedSeconds.current += dur
    pendingText.current += ' ' + (chunks[currentIndex] || '')

    const isLastChunk = currentIndex >= chunks.length - 1
    const shouldAsk = accumulatedSeconds.current >= QUESTION_INTERVAL_SECONDS || isLastChunk

    if (shouldAsk && pendingText.current.trim().length > 30) {
      await askAttentionQuestion()
      return
    }

    if (isLastChunk) {
      finishSession()
      return
    }

    const next = currentIndex + 1
    setCurrentIndex(next)
    playChunk(next)
  }

  async function askAttentionQuestion() {
    setPhase('question')
    setIsPlaying(false)
    setQuestionLoading(true)
    setQuestions([])
    setQuestionIdx(0)
    setChosenIndex(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/reading/question', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pendingText.current, grade }),
      })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) throw new Error(data?.error)
      setQuestions(data.questions)
    } catch {
      // Sorular üretilemezse dikkat kontrolünü atla, okumaya devam et
      setQuestions([])
      resumeAfterQuestion()
    } finally {
      setQuestionLoading(false)
    }
  }

  async function answerQuestion(idx: number) {
    const currentQuestion = questions[questionIdx]
    if (chosenIndex !== null || !currentQuestion) return
    setChosenIndex(idx)
    const isCorrect = idx === currentQuestion.correct_index
    const newScore = { correct: score.correct + (isCorrect ? 1 : 0), total: score.total + 1 }
    setScore(newScore)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('reading_attention_checks').insert({
        session_id: sessionId,
        user_id: user.id,
        chunk_index: currentIndex,
        question: currentQuestion.question,
        options: currentQuestion.options,
        correct_index: currentQuestion.correct_index,
        chosen_index: idx,
        is_correct: isCorrect,
        answered_at: new Date().toISOString(),
      })
      await supabase.from('reading_sessions').update({
        correct_count: newScore.correct,
        total_questions: newScore.total,
        current_chunk: currentIndex,
        last_activity_at: new Date().toISOString(),
      }).eq('id', sessionId)
    } catch { /* skorlama başarısız olsa da okumayı bloklamayalım */ }
  }

  function nextQuestionOrResume() {
    if (questionIdx < questions.length - 1) {
      setQuestionIdx(i => i + 1)
      setChosenIndex(null)
    } else {
      resumeAfterQuestion()
    }
  }

  function resumeAfterQuestion() {
    accumulatedSeconds.current = 0
    pendingText.current = ''
    setQuestions([])
    setQuestionIdx(0)
    setChosenIndex(null)

    if (currentIndex >= chunks.length - 1) {
      finishSession()
      return
    }
    const next = currentIndex + 1
    setCurrentIndex(next)
    setPhase('playing')
    playChunk(next)
  }

  async function finishSession() {
    setPhase('finished')
    setIsPlaying(false)
    try {
      await supabase.from('reading_sessions').update({
        completed: true,
        current_chunk: chunks.length,
        last_activity_at: new Date().toISOString(),
      }).eq('id', sessionId)
    } catch {}
  }

  function togglePlayPause() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setNeedsResumeTap(true))
    }
  }

  function resetAll() {
    audioCache.current.forEach(url => URL.revokeObjectURL(url))
    audioCache.current.clear()
    setPhase('upload')
    setMaterialId(''); setTitle(''); setChunks([]); setSessionId('')
    setCurrentIndex(0); setIsPlaying(false); setQuestions([]); setQuestionIdx(0); setChosenIndex(null)
    setScore({ correct: 0, total: 0 })
    accumulatedSeconds.current = 0
    pendingText.current = ''
  }

  const estMinutes = chunks.length > 0
    ? Math.max(1, Math.round(chunks.reduce((sum, c) => sum + c.split(/\s+/).length, 0) / 150))
    : 0
  const progressPct = chunks.length > 0 ? Math.round((currentIndex / chunks.length) * 100) : 0

  return (
    <main style={{ minHeight: '100vh', padding: '2rem 1.5rem 4rem', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 className="serif" style={{ fontSize: '24px', color: 'var(--primary)' }}>🎧 Sesli Okuma</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '4px' }}>
            Bir kitap veya metin yükle, sesli dinle — arada dikkat soruları sorulacak.
          </p>
        </div>

        {/* ── YÜKLEME ── */}
        {phase === 'upload' && (
          <div className="card anim-up" style={{ padding: '1.5rem' }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) handleFile(f)
              }}
              style={{
                border: '2px dashed var(--border)', borderRadius: '16px',
                padding: '2.5rem 1.5rem', textAlign: 'center', cursor: 'pointer',
                background: 'var(--bg2)',
              }}>
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>📚</div>
              <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                Kitabını buraya sürükle veya tıkla
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>PDF, Word (.docx) veya düz metin (.txt)</div>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {uploading && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ height: '8px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${uploadProgress}%`, background: 'var(--accent)',
                    transition: 'width 0.3s', ...(processingText ? { animation: 'pulse-bar 1.4s ease-in-out infinite' } : {}),
                  }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px', textAlign: 'center' }}>
                  {processingText
                    ? '📖 Kitap taranıyor ve metin çıkarılıyor... (taranmış sayfalarda birkaç dakika sürebilir)'
                    : `Yükleniyor... ${uploadProgress}%`}
                </div>
                <style>{`@keyframes pulse-bar { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
              </div>
            )}

            {uploadError && (
              <div style={{ marginTop: '1rem', fontSize: '13px', color: 'var(--red)', textAlign: 'center' }}>
                {uploadError}
              </div>
            )}
          </div>
        )}

        {/* ── KİTAPLIĞIM (sadece başlık geçmişi — içerik saklanmıyor) ── */}
        {phase === 'upload' && library.length > 0 && (
          <div className="card anim-up" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '10px' }}>
              📚 Daha Önce Dinlediklerin
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {library.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: '10px', background: 'var(--bg2)',
                  border: '1px solid var(--border)', fontSize: '13px',
                }}>
                  <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📖 {item.title}
                  </span>
                  <span style={{ color: 'var(--text3)', fontSize: '11px', flexShrink: 0, marginLeft: '10px' }}>
                    {new Date(item.created_at).toLocaleDateString('tr-TR')}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '10px' }}>
              Not: Kitapların içeriği saklanmaz, sadece hangi kitapları dinlediğin burada listelenir. Tekrar dinlemek için dosyayı yeniden yüklemen gerekir.
            </div>
          </div>
        )}

        {/* ── HAZIR ── */}
        {phase === 'ready' && (
          <div className="card anim-up" style={{ padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>📖</div>
            <div style={{ fontWeight: 700, fontSize: '17px', color: 'var(--primary)', marginBottom: '6px' }}>{title}</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>
              Tahmini süre: ~{estMinutes} dk · {chunks.length} bölüm
            </div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', color: 'var(--text2)', marginBottom: '1.25rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={showText} onChange={e => setShowText(e.target.checked)} />
              Okurken metni ekranda da göster
            </label>

            <button className="btn btn-primary" onClick={startReading} style={{ width: '100%', justifyContent: 'center' }}>
              ▶️ Okumaya Başla
            </button>
            <button onClick={resetAll} style={{ marginTop: '10px', background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              Farklı bir dosya yükle
            </button>
          </div>
        )}

        {/* ── OYNATICI ── */}
        {(phase === 'playing' || phase === 'question') && (
          <div className="card anim-up" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>{title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{currentIndex + 1} / {chunks.length}</div>
            </div>

            <div style={{ height: '6px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden', marginBottom: '1.25rem' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
            </div>

            <audio ref={audioRef} onEnded={handleAudioEnded} style={{ display: 'none' }} />

            {phase === 'playing' && (
              <>
                <div style={{
                  minHeight: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '1.5rem', borderRadius: '14px', background: 'var(--bg2)', border: '1px solid var(--border)',
                  marginBottom: '1.25rem', textAlign: 'center',
                }}>
                  {audioLoading ? (
                    <span className="spinner" style={{ width: 24, height: 24 }} />
                  ) : showText ? (
                    <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>{chunks[currentIndex]}</p>
                  ) : (
                    <div>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{isPlaying ? '🔊' : '⏸️'}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
                        {isPlaying ? 'Dinliyorsun...' : 'Durduruldu'}
                      </div>
                    </div>
                  )}
                </div>

                {needsResumeTap && (
                  <button className="btn btn-primary" onClick={() => playChunk(currentIndex)} style={{ width: '100%', justifyContent: 'center', marginBottom: '10px' }}>
                    ▶️ Devam etmek için dokun
                  </button>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button className="btn" disabled={currentIndex === 0} onClick={() => { const p = currentIndex - 1; setCurrentIndex(p); playChunk(p) }}>
                    ⏮
                  </button>
                  <button className="btn btn-primary" onClick={togglePlayPause} style={{ minWidth: '110px', justifyContent: 'center' }}>
                    {isPlaying ? '⏸ Duraklat' : '▶️ Oynat'}
                  </button>
                  <button className="btn" disabled={currentIndex >= chunks.length - 1} onClick={() => { const n = currentIndex + 1; setCurrentIndex(n); playChunk(n) }}>
                    ⏭
                  </button>
                </div>
              </>
            )}

            {phase === 'question' && (
              <div>
                {questionLoading && (
                  <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                    <span className="spinner" style={{ width: 24, height: 24 }} />
                    <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '10px' }}>Dikkat soruları hazırlanıyor...</div>
                  </div>
                )}

                {!questionLoading && questions.length > 0 && (
                  <div>
                    <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(30,207,184,0.08)', border: '1px solid rgba(30,207,184,0.2)', fontSize: '12px', color: '#0f766e', marginBottom: '1rem', textAlign: 'center' }}>
                      🎯 Dikkat kontrolü — soru {questionIdx + 1} / {questions.length}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--primary)', marginBottom: '1rem' }}>
                      {questions[questionIdx].question}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {questions[questionIdx].options.map((opt, i) => {
                        const isChosen = chosenIndex === i
                        const isCorrectOpt = i === questions[questionIdx].correct_index
                        const showResult = chosenIndex !== null
                        const bg = showResult
                          ? (isCorrectOpt ? 'rgba(34,197,94,0.12)' : isChosen ? 'rgba(220,38,38,0.1)' : 'var(--bg2)')
                          : 'var(--bg2)'
                        const border = showResult
                          ? (isCorrectOpt ? '1.5px solid #22c55e' : isChosen ? '1.5px solid var(--red)' : '1px solid var(--border)')
                          : '1px solid var(--border)'
                        return (
                          <button key={i} disabled={chosenIndex !== null} onClick={() => answerQuestion(i)}
                            style={{
                              textAlign: 'left', padding: '12px 14px', borderRadius: '10px',
                              border, background: bg, fontSize: '13px', color: 'var(--text)',
                              cursor: chosenIndex !== null ? 'default' : 'pointer', fontFamily: 'var(--font-sans)',
                            }}>
                            {opt}
                          </button>
                        )
                      })}
                    </div>

                    {chosenIndex !== null && (
                      <button className="btn btn-primary" onClick={nextQuestionOrResume} style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                        {questionIdx < questions.length - 1 ? 'Sıradaki Soru →' : 'Okumaya Devam Et →'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── BİTİŞ ── */}
        {phase === 'finished' && (
          <div className="card anim-up" style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎉</div>
            <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--primary)', marginBottom: '6px' }}>Kitabı bitirdin!</div>
            <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '1.5rem' }}>
              Dikkat skoru: <strong>{score.correct} / {score.total}</strong> doğru
            </div>
            <button className="btn btn-primary" onClick={resetAll} style={{ width: '100%', justifyContent: 'center' }}>
              📚 Yeni Kitap Yükle
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
