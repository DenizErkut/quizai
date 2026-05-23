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
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    classroom_id: '',
    title: '',
    topic: '',
    grade: '',
    difficulty: 'normal',
    question_count: 10,
    due_date: '',
  })
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)

    const { data: cls } = await supabase.from('classrooms').select('*').eq('teacher_id', t.id).order('created_at', { ascending: false })
    const { data: asgn } = await supabase
      .from('assignments')
      .select('*, classrooms(name), assignment_completions(count)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })

    setClassrooms(cls ?? [])
    setAssignments(asgn ?? [])
    if (cls?.length) setForm(p => ({ ...p, classroom_id: cls[0].id }))
    setLoading(false)
  }

  async function createAssignment() {
    if (!form.classroom_id || !form.title.trim() || !form.topic.trim()) return
    setSaving(true)
    const { data } = await supabase.from('assignments').insert({
      classroom_id: form.classroom_id,
      teacher_id: teacher.id,
      title: form.title.trim(),
      topic: form.topic.trim(),
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
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>Yeni Ödev / Test</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select value={form.classroom_id} onChange={e => setForm(p => ({ ...p, classroom_id: e.target.value }))} style={inputStyle}>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Ödev başlığı (örn: Hücre Bölünmesi Testi)" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
              <input placeholder="Konu (AI buna göre soru üretir)" value={form.topic}
                onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} style={inputStyle} />
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button className="btn btn-primary" onClick={createAssignment}
                  disabled={saving || !form.title.trim() || !form.topic.trim()}
                  style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Kaydediliyor...' : 'Ödevi Oluştur'}
                </button>
                <button className="btn" onClick={() => setShowForm(false)} style={{ justifyContent: 'center' }}>İptal</button>
              </div>
            </div>
          </div>
        )}

        {/* Ödev listesi */}
        {assignments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Henüz ödev yok</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>İlk ödevi oluştur ve öğrencilerine ata.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
