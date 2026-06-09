'use client'
import { useState } from 'react'
import Link from 'next/link'
import FileUploader, { type UploadedFile } from '@/components/FileUploader'
import { SUBJECT_MAP, DIFFICULTIES, type QuestionType, type Profile } from '@/lib/quiz-constants'

interface QuizSetupProps {
  profile: Profile | null
  currentLang: string
  selectedTopic: string
  setSelectedTopic: (v: string) => void
  customTopic: string
  setCustomTopic: (v: string) => void
  qCount: number
  setQCount: (v: number) => void
  difficulty: string
  setDifficulty: (v: string) => void
  includeVisuals: boolean
  setIncludeVisuals: (v: boolean) => void
  questionType: QuestionType
  setQuestionType: (v: QuestionType) => void
  uploadedFiles: UploadedFile[]
  setUploadedFiles: (v: UploadedFile[]) => void
  favorites: string[]
  mebTopics: Record<string, string[]>
  topicSummary: { summary: string; keyPoints: string[]; keyTerms: { term: string; definition: string }[]; rememberThis: string } | null
  summaryLoading: boolean
  showSummary: boolean
  setShowSummary: (v: boolean) => void
  onFetchSummary: (topic: string) => void
  onToggleFavorite: (topic: string) => void
  onStartQuiz: () => void
  testsLeft: number | null
  dailyLeft: number | null
  maxQCount: number
  topicErr: string
}

