'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const DIFFICULTIES = [
  { value: 'kolay', label: 'Kolay' },
  { value: 'normal', label: 'Normal' },
  { value: 'zor', label: 'Zor' },
  { value: 'cok zor', label: 'Çok Zor' },
]

export default function TeacherAssignPage() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignFile, setAssignFile] = useState<File | null>(null)
  const [assignFileContent, setAssignFileContent] = useState('')
  const [fileError, setFileError] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [assignmentType, setAssignmentType] = useState<'quiz' | 'open_ended'>('quiz')
  const [form, setForm] = useState({
    classroom_id: '',
    title: '',
    topic: '',
    grade: '',
    difficulty: 'normal',
    question_count: 10,
    due_date: '',
    question_type: 'multiple_choice',
    source_type: 'generate', // 'generate' | 'from_file' | 'similar'
  })

  // ── Açık Uçlu Soru ödevi ──
  const [openEndedAssignments, setOpenEndedAssignments] = useState<any[]>([])
  const [oeMethod, setOeMethod] = useState<'ai' | 'manual' | null>(null)
  const [oeForm, setOeForm] = useState({ classroom_id: '', title: '', grade: '', subject: '', topic: '', due_date: '' })
  const [oeScenario, setOeScenario] = useState('')
  const [oeQuestion, setOeQuestion] = useState('')
  const [oeRubric, setOeRubric] = useState<{ criterion: string; maxPoints: number; description: string }[]>([
    { criterion: '', maxPoints: 25, description: '' },
    { criterion: '', maxPoints: 25, description: '' },
    { criterion: '', maxPoints: 25, description: '' },
    { criterion: '', maxPoints: 25, description: '' },
  ])
  const [oeGenerating, setOeGenerating] = useState(false)
  const [oeSaving, setOeSaving] = useState(false)
  const [oeError, setOeError] = useState('')
  const [oeGenerated, setOeGenerated] = useState(false) // AI ile üretildi mi (önizleme aşaması)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    let { data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle()
    if (error) {
      console.error('[teacher/assign] teachers sorgusu basarisiz, tekrar deneniyor:', error)
      await new Promise(r => setTimeout(r, 600))
      ;({ data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle())
    }
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)

    const { data: cls } = await supabase.from('classrooms').select('*').eq('teacher_id', t.id).order('created_at', { ascending: false })
    const { data: asgn } = await supabase
      .from('assignments')
      .select('*, classrooms(name), assignment_completions(count)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })
    const { data: oeAsgn } = await supabase
      .from('open_ended_assignments')
      .select('*, classrooms(name)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })

    setClassrooms(cls ?? [])
    setAssignments(asgn ?? [])
    setOpenEndedAssignments(oeAsgn ?? [])
    if (cls?.length) {
      setForm(p => ({ ...p, classroom_id: cls[0].id }))
      setOeForm(p => ({ ...p, classroom_id: cls[0].id }))
    }
    setLoading(false)
  }

  async function extractFileContent(file: File) {
    setFileLoading(true)
    setFileError('')
    const formData = new FormData()
    formData.append('file', file)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/extract-file', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
      body: formData,
    })
    const data = await res.json()
    setFileLoading(false)

    if (data.error) {
      setFileError(data.error)
      return ''
    }
    return data.content || ''
  }

  async function createAssignment() {
    if (!form.classroom_id || !form.title.trim() || !form.topic.trim()) return
    setSaving(true)

    // PDF/dosya içeriği varsa konuya ekle
    let finalTopic = form.topic.trim()
    if (assignFile && !assignFileContent) {
      const extracted = await extractFileContent(assignFile)
      if (extracted) finalTopic = extracted.slice(0, 3000)
    } else if (assignFileContent) {
      finalTopic = assignFileContent.slice(0, 3000)
    }

    const { data } = await supabase.from('assignments').insert({
      classroom_id: form.classroom_id,
      teacher_id: teacher.id,
      title: form.title.trim(),
      topic: finalTopic,
      grade: form.grade,
      difficulty: form.difficulty,
      question_count: form.question_count,
      due_date: form.due_date || null,
    }).select('*, classrooms(name)').single()

    setSaving(false)
    setShowForm(false)
    setForm(p => ({ ...p, title: '', topic: '', due_date: '' }))
    if (data) setAssignments(prev => [data, ...prev])
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Bu ödevi silmek istediğine emin misin?')) return
    await supabase.from('assignments').delete().eq('id', id)
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  function resetOeForm() {
    setOeMethod(null)
    setOeForm(p => ({ ...p, title: '', grade: '', subject: '', topic: '', due_date: '' }))
    setOeScenario(''); setOeQuestion('')
    setOeRubric([
      { criterion: '', maxPoints: 25, description: '' },
      { criterion: '', maxPoints: 25, description: '' },
      { criterion: '', maxPoints: 25, description: '' },
      { criterion: '', maxPoints: 25, description: '' },
    ])
    setOeGenerated(false); setOeError('')
  }

  async function generateOeWithAI() {
    if (!oeForm.subject.trim() || !oeForm.topic.trim()) { setOeError('Ders ve konu zorunlu.'); return }
    setOeError(''); setOeGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/create-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mode: 'ai', preview: true, ...oeForm }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setOeError(data?.error || 'Soru üretilemedi.'); return }
      // preview modunda dogrudan assignment kaydedilmedi, sadece uretilen
      // icerik donuyor - once ogretmen onaylasin
      setOeScenario(data.scenario); setOeQuestion(data.question)
      setOeRubric(data.rubric.map((r: any) => ({ criterion: r.criterion, maxPoints: r.maxPoints, description: r.description || '' })))
      setOeGenerated(true)
    } catch (e) {
      console.error('[generateOeWithAI]', e)
      setOeError('Beklenmeyen bir hata oluştu.')
    } finally {
      setOeGenerating(false)
    }
  }

  async function saveOeAssignment() {
    if (!oeForm.classroom_id || !oeForm.title.trim()) { setOeError('Sınıf ve başlık zorunlu.'); return }
    if (!oeScenario.trim() || !oeQuestion.trim()) { setOeError('Senaryo ve soru zorunlu.'); return }
    const validRubric = oeRubric.filter(r => r.criterion.trim() && r.maxPoints > 0)
    if (validRubric.length === 0) { setOeError('En az bir puanlama kriteri girmelisiniz.'); return }

    setOeError(''); setOeSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/create-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          mode: 'manual', // hem AI-onaylanmis hem manuel icerik ayni sekilde kalici kaydedilir
          created_via: oeGenerated ? 'ai' : 'manual',
          ...oeForm,
          scenario: oeScenario, question: oeQuestion, rubric: validRubric,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setOeError(data?.error || 'Ödev kaydedilemedi.'); return }
      setOpenEndedAssignments(prev => [data.assignment, ...prev])
      setShowForm(false)
      resetOeForm()
    } catch (e) {
      console.error('[saveOeAssignment]', e)
      setOeError('Beklenmeyen bir hata oluştu.')
    } finally {
      setOeSaving(false)
    }
  }

  async function deleteOeAssignment(id: string) {
    if (!confirm('Bu açık uçlu ödevi silmek istediğine emin misin?')) return
    await supabase.from('open_ended_assignments').delete().eq('id', id)
    setOpenEndedAssignments(prev => prev.filter(a => a.id !== id))
  }

  const rubricTotal = oeRubric.reduce((s, r) => s + (Number(r.maxPoints) || 0), 0)

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Ödev Ata</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)} style={{ justifyContent: 'center' }}>
            + Yeni ödev
          </button>
        </div>

        {/* Yeni ödev formu */}
        {showForm && (
          <div className="card anim-up" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>Yeni Ödev</div>

            {/* Ödev türü */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {[
                { value: 'quiz', label: '📝 Test / Quiz' },
                { value: 'open_ended', label: '💬 Açık Uçlu Soru' },
              ].map(opt => (
                <button key={opt.value} onClick={() => { setAssignmentType(opt.value as any); resetOeForm() }}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)',
                    background: assignmentType === opt.value ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                    borderColor: assignmentType === opt.value ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                    color: assignmentType === opt.value ? 'var(--primary)' : 'var(--text3)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {assignmentType === 'open_ended' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {oeError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>{oeError}</div>}

                {!oeMethod ? (
                  // ── Yöntem seçimi ──
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button onClick={() => setOeMethod('ai')}
                      style={{ padding: '20px 14px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontSize: '30px', marginBottom: '8px' }}>🤖</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>Yapay Zeka Hazırlasın</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5 }}>Ders ve konu gir, senaryo + soru + rubrik saniyeler içinde üretilsin</div>
                    </button>
                    <button onClick={() => setOeMethod('manual')}
                      style={{ padding: '20px 14px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontSize: '30px', marginBottom: '8px' }}>✍️</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>Kendim Oluşturayım</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5 }}>Senaryoyu, soruyu ve puanlama kriterlerini kendin yaz</div>
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setOeMethod(null); setOeGenerated(false) }}
                      style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0 }}>
                      ← Yöntemi değiştir
                    </button>

                    {/* Ortak alanlar */}
                    <select value={oeForm.classroom_id} onChange={e => setOeForm(p => ({ ...p, classroom_id: e.target.value }))} style={inputStyle}>
                      {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input placeholder="Ödev başlığı (örn: Su Döngüsü - Açık Uçlu)" value={oeForm.title}
                      onChange={e => setOeForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <select value={oeForm.grade} onChange={e => setOeForm(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
                        <option value="">Sınıf seviyesi</option>
                        {['5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>{g}. Sınıf</option>)}
                      </select>
                      <input placeholder="Ders (örn: Fen Bilimleri)" value={oeForm.subject}
                        onChange={e => setOeForm(p => ({ ...p, subject: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Son tarih (isteğe bağlı)</label>
                      <input type="datetime-local" value={oeForm.due_date}
                        onChange={e => setOeForm(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
                    </div>

                    {oeMethod === 'ai' && !oeGenerated && (
                      <>
                        <input placeholder="Konu (örn: Su döngüsü ve buharlaşma)" value={oeForm.topic}
                          onChange={e => setOeForm(p => ({ ...p, topic: e.target.value }))} style={inputStyle} />
                        <button className="btn btn-primary" onClick={generateOeWithAI} disabled={oeGenerating}
                          style={{ justifyContent: 'center', opacity: oeGenerating ? 0.6 : 1 }}>
                          {oeGenerating ? '✨ Üretiliyor...' : '🤖 Yapay Zeka ile Oluştur'}
                        </button>
                      </>
                    )}

                    {(oeMethod === 'manual' || (oeMethod === 'ai' && oeGenerated)) && (
                      <>
                        {oeMethod === 'ai' && oeGenerated && (
                          <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>
                            ✓ Üretildi — göndermeden önce dilediğin gibi düzenleyebilirsin
                          </div>
                        )}
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Senaryo / Durum</label>
                          <textarea value={oeScenario} onChange={e => setOeScenario(e.target.value)} rows={3}
                            placeholder="Öğrencinin okuyacağı kısa senaryo/durum metni..."
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Soru</label>
                          <textarea value={oeQuestion} onChange={e => setOeQuestion(e.target.value)} rows={2}
                            placeholder="Senaryoya dayanan açık uçlu soru..."
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>Puanlama Kriterleri (Rubrik)</label>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: rubricTotal === 100 ? 'var(--green)' : 'var(--red)' }}>
                              Toplam: {rubricTotal} / 100
                            </span>
                          </div>
                          {oeRubric.map((r, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 32px', gap: '6px', marginBottom: '6px' }}>
                              <input placeholder={`Kriter ${i + 1} (örn: Bilimsel doğruluk)`} value={r.criterion}
                                onChange={e => setOeRubric(prev => prev.map((x, j) => j === i ? { ...x, criterion: e.target.value } : x))}
                                style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px' }} />
                              <input type="number" min={0} max={100} value={r.maxPoints}
                                onChange={e => setOeRubric(prev => prev.map((x, j) => j === i ? { ...x, maxPoints: Number(e.target.value) } : x))}
                                style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px', textAlign: 'center' }} />
                              <button onClick={() => setOeRubric(prev => prev.filter((_, j) => j !== i))}
                                style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', color: 'var(--red)', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                            </div>
                          ))}
                          <button onClick={() => setOeRubric(prev => [...prev, { criterion: '', maxPoints: 0, description: '' }])}
                            style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '2px 0' }}>
                            + Kriter ekle
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          {oeMethod === 'ai' && (
                            <button className="btn" onClick={generateOeWithAI} disabled={oeGenerating}
                              style={{ justifyContent: 'center' }}>
                              {oeGenerating ? '⏳' : '🔄 Yeniden Üret'}
                            </button>
                          )}
                          <button className="btn btn-primary" onClick={saveOeAssignment}
                            disabled={oeSaving || !oeForm.title.trim() || !oeScenario.trim() || !oeQuestion.trim()}
                            style={{ flex: 1, justifyContent: 'center', opacity: oeSaving ? 0.6 : 1 }}>
                            {oeSaving ? 'Kaydediliyor...' : '✓ Onayla ve Ödevi Oluştur'}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                <button className="btn" onClick={() => { setShowForm(false); resetOeForm() }} style={{ justifyContent: 'center' }}>İptal</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select value={form.classroom_id} onChange={e => setForm(p => ({ ...p, classroom_id: e.target.value }))} style={inputStyle}>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Ödev başlığı (örn: Hücre Bölünmesi Testi)" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
              <input placeholder="Konu (AI buna göre soru üretir)" value={form.topic}
                onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} style={inputStyle} />
              <div style={{ marginTop: '6px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>
                  Veya dosyadan soru üret (PDF, DOCX, JPG, PNG)
                </label>
                <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.txt"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setAssignFile(file)
                    setFileError('')
                    if (!form.topic) setForm(p => ({ ...p, topic: file.name.replace(/\.[^.]+$/, '') }))
                    if (file.type.includes('text') || file.name.endsWith('.txt')) {
                      const text = await file.text()
                      setAssignFileContent(text.slice(0, 3000))
                    } else {
                      setAssignFileContent('')
                    }
                  }}
                  style={{ fontSize: '12px', color: 'var(--text)', width: '100%' }} />
                {fileLoading && (
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>⏳ Dosya okunuyor...</p>
                )}
                {assignFile && !fileLoading && !fileError && (
                  <p style={{ fontSize: '11px', color: 'var(--green)', marginTop: '4px' }}>✓ {assignFile.name}</p>
                )}
                {fileError && (
                  <div style={{ marginTop: '8px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '12px', marginBottom: '6px' }}>⚠️ PDF Yüklenemedi</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, marginBottom: '8px' }}>
                      Çözüm önerileri:<br/>
                      • PDF'i Word'e çevir → tekrar yükle<br/>
                      • Büyük PDF'i 50 sayfalık parçalara böl<br/>
                      • Metni kopyalayıp Konu alanına yapıştır
                    </div>
                    <a href="https://bigconvert.11zon.com/" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '7px', background: '#082465', color: '#fff', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                      🔄 Ücretsiz PDF Dönüştür / Küçült →
                    </a>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
                  <option value="">Sınıf seviyesi</option>
                  {['5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>{g}. Sınıf</option>)}
                </select>
                <select value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value }))} style={inputStyle}>
                  {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Soru sayısı: {form.question_count}</label>
                  <input type="range" min={5} max={30} step={5} value={form.question_count}
                    onChange={e => setForm(p => ({ ...p, question_count: Number(e.target.value) }))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Son tarih (isteğe bağlı)</label>
                  <input type="datetime-local" value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              {/* Soru tipi */}
              <div style={{ marginTop: '6px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Soru tipi</label>
                <div style={{ fontSize: '10px', color: '#5b4cf5', marginBottom: '6px', fontWeight: 600 }}>MM = Maarif Modeli soru tipi</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { value: 'multiple_choice', label: '🔤 Çoktan Seçmeli', maarif: false },
                    { value: 'fill_blank', label: '✏️ Boşluk Doldurma', maarif: false },
                    { value: 'true_false', label: '✓✗ D/Y', maarif: false },
                    { value: 'multi_true_false', label: '📋✓✗ Çoklu D/Y', maarif: true },
                    { value: 'table_fill', label: '🗂️ Tablo Doldurma', maarif: true },
                    { value: 'matching', label: '🔗 Eşleştirme', maarif: false },
                    { value: 'ordering', label: '📋 Sıralama', maarif: false },
                    { value: 'short_answer', label: '💬 Kısa Cevap', maarif: false },
                    { value: 'mixed', label: '🎲 Karma Sorular', maarif: false },
                  ].map(t => (
                    <button key={t.value} onClick={() => setForm(p => ({ ...p, question_type: t.value }))}
                      style={{ padding: '6px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', textAlign: 'center', position: 'relative',
                        background: form.question_type === t.value ? 'rgba(8,36,101,0.08)' : t.maarif ? 'rgba(91,76,245,0.03)' : 'var(--bg2)',
                        borderColor: form.question_type === t.value ? 'rgba(8,36,101,0.3)' : t.maarif ? 'rgba(91,76,245,0.25)' : 'var(--border)',
                        color: form.question_type === t.value ? 'var(--primary)' : 'var(--text3)',
                      }}>
                      {t.maarif && <span style={{ position: 'absolute', top: '2px', right: '4px', fontSize: '7px', color: '#5b4cf5', fontWeight: 800 }}>MM</span>}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dosya kaynağı seçimi */}
              {assignFile && (
                <div style={{ marginTop: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Dosyadan soru üretme yöntemi</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { value: 'from_file', label: '📄 Dosyadaki Soruları Kullan' },
                      { value: 'similar', label: '🔀 Benzer Sorular Üret' },
                      { value: 'generate', label: '✨ Konuya Göre Üret' },
                    ].map(s => (
                      <button key={s.value} onClick={() => setForm(p => ({ ...p, source_type: s.value }))}
                        style={{ flex: 1, padding: '7px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', textAlign: 'center',
                          background: form.source_type === s.value ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                          borderColor: form.source_type === s.value ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                          color: form.source_type === s.value ? 'var(--primary)' : 'var(--text3)',
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button className="btn btn-primary" onClick={createAssignment}
                  disabled={saving || !form.title.trim() || !form.topic.trim()}
                  style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Kaydediliyor...' : 'Ödevi Oluştur'}
                </button>
                <button className="btn" onClick={() => setShowForm(false)} style={{ justifyContent: 'center' }}>İptal</button>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Ödev listesi */}
        {assignments.length === 0 && openEndedAssignments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Henüz ödev yok</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>İlk ödevi oluştur ve öğrencilerine ata.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {openEndedAssignments.map((a: any) => (
              <div key={`oe-${a.id}`} className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #6366f1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '5px' }}>{a.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <span>💬 Açık Uçlu</span>
                      {a.subject && <span>📚 {a.subject}</span>}
                      <span>🏫 {a.classrooms?.name}</span>
                      <span>{a.created_via === 'ai' ? '🤖 AI ile' : '✍️ Manuel'}</span>
                      {a.due_date && (
                        <span style={{ color: new Date(a.due_date) < new Date() ? 'var(--red)' : 'var(--text3)' }}>
                          🕐 {new Date(a.due_date).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => deleteOeAssignment(a.id)}
                    style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid rgba(220,38,38,0.25)', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0, marginLeft: '10px' }}>
                    Sil
                  </button>
                </div>
              </div>
            ))}
            {assignments.map((a: any) => {
              const isOverdue = a.due_date && new Date(a.due_date) < new Date()
              const completions = a.assignment_completions?.[0]?.count || 0
              return (
                <div key={a.id} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '5px' }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <span>📚 {a.topic}</span>
                        <span>🏫 {a.classrooms?.name}</span>
                        <span>❓ {a.question_count} soru</span>
                        <span>✅ {completions} tamamladı</span>
                        <span>{({'multiple_choice':'🔤 Çoktan Seçmeli','fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ D/Y','multi_true_false':'📋✓✗ Çoklu D/Y','table_fill':'🗂️ Tablo','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap','mixed':'🎲 Karma'} as any)[a.question_type] || '🔤 Çoktan Seçmeli'}</span>
                        {a.due_date && (
                          <span style={{ color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>
                            🕐 {new Date(a.due_date).toLocaleDateString('tr-TR')}{isOverdue ? ' (süresi doldu)' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => deleteAssignment(a.id)}
                      style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid rgba(220,38,38,0.25)', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0, marginLeft: '10px' }}>
                      Sil
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
