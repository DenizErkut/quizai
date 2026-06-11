'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
  topicErr?: string
  dynamicSubjects?: string[]
}

export default function QuizSetup({
  profile, currentLang, selectedTopic, setSelectedTopic, customTopic, setCustomTopic,
  qCount, setQCount, difficulty, setDifficulty, includeVisuals, setIncludeVisuals,
  questionType, setQuestionType, uploadedFiles, setUploadedFiles,
  favorites, mebTopics, topicSummary, summaryLoading, showSummary, setShowSummary,
  onFetchSummary, onToggleFavorite, onStartQuiz,
  testsLeft, dailyLeft, maxQCount, topicErr, dynamicSubjects = [],
}: QuizSetupProps) {
  const [openSubject, setOpenSubject] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const level = profile ? (
    profile.grade.toLowerCase().includes('üniversite') || profile.grade.toLowerCase().includes('universite') ? 'universite' :
    profile.grade.toLowerCase().includes('lise') ? 'lise' :
    profile.grade.toLowerCase().includes('ortaokul') ? 'ortaokul' : 'ilkokul'
  ) : 'ortaokul'

  return (
    <>
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
                {dailyLeft !== null && dailyLeft <= 5 && (
                  <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', background: dailyLeft === 0 ? 'var(--red-bg)' : 'rgba(217,119,6,0.1)', color: dailyLeft === 0 ? 'var(--red)' : '#92400e', border: `1px solid ${dailyLeft === 0 ? 'rgba(220,38,38,0.2)' : 'rgba(217,119,6,0.2)'}`, fontWeight: 600 }}>
                    {dailyLeft === 0 ? '⏰ Günlük limit doldu' : `Bugün ${dailyLeft} test kaldı`}
                  </span>
                )}
                {profile?.plan === 'premium' && (
                  <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid rgba(91,76,245,0.2)', fontWeight: 600 }}>★ Premium</span>
                )}
                {profile?.plan === 'unlimited' && (
                  <span style={{ padding: '1px 8px', borderRadius: '99px', fontSize: '11px', background: 'rgba(30,207,184,0.1)', color: '#0d9488', border: '1px solid rgba(30,207,184,0.3)', fontWeight: 600 }}>⭐ Unlimited</span>
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

          {/* ── FAVORİLER ── */}
          {favorites.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="field-label">⭐ Favori Konularım</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '6px' }}>
                {favorites.map(fav => (
                  <button key={fav} onClick={() => { setSelectedTopic(fav); setCustomTopic('') }}
                    style={{
                      padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      border: `1px solid ${selectedTopic === fav ? 'var(--accent-2)' : 'rgba(253,211,29,0.4)'}`,
                      background: selectedTopic === fav ? 'var(--accent-2)' : 'var(--accent-2-bg)',
                      color: selectedTopic === fav ? '#082465' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}>
                    ⭐ {fav}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── DERS VE KONU SEÇİMİ ── */}
          <label className="field-label">Ders seç</label>
          <div style={{ marginTop: '6px', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {(dynamicSubjects.length > 0
                ? dynamicSubjects
                : Object.keys(SUBJECT_MAP[level] || SUBJECT_MAP.ortaokul)
              ).map(subj => (
                <button key={subj} onClick={() => setOpenSubject(openSubject === subj ? null : subj)}
                  style={{
                    padding: '7px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                    border: `1.5px solid ${openSubject === subj ? 'var(--accent)' : 'var(--border)'}`,
                    background: openSubject === subj ? 'var(--accent-bg)' : 'var(--bg2)',
                    color: openSubject === subj ? 'var(--accent)' : 'var(--text2)',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                  {subj}
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>{openSubject === subj ? '▲' : '▼'}</span>
                </button>
              ))}
            </div>

            {openSubject && (SUBJECT_MAP[level] || SUBJECT_MAP.ortaokul)[openSubject] && (
              <div style={{
                maxHeight: '240px', overflowY: 'auto', padding: '10px 12px',
                borderRadius: '12px', border: '1.5px solid var(--accent)',
                background: 'var(--accent-bg)', display: 'flex', flexDirection: 'column', gap: '10px',
                scrollbarWidth: 'thin',
              }}>
                {/* MEB yüklü konular — üstte */}
                {mebTopics[openSubject] && mebTopics[openSubject].length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>📚</span> MEB Müfredatı
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                      {mebTopics[openSubject].map((unit: string) => (
                        <div key={unit} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <button onClick={() => { setSelectedTopic(unit); setCustomTopic(''); setOpenSubject(null) }}
                            style={{
                              padding: '5px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 600,
                              cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                              border: `1.5px solid ${selectedTopic === unit ? '#0d9488' : 'rgba(13,148,136,0.35)'}`,
                              background: selectedTopic === unit ? '#0d9488' : 'rgba(13,148,136,0.08)',
                              color: selectedTopic === unit ? '#fff' : '#0d9488', whiteSpace: 'nowrap',
                            }}>
                            {unit}
                          </button>
                          <button onClick={() => onToggleFavorite(unit)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: favorites.includes(unit) ? 1 : 0.35, padding: '2px' }}>
                            ⭐
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Standart konular — altta */}
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                    Genel Konular
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {(SUBJECT_MAP[level] || SUBJECT_MAP.ortaokul)[openSubject].map((topic: string) => (
                      <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <button onClick={() => { setSelectedTopic(topic); setCustomTopic(''); setOpenSubject(null) }}
                          style={{
                            padding: '5px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 500,
                            cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                            border: `1px solid ${selectedTopic === topic ? 'var(--accent)' : 'var(--border)'}`,
                            background: selectedTopic === topic ? 'var(--accent)' : 'var(--bg)',
                            color: selectedTopic === topic ? '#fff' : 'var(--text)', whiteSpace: 'nowrap',
                          }}>
                          {topic}
                        </button>
                        <button onClick={() => onToggleFavorite(topic)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: favorites.includes(topic) ? 1 : 0.35, padding: '2px', transition: 'opacity 0.15s' }}>
                          ⭐
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedTopic && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>✓ Seçilen: {selectedTopic}</span>
                <button onClick={() => onToggleFavorite(selectedTopic)} title={favorites.includes(selectedTopic) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', opacity: favorites.includes(selectedTopic) ? 1 : 0.4, padding: 0 }}>⭐</button>
                <button onClick={() => onFetchSummary(selectedTopic)}
                  style={{ padding: '4px 10px', borderRadius: '8px', border: '1.5px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)', color: '#6366f1', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  📖 Konuya Hızlı Bak
                </button>
                <button onClick={() => setSelectedTopic('')} style={{ fontSize: '11px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
              </div>
            )}

            {/* Konu Özeti Modal */}
            {showSummary && (
              <div style={{ marginTop: '12px', borderRadius: '14px', border: '1.5px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.04)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📖 {selectedTopic || customTopic.trim()} — Hızlı Özet
                  </div>
                  <button onClick={() => setShowSummary(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '16px', padding: 0 }}>×</button>
                </div>

                {summaryLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text3)', fontSize: '13px' }}>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(99,102,241,0.2)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Özet hazırlanıyor...
                  </div>
                ) : topicSummary ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{topicSummary.summary}</p>

                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Temel Noktalar</div>
                      {topicSummary.keyPoints.map((pt, i) => (
                        <div key={i} style={{ fontSize: '12px', color: 'var(--text)', padding: '3px 0', display: 'flex', gap: '6px' }}>
                          <span style={{ color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span> {pt}
                        </div>
                      ))}
                    </div>

                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Anahtar Terimler</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {topicSummary.keyTerms.map((kt, i) => (
                          <div key={i} title={kt.definition} style={{ padding: '3px 10px', borderRadius: '99px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', fontSize: '11px', color: '#6366f1', fontWeight: 600, cursor: 'help' }}>
                            {kt.term}
                          </div>
                        ))}
                      </div>
                    </div>

                    {topicSummary.rememberThis && (
                      <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(253,211,29,0.1)', border: '1px solid rgba(253,211,29,0.3)', fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                        💡 {topicSummary.rememberThis}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <label className="field-label">Veya kendi konunu yaz</label>
          <textarea className="input" rows={2}
            placeholder="Örn: Güneş sistemi, Osmanlı kuruluşu, Fotosentez..."
            value={customTopic} onChange={e => { setCustomTopic(e.target.value); setSelectedTopic('') }}
            style={{ resize: 'none' }} />

          {/* Dosya yükleme */}
          <label className="field-label" style={{ marginTop: '16px' }}>Dosyadan soru üret</label>
          <FileUploader onFilesChange={setUploadedFiles} maxFiles={5} maxMB={20} />
          {uploadedFiles.length > 0 && (
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--green)' }}>
              ✓ {uploadedFiles.length} dosya hazır · {uploadedFiles.reduce((s, f) => s + f.content.split(' ').length, 0)} kelime · Sorular bu içeriklerden üretilecek
            </div>
          )}

          {/* ── GELİŞMİŞ AYARLAR (accordion) ── */}
          <button
            onClick={() => setAdvancedOpen(v => !v)}
            style={{
              width: '100%', marginTop: '1.25rem', padding: '10px 14px',
              borderRadius: '10px', border: '1px solid var(--border)',
              background: advancedOpen ? 'var(--bg2)' : 'var(--bg)',
              color: 'var(--text2)', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
            <span>⚙️ Gelişmiş ayarlar {!advancedOpen && <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '6px' }}>(zorluk, soru tipi, sayı, görsel)</span>}</span>
            <span style={{ fontSize: '12px' }}>{advancedOpen ? '▲' : '▼'}</span>
          </button>

          {advancedOpen && (
            <div style={{ marginTop: '10px', padding: '14px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>

              {/* Zorluk */}
              <label className="field-label" style={{ marginTop: 0 }}>Zorluk seviyesi</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '6px' }}>
                {DIFFICULTIES.map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    style={{ padding: '10px 8px', borderRadius: '10px', border: `1.5px solid ${difficulty === d.value ? d.border : 'var(--border)'}`, background: difficulty === d.value ? d.bg : 'var(--bg)', color: difficulty === d.value ? d.color : 'var(--text2)', fontSize: '13px', fontWeight: difficulty === d.value ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>{d.label}</div>
                    <div style={{ fontSize: '11px', opacity: 0.75 }}>{d.desc}</div>
                  </button>
                ))}
              </div>

              {/* Soru tipi */}
              <div style={{ marginTop: '14px' }}>
                <label className="field-label" style={{ marginTop: 0 }}>Soru tipi</label>
                <div style={{ fontSize: '11px', color: 'var(--accent)', marginBottom: '6px', fontWeight: 500 }}>
                  📌 Maarif Modeli tipleri işaretli olanlardır
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { value: 'multiple_choice', label: 'Çoktan Seçmeli', icon: '🔤', desc: 'A/B/C/D klasik', maarif: true },
                    { value: 'fill_blank', label: 'Boşluk Doldurma', icon: '✏️', desc: 'Eksik kelimeyi bul', maarif: true },
                    { value: 'true_false', label: 'Doğru / Yanlış', icon: '✓✗', desc: 'Gerekçeli D/Y', maarif: true },
                    { value: 'multi_true_false', label: 'Çoklu D/Y', icon: '📋✓✗', desc: 'Maarif Modeli', maarif: true },
                    { value: 'table_fill', label: 'Tablo Doldurma', icon: '🗂️', desc: 'Maarif Modeli', maarif: true },
                    { value: 'matching', label: 'Eşleştirme', icon: '🔗', desc: 'Kavram – tanım', maarif: true },
                    { value: 'ordering', label: 'Sıralama', icon: '📋', desc: 'Doğru sıraya koy', maarif: true },
                    { value: 'short_answer', label: 'Kısa Cevap', icon: '💬', desc: 'AI puanlar', maarif: false },
                    { value: 'mixed', label: 'Karma Sorular', icon: '🎲', desc: 'Tüm tipler karışık', maarif: false },
                  ].map(t => (
                    <button key={t.value} onClick={() => setQuestionType(t.value as QuestionType)}
                      style={{
                        padding: '10px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                        border: `1.5px solid ${questionType === t.value ? 'var(--accent)' : t.maarif ? 'rgba(91,76,245,0.2)' : 'var(--border)'}`,
                        background: questionType === t.value ? 'var(--accent-bg)' : t.maarif ? 'rgba(91,76,245,0.03)' : 'var(--bg)',
                        transition: 'all 0.15s', position: 'relative',
                      }}>
                      {t.maarif && <span style={{ position: 'absolute', top: '4px', right: '5px', fontSize: '8px', color: 'var(--accent)', fontWeight: 700 }}>MM</span>}
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>{t.icon}</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: questionType === t.value ? 'var(--accent)' : 'var(--primary)', lineHeight: 1.3 }}>{t.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Soru sayısı + görsel — accordion içinde */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label" style={{ marginTop: 0 }}>Soru sayısı</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {[5, 10, 15, 20].map(n => {
                      const locked = n > maxQCount
                      const active = qCount === n
                      return (
                        <button key={n}
                          className={`btn btn-sm ${active && !locked ? 'btn-primary' : ''}`}
                          onClick={() => {
                            if (locked) { onStartQuiz(); return }
                            setQCount(n)
                          }}
                          style={{ position: 'relative', opacity: locked ? 0.7 : 1, border: locked ? '1.5px solid rgba(217,119,6,0.4)' : undefined, color: locked ? '#92400e' : undefined }}>
                          {n} soru
                          {locked && <span style={{ fontSize: '10px', marginLeft: '3px' }}>🔒</span>}
                        </button>
                      )
                    })}
                  </div>
                  {profile?.plan === 'free' && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Freemium'da max 5 soru · <a href="/pricing" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Premium'a geç</a></div>}
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Görsel sorular</label>
                  <button onClick={() => setIncludeVisuals(!includeVisuals)}
                    style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${includeVisuals ? 'var(--accent)' : 'var(--border)'}`, background: includeVisuals ? 'var(--accent-bg)' : 'var(--bg)', color: includeVisuals ? 'var(--accent)' : 'var(--text2)', fontSize: '13px', fontWeight: includeVisuals ? 600 : 400, transition: 'all 0.15s' }}>
                    {includeVisuals ? '📊 Grafik & SVG açık' : '📝 Sadece metin'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Özet */}
          <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text2)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span>📝 {qCount} soru</span>
            <span style={{ color: 'var(--accent)' }}>{
              {'multiple_choice':'🔤 Çoktan Seçmeli','fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ D/Y','multi_true_false':'📋✓✗ Çoklu D/Y','table_fill':'🗂️ Tablo','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap','mixed':'🎲 Karma'}[questionType]
            }</span>
            <span style={{ color: DIFFICULTIES.find(d => d.value === difficulty)?.color }}>⚡ {DIFFICULTIES.find(d => d.value === difficulty)?.label}</span>
            <span>🌐 {currentLang}</span>
            {uploadedFiles.length > 0 && <span style={{ color: 'var(--green)' }}>📎 {uploadedFiles.length} dosya</span>}
            {includeVisuals && <span style={{ color: 'var(--accent)' }}>📊 Görsel</span>}
          </div>

          {topicErr && uploadedFiles.length === 0 && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)' }}>{topicErr}</div>}

          <button className="btn btn-primary btn-lg" onClick={() => {
            if (dailyLeft === 0) { onStartQuiz(); return }
            if (testsLeft === 0) { onStartQuiz(); return }
            onStartQuiz()
          }}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', opacity: (testsLeft === 0 || dailyLeft === 0) ? 0.5 : 1 }}>
            {testsLeft === 0 ? 'Test hakkın doldu — Yükselt' : dailyLeft === 0 ? 'Günlük limit doldu ⏰' : 'Test oluştur ⚡'}
          </button>

          {(testsLeft === 0 || dailyLeft === 0) && (
            <a href="/pricing" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px', display: 'flex', textDecoration: 'none' }}>
              💎 Planları gör
            </a>
          )}
        </div>
      </div>
    </main>
    </>
  )

  // ── ERROR ──
}