export default function QuizSetup({
  profile, currentLang, selectedTopic, setSelectedTopic, customTopic, setCustomTopic,
  qCount, setQCount, difficulty, setDifficulty, includeVisuals, setIncludeVisuals,
  questionType, setQuestionType, uploadedFiles, setUploadedFiles,
  favorites, mebTopics, topicSummary, summaryLoading, showSummary, setShowSummary,
  onFetchSummary, onToggleFavorite, onStartQuiz,
  testsLeft, dailyLeft, maxQCount, topicErr
}: QuizSetupProps) {
  const [openSubject, setOpenSubject] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  
  const level = profile ? (
    profile.grade.toLowerCase().includes('üniversite') || profile.grade.toLowerCase().includes('universite') ? 'universite' :
    profile.grade.toLowerCase().includes('lise') ? 'lise' :
    profile.grade.toLowerCase().includes('ortaokul') ? 'ortaokul' : 'ilkokul'
  ) : 'ortaokul'

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, var(--accent-bg) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '60px', left: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, var(--primary-bg) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      
      <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {profile && (
          <div className="anim-up" style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--accent-bg)', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 600, fontSize: '15px' }}>
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px' }}>Merhaba, {profile.name.split(' ')[0]}</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                <span className="badge badge-neon-glow" style={{ textTransform: 'none' }}>{profile.grade}</span>
                <span>·</span>
                <span>{currentLang}</span>
                {testsLeft !== null && (
                  <span className="badge" style={{ background: testsLeft === 0 ? 'var(--red-bg)' : 'var(--bg3)', color: testsLeft === 0 ? 'var(--red)' : 'var(--text3)' }}>
                    {testsLeft === 0 ? '⚠ Hak kalmadı' : `${testsLeft} test kaldı`}
                  </span>
                )}
                {dailyLeft !== null && dailyLeft <= 5 && (
                  <span className="badge badge-fire">
                    {dailyLeft === 0 ? '⏰ Limit Doldu' : `Bugün ${dailyLeft} hak`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {testsLeft !== null && testsLeft <= 3 && testsLeft > 0 && (
          <div className="anim-up tldr-card" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠ Bu ay sadece {testsLeft} test hakkın kaldı. Sınırsız moda geçmek ister misin?</span>
            <Link href="/pricing" style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '13px' }}>Yükselt 🚀</Link>
          </div>
        )}

        <div className="bento-card anim-up-1">
          <h2 className="serif" style={{ fontSize: '26px', marginBottom: '0.5rem', color: 'var(--text)' }}>Hangi konuyu test edelim?</h2>
          <p style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '1.5rem' }}>
            Hazır müfredat konularından seç, özelleştirilmiş başlığını yaz veya dosya fırlat.
          </p>

          {/* Favoriler */}
          {favorites.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="field-label">⭐ Favori Konularım</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                {favorites.map(fav => (
                  <button key={fav} onClick={() => { setSelectedTopic(fav); setCustomTopic('') }} className="btn btn-sm"
                    style={{ background: selectedTopic === fav ? 'var(--accent-2)' : 'var(--accent-2-bg)', color: selectedTopic === fav ? '#000' : 'var(--text)', borderColor: selectedTopic === fav ? 'var(--accent-2)' : 'transparent' }}>
                    🔥 {fav}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ders ve Ünite Seçimi */}
          <label className="field-label">Müfredat Branşı Seç</label>
          <div style={{ marginTop: '6px', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {Object.keys(SUBJECT_MAP[level] || SUBJECT_MAP.ortaokul).map(subj => (
                <button key={subj} onClick={() => setOpenSubject(openSubject === subj ? null : subj)} className="btn btn-sm"
                  style={{ background: openSubject === subj ? 'var(--accent-bg)' : 'var(--bg3)', color: openSubject === subj ? 'var(--accent)' : 'var(--text2)', borderColor: openSubject === subj ? 'var(--accent)' : 'transparent' }}>
                  {subj} {openSubject === subj ? '▲' : '▼'}
                </button>
              ))}
            </div>

            {openSubject && (SUBJECT_MAP[level] || SUBJECT_MAP.ortaokul)[openSubject] && (
              <div className="anim-pop" style={{ maxHeight: '240px', overflowY: 'auto', padding: '12px', borderRadius: 'var(--radius)', border: '2px solid var(--accent)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {mebTopics[openSubject] && mebTopics[openSubject].length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>📚 MEB Resmi Müfredatı</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {mebTopics[openSubject].map((unit: string) => (
                        <div key={unit} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg3)', borderRadius: 'var(--radius-pill)', paddingRight: '6px' }}>
                          <button onClick={() => { setSelectedTopic(unit); setCustomTopic(''); setOpenSubject(null) }} className="btn btn-sm" style={{ border: 'none', background: selectedTopic === unit ? 'var(--gradient)' : 'transparent', color: selectedTopic === unit ? '#fff' : 'var(--text)' }}>
                            {unit}
                          </button>
                          <button onClick={() => onToggleFavorite(unit)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: favorites.includes(unit) ? 1 : 0.3 }}>⭐</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>🎲 Genel Havuz Konuları</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(SUBJECT_MAP[level] || SUBJECT_MAP.ortaokul)[openSubject].map((topic: string) => (
                      <div key={topic} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg3)', borderRadius: 'var(--radius-pill)', paddingRight: '6px' }}>
                        <button onClick={() => { setSelectedTopic(topic); setCustomTopic(''); setOpenSubject(null) }} className="btn btn-sm" style={{ border: 'none', background: selectedTopic === topic ? 'var(--gradient)' : 'transparent', color: selectedTopic === topic ? '#fff' : 'var(--text)' }}>
                          {topic}
                        </button>
                        <button onClick={() => onToggleFavorite(topic)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: favorites.includes(topic) ? 1 : 0.3 }}>⭐</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedTopic && (
              <div className="anim-pop" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="badge badge-neon-glow">🎯 Aktif Ünite: {selectedTopic}</span>
                <button onClick={() => onFetchSummary(selectedTopic)} className="btn btn-sm" style={{ background: 'var(--primary-bg)', color: 'var(--primary)', border: 'none' }}>
                  📖 Hızlı Özet Çıkar
                </button>
                <button onClick={() => setSelectedTopic('')} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 700 }}>Kaldır ✕</button>
              </div>
            )}

            {/* Hızlı Konu Özeti Modalı */}
            {showSummary && (
              <div className="tldr-card anim-pop" style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--text)' }}>⚡ {selectedTopic || customTopic} Özeti</strong>
                  <button onClick={() => setShowSummary(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
                {summaryLoading ? (
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Yapay zeka akıllı özet çıkartıyor...</div>
                ) : topicSummary ? (
                  <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
                    <p style={{ marginBottom: '8px' }}>{topicSummary.summary}</p>
                    <div style={{ fontWeight: 700, margin: '6px 0 2px' }}>Kilit Noktalar:</div>
                    {topicSummary.keyPoints.map((p, i) => <div key={i}>• {p}</div>)}
                    {topicSummary.rememberThis && <div style={{ marginTop: '8px', fontWeight: 'bold', color: 'var(--primary)' }}>💡 Unutma: {topicSummary.rememberThis}</div>}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <label className="field-label">Veya Kendi Yapay Zeka Konunu Yaz</label>
          <textarea className="input" rows={2} placeholder="Örn: Kuantum Dolanıklığı, İkinci Göktürk Devleti, Hücre Bölünmesi Evreleri..." value={customTopic} onChange={e => { setCustomTopic(e.target.value); setSelectedTopic('') }} />

          <label className="field-label" style={{ marginTop: '1.25rem' }}>Özel Döküman Yükle (PDF, Word, vb.)</label>
          <FileUploader onFilesChange={setUploadedFiles} maxFiles={5} maxMB={20} />
          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: '8px', color: 'var(--green)', fontSize: '13px', fontWeight: 600 }}>
              ✓ {uploadedFiles.length} kaynak dosya kilitlendi. Soru üretimi bu dosya içeriğine odaklanacak!
            </div>
          )}

          {/* Gelişmiş Ayarlar Accordion */}
          <button onClick={() => setAdvancedOpen(!advancedOpen)} className="btn" style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'space-between', background: 'var(--bg3)', border: 'none' }}>
            <span>⚙️ Gelişmiş Motor Ayarları {!advancedOpen && <small style={{ opacity: 0.6 }}>(Soru tipi, Zorluk, Sayı)</small>}</span>
            <span>{advancedOpen ? '▲' : '▼'}</span>
          </button>

          {advancedOpen && (
            <div className="anim-pop" style={{ marginTop: '10px', padding: '14px', borderRadius: 'var(--radius)', background: 'var(--bg)', border: '2px solid var(--border)' }}>
              <label className="field-label" style={{ marginTop: 0 }}>Zorluk Algoritması</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '6px' }}>
                {DIFFICULTIES.map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)} className="btn"
                    style={{ flexDirection: 'column', padding: '10px', background: difficulty === d.value ? d.bg : 'var(--bg3)', borderColor: difficulty === d.value ? d.color : 'transparent', color: 'var(--text)' }}>
                    <span style={{ fontWeight: 800, color: d.color }}>{d.label}</span>
                    <small style={{ fontSize: '10px', opacity: 0.7 }}>{d.desc}</small>
                  </button>
                ))}
              </div>

              <label className="field-label" style={{ marginTop: '1rem' }}>Yeni Maarif Soru Tipleri</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
                {[
                  { value: 'multiple_choice', label: 'Çoktan Seçmeli', icon: '🔤' },
                  { value: 'fill_blank', label: 'Boşluk Doldurma', icon: '✏️' },
                  { value: 'true_false', label: 'Doğru / Yanlış', icon: '✓✗' },
                  { value: 'multi_true_false', label: 'Çoklu D/Y', icon: '📋✓✗' },
                  { value: 'table_fill', label: 'Tablo Doldurma', icon: '🗂️' },
                  { value: 'matching', label: 'Eşleştirme', icon: '🔗' },
                  { value: 'ordering', label: 'Sıralama', icon: '📋' },
                  { value: 'short_answer', label: 'Kısa Cevap', icon: '💬' },
                  { value: 'mixed', label: 'Karma Mod', icon: '🎲' },
                ].map(t => (
                  <button key={t.value} onClick={() => setQuestionType(t.value as QuestionType)} className="btn" style={{ padding: '8px', flexDirection: 'column', background: questionType === t.value ? 'var(--accent-bg)' : 'var(--bg3)', borderColor: questionType === t.value ? 'var(--accent)' : 'transparent', textOverflow: 'ellipsis' }}>
                    <span style={{ fontSize: '18px' }}>{t.icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>{t.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Soru Hacmi</label>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {[5, 10, 15, 20].map(n => (
                      <button key={n} disabled={n > maxQCount} onClick={() => setQCount(n)} className="btn btn-sm" style={{ flex: 1, background: qCount === n ? 'var(--gradient)' : 'var(--bg3)', color: qCount === n ? '#fff' : 'var(--text)', border: 'none' }}>
                        {n} Soru {n > maxQCount && '🔒'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="field-label">Görsel Motoru</label>
                  <button onClick={() => setIncludeVisuals(!includeVisuals)} className="btn btn-sm" style={{ marginTop: '4px', background: includeVisuals ? 'var(--accent-bg)' : 'var(--bg3)', color: includeVisuals ? 'var(--accent)' : 'var(--text2)', borderColor: includeVisuals ? 'var(--accent)' : 'transparent' }}>
                    {includeVisuals ? '📊 Grafik/SVG Açık' : '📝 Sadece Metin'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Konfigürasyon Özeti Bilgisi */}
          <div style={{ marginTop: '1.25rem', padding: '10px 14px', borderRadius: 'var(--radius)', background: 'var(--bg3)', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
            <span>📝 {qCount} Soru</span>
            <span>⚡ Zorluk: {difficulty.toUpperCase()}</span>
            <span>🌐 Dil: {currentLang}</span>
            {includeVisuals && <span>📊 Grafik Desteği</span>}
          </div>

          {topicErr && !uploadedFiles.length && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)', fontWeight: 700 }}>⚠️ {topicErr}</div>}

          <button className="btn btn-primary btn-lg btn-neon" onClick={onStartQuiz} style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} disabled={testsLeft === 0 || dailyLeft === 0}>
            {testsLeft === 0 ? 'Aylık Kota Sınırına Takıldın — Yükselt' : dailyLeft === 0 ? 'Günlük Limit Tükendi ⏰' : 'Sınav Simülasyonunu Başlat ⚡'}
          </button>
        </div>
      </div>
    </main>
  )
}