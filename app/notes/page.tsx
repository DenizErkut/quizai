'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Exam {
  name: string   // "1. Yazılı", "Sözlü" vb.
  score: number | ''
}

interface GradeNote {
  id: string
  subject: string
  subject_color: string
  term1_exams: Exam[]
  term2_exams: Exam[]
  term1_avg: number | null
  term2_avg: number | null
  notes: string
  updated_at: string
}

const SUBJECT_COLORS = [
  '#082465', '#1ECFB8', '#7c3aed', '#dc2626',
  '#d97706', '#16a34a', '#0891b2', '#db2777',
]

const PRESET_SUBJECTS = [
  'Matematik', 'Türkçe / Dil ve Anlatım', 'Fen Bilimleri', 'Sosyal Bilgiler',
  'İngilizce', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih', 'Coğrafya',
  'Edebiyat', 'Felsefe', 'Din Kültürü', 'Beden Eğitimi', 'Müzik', 'Görsel Sanatlar',
]

export default function NotesPage() {
  const router = useRouter()
  const [gradeNotes, setGradeNotes] = useState<GradeNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const supabase = createClient() as any

  // Yeni ders formu
  const [form, setForm] = useState({
    subject: '',
    subject_color: SUBJECT_COLORS[0],
    term1_exams: [{ name: '1. Yazılı', score: '' as number | '' }] as Exam[],
    term2_exams: [{ name: '1. Yazılı', score: '' as number | '' }] as Exam[],
    notes: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase
      .from('grade_notes')
      .select('*')
      .eq('user_id', user.id)
      .order('subject', { ascending: true })
    setGradeNotes(data ?? [])
    setLoading(false)
  }

  function addExam(term: 'term1_exams' | 'term2_exams') {
    setForm(prev => ({
      ...prev,
      [term]: [...prev[term], { name: `${prev[term].length + 1}. Yazılı`, score: '' }]
    }))
  }

  function removeExam(term: 'term1_exams' | 'term2_exams', idx: number) {
    setForm(prev => ({ ...prev, [term]: prev[term].filter((_, i) => i !== idx) }))
  }

  function updateExam(term: 'term1_exams' | 'term2_exams', idx: number, field: 'name' | 'score', value: string) {
    setForm(prev => ({
      ...prev,
      [term]: prev[term].map((e, i) => i === idx ? { ...e, [field]: field === 'score' ? (value === '' ? '' : Math.min(100, Math.max(0, Number(value)))) : value } : e)
    }))
  }

  async function saveGradeNote() {
    if (!form.subject.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const t1 = form.term1_exams.filter(e => e.score !== '')
    const t2 = form.term2_exams.filter(e => e.score !== '')
    const calcAvg = (exams: Exam[]) => exams.length > 0
      ? exams.reduce((sum, e) => sum + Number(e.score), 0) / exams.length
      : null

    const payload = {
      user_id: user.id,
      subject: form.subject.trim(),
      subject_color: form.subject_color,
      term1_exams: t1,
      term2_exams: t2,
      term1_avg: calcAvg(t1),
      term2_avg: calcAvg(t2),
      notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('grade_notes')
      .upsert(payload, { onConflict: 'user_id,subject' })
      .select().maybeSingle()
    if (data) {
      setGradeNotes(prev => {
        const exists = prev.find(g => g.subject === data.subject)
        return exists ? prev.map(g => g.subject === data.subject ? data : g) : [data, ...prev]
      })
    }
    setShowAdd(false)
    setEditingId(null)
    resetForm()
    setSaving(false)
  }

  function resetForm() {
    setForm({
      subject: '', subject_color: SUBJECT_COLORS[0],
      term1_exams: [{ name: '1. Yazılı', score: '' }],
      term2_exams: [{ name: '1. Yazılı', score: '' }],
      notes: '',
    })
  }

  function startEdit(g: GradeNote) {
    setForm({
      subject: g.subject,
      subject_color: g.subject_color || SUBJECT_COLORS[0],
      term1_exams: g.term1_exams.length > 0 ? g.term1_exams : [{ name: '1. Yazılı', score: '' }],
      term2_exams: g.term2_exams.length > 0 ? g.term2_exams : [{ name: '1. Yazılı', score: '' }],
      notes: g.notes || '',
    })
    setEditingId(g.id)
    setShowAdd(true)
  }

  async function deleteGradeNote(id: string) {
    if (!confirm('Bu dersi silmek istediğine emin misin?')) return
    await supabase.from('grade_notes').delete().eq('id', id)
    setGradeNotes(prev => prev.filter(g => g.id !== id))
  }

  // AI Zayıf Ders Analizi
  async function generateAiAnalysis() {
    if (gradeNotes.length === 0) return
    setAiLoading(true)
    setAiAnalysis('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const notesStr = gradeNotes.map(g => {
        const t1 = g.term1_exams.map((e: Exam) => `${e.name}: ${e.score}`).join(', ')
        const t2 = g.term2_exams.map((e: Exam) => `${e.name}: ${e.score}`).join(', ')
        return `${g.subject}: 1.Dönem [${t1}] (Ort: ${g.term1_avg?.toFixed(1) ?? '—'}) | 2.Dönem [${t2}] (Ort: ${g.term2_avg?.toFixed(1) ?? '—'})${g.notes ? ` | Not: ${g.notes}` : ''}`
      }).join('\n')

      const res = await fetch('/api/ai-grade-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ gradeNotes: notesStr }),
      })
      const data = await res.json()
      setAiAnalysis(data.analysis || 'Analiz alınamadı.')
    } catch {
      setAiAnalysis('Analiz sırasında hata oluştu.')
    }
    setAiLoading(false)
  }

  function scoreColor(avg: number | null) {
    if (avg === null) return 'var(--text4)'
    if (avg >= 85) return 'var(--green)'
    if (avg >= 70) return '#2563eb'
    if (avg >= 55) return 'var(--amber)'
    return 'var(--red)'
  }

  function scoreLabel(avg: number | null) {
    if (avg === null) return '—'
    if (avg >= 85) return 'İyi'
    if (avg >= 70) return 'Orta'
    if (avg >= 55) return 'Geliştirilebilir'
    return 'Zayıf ⚠️'
  }

  // Sıralama: en zayıf dersler başa
  const sortedNotes = [...gradeNotes].sort((a, b) => {
    const aAvg = (a.term1_avg ?? 100) + (a.term2_avg ?? 100)
    const bAvg = (b.term1_avg ?? 100) + (b.term2_avg ?? 100)
    return aAvg - bAvg
  })

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
              📒 Karne Notlarım
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>
              Ders notlarını gir — AI zayıf derslerine odaklansın
            </p>
          </div>
          <button onClick={() => { resetForm(); setEditingId(null); setShowAdd(true) }}
            className="btn btn-primary" style={{ fontSize: '13px' }}>
            + Ders Ekle
          </button>
        </div>

        {/* Bilgi kutusu */}
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent)', background: 'var(--accent-bg)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>
            💡 Ders notlarını girdikten sonra <strong>AI Analizi</strong> butonu ile zayıf derslerini öğren.
            Test üretirken veya gelişim planı hazırlarken AI bu notları otomatik dikkate alır.
          </p>
        </div>

        {/* Ders ekle / düzenle formu */}
        {showAdd && (
          <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--accent)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              {editingId ? '✏️ Dersi Düzenle' : '➕ Yeni Ders Ekle'}
            </div>

            {/* Ders adı + renk */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>Ders Adı</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {PRESET_SUBJECTS.map(s => (
                  <button key={s} onClick={() => setForm(p => ({ ...p, subject: s }))}
                    style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)',
                      background: form.subject === s ? 'var(--primary)' : 'var(--bg2)',
                      borderColor: form.subject === s ? 'var(--primary)' : 'var(--border)',
                      color: form.subject === s ? '#fff' : 'var(--text3)',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                placeholder="Veya kendi ders adını yaz..."
                style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
            </div>

            {/* Renk seçici */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>Renk</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {SUBJECT_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, subject_color: c }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.subject_color === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {/* Dönem sınavları */}
            {(['term1_exams', 'term2_exams'] as const).map(term => (
              <div key={term} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '8px' }}>
                  {term === 'term1_exams' ? '1. Dönem Sınavları' : '2. Dönem Sınavları'}
                </div>
                {form[term].map((exam, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <input value={exam.name} onChange={e => updateExam(term, idx, 'name', e.target.value)}
                      placeholder="Sınav adı (1. Yazılı, Sözlü...)"
                      style={{ flex: 2, padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                    <input type="number" min={0} max={100} value={exam.score}
                      onChange={e => updateExam(term, idx, 'score', e.target.value)}
                      placeholder="Not (0-100)"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                    {form[term].length > 1 && (
                      <button onClick={() => removeExam(term, idx)}
                        style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => addExam(term)}
                  style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, padding: '4px 0' }}>
                  + Sınav Ekle
                </button>
              </div>
            ))}

            {/* Kişisel not */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>Kişisel not (opsiyonel)</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Bu dersle ilgili notun var mı? (Örn: Logaritma konusunu hiç anlamadım)"
                rows={2}
                style={{ padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={saveGradeNote} disabled={saving || !form.subject.trim()}
                className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                {saving ? '⏳ Kaydediliyor...' : '💾 Kaydet'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditingId(null); resetForm() }}
                className="btn" style={{ justifyContent: 'center' }}>İptal</button>
            </div>
          </div>
        )}

        {/* Dersler listesi */}
        {sortedNotes.length === 0 && !showAdd ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📒</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)', marginBottom: '6px' }}>Henüz ders eklenmedi</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>
              Ders notlarını ekle, AI zayıf konularına odaklansın.
            </div>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              + İlk Dersimi Ekle
            </button>
          </div>
        ) : sortedNotes.length > 0 && (
          <>
            {/* AI Analiz butonu */}
            <div style={{ marginBottom: '1rem' }}>
              {aiAnalysis ? (
                <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid #7c3aed', background: 'rgba(124,58,237,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed' }}>🤖 AI Ders Analizi</div>
                    <button onClick={generateAiAnalysis} style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      Yenile
                    </button>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {aiAnalysis}
                  </div>
                </div>
              ) : (
                <button onClick={generateAiAnalysis} disabled={aiLoading}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px dashed rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.04)', color: '#7c3aed', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: aiLoading ? 0.6 : 1 }}>
                  {aiLoading ? '⏳ Analiz hazırlanıyor...' : '🤖 AI ile Zayıf Dersleri Analiz Et'}
                </button>
              )}
            </div>

            {/* Özet istatistik */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { label: 'Toplam Ders', value: sortedNotes.length },
                { label: 'Zayıf Ders', value: sortedNotes.filter(g => (g.term1_avg ?? 100) < 55 || (g.term2_avg ?? 100) < 55).length, color: 'var(--red)' },
                { label: 'Genel Ort.', value: (() => {
                  const avgs = sortedNotes.flatMap(g => [g.term1_avg, g.term2_avg]).filter(Boolean) as number[]
                  return avgs.length ? `${(avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(1)}` : '—'
                })() },
              ].map((s, i) => (
                <div key={i} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ fontWeight: 800, fontSize: '22px', color: (s as any).color || 'var(--primary)' }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Dersler */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sortedNotes.map(g => {
                const isWeak = (g.term1_avg ?? 100) < 70 || (g.term2_avg ?? 100) < 70
                return (
                  <div key={g.id} className="card" style={{ borderLeft: `4px solid ${g.subject_color || 'var(--primary)'}`, transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.subject_color, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{g.subject}</div>
                          {isWeak && <div style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 600 }}>⚠️ Gelişim gerekiyor</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => startEdit(g)}
                          style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                          Düzenle
                        </button>
                        <button onClick={() => deleteGradeNote(g.id)}
                          style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(220,38,38,0.2)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                          Sil
                        </button>
                      </div>
                    </div>

                    {/* Dönem ortalamaları */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: g.notes ? '10px' : 0 }}>
                      {[
                        { label: '1. Dönem', avg: g.term1_avg, exams: g.term1_exams },
                        { label: '2. Dönem', avg: g.term2_avg, exams: g.term2_exams },
                      ].map((term, ti) => (
                        <div key={ti} style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}>{term.label}</div>
                            <div style={{ fontWeight: 800, fontSize: '18px', color: scoreColor(term.avg) }}>
                              {term.avg !== null ? term.avg.toFixed(1) : '—'}
                            </div>
                          </div>
                          {term.exams.length > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.8 }}>
                              {term.exams.map((e: Exam, i: number) => (
                                <div key={i}>{e.name}: <strong style={{ color: scoreColor(Number(e.score)) }}>{e.score}</strong></div>
                              ))}
                            </div>
                          )}
                          <div style={{ fontSize: '10px', fontWeight: 600, color: scoreColor(term.avg), marginTop: '4px' }}>
                            {scoreLabel(term.avg)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {g.notes && (
                      <div style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic', marginTop: '8px', padding: '6px 10px', background: 'var(--bg2)', borderRadius: '8px' }}>
                        💬 {g.notes}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Quize yönlendirme */}
            <div className="card" style={{ marginTop: '1.5rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(8,36,101,0.04), rgba(30,207,184,0.04))', border: '1.5px dashed var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', marginBottom: '6px' }}>
                Test çözerken karne notların dikkate alınır 🎯
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                Zayıf derslerinden soru üret, hızla gelişim sağla.
              </div>
              {sortedNotes[0] && (
                <Link href={`/quiz?topic=${encodeURIComponent(sortedNotes[0].subject)}`}
                  className="btn btn-primary" style={{ justifyContent: 'center', fontSize: '13px' }}>
                  ⚡ En Zayıf Dersimden Test Çöz ({sortedNotes[0].subject})
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
