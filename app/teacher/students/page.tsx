'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function TeacherStudentsPage() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newClass, setNewClass] = useState({ name: '', grade: '', subject: '' })
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)
    const { data: cls } = await supabase
      .from('classrooms')
      .select('*')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })
    setClassrooms(cls ?? [])
    if (cls?.length) { setSelectedClass(cls[0].id); loadStudents(cls[0].id) }
    setLoading(false)
  }

  async function loadStudents(classroomId: string) {
    const { data } = await supabase
      .from('classroom_students')
      .select('student_id, joined_at, profiles(name, grade, monthly_test_count)')
      .eq('classroom_id', classroomId)
    setStudents(data ?? [])
  }

  async function createClassroom() {
    if (!newClass.name.trim() || !newClass.grade) return
    setCreating(true)
    const { data } = await supabase.from('classrooms').insert({
      teacher_id: teacher.id,
      name: newClass.name.trim(),
      grade: newClass.grade,
      subject: newClass.subject.trim(),
    }).select().single()
    setCreating(false)
    setShowCreate(false)
    setNewClass({ name: '', grade: '', subject: '' })
    if (data) {
      setClassrooms(prev => [data, ...prev])
      setSelectedClass(data.id)
      setStudents([])
    }
  }

  async function removeStudent(studentId: string) {
    if (!selectedClass) return
    await supabase.from('classroom_students').delete()
      .eq('classroom_id', selectedClass).eq('student_id', studentId)
    setStudents(prev => prev.filter(s => s.student_id !== studentId))
  }

  async function deleteClassroom(id: string) {
    if (!confirm('Bu sınıfı silmek istediğine emin misin?')) return
    await supabase.from('classrooms').delete().eq('id', id)
    setClassrooms(prev => prev.filter(c => c.id !== id))
    if (selectedClass === id) {
      setSelectedClass(null)
      setStudents([])
    }
  }

  const activeClass = classrooms.find(c => c.id === selectedClass)

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Öğrenci Yönetimi</h1>
        </div>

        {/* Sınıf sekmeleri + oluştur */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
          {classrooms.map(c => (
            <button key={c.id}
              onClick={() => { setSelectedClass(c.id); loadStudents(c.id) }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                border: '1.5px solid', fontFamily: 'var(--font-sans)', fontWeight: 500,
                background: selectedClass === c.id ? 'rgba(30,207,184,0.1)' : 'var(--bg2)',
                borderColor: selectedClass === c.id ? 'rgba(30,207,184,0.4)' : 'var(--border)',
                color: selectedClass === c.id ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {c.name}
            </button>
          ))}
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
            + Yeni sınıf
          </button>
        </div>

        {/* Yeni sınıf formu */}
        {showCreate && (
          <div className="card anim-up" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Yeni Sınıf Oluştur</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input placeholder="Sınıf adı (örn: 10-A Matematik)" value={newClass.name}
                onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
              <select value={newClass.grade} onChange={e => setNewClass(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
                <option value="">Sınıf seviyesi seç</option>
                {['5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>{g}. Sınıf</option>)}
              </select>
              <input placeholder="Ders (isteğe bağlı)" value={newClass.subject}
                onChange={e => setNewClass(p => ({ ...p, subject: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={createClassroom} disabled={creating || !newClass.name.trim()}
                  style={{ flex: 1, justifyContent: 'center', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
                <button className="btn" onClick={() => setShowCreate(false)} style={{ justifyContent: 'center' }}>İptal</button>
              </div>
            </div>
          </div>
        )}

        {/* Aktif sınıf detayı */}
        {activeClass && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>{activeClass.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                  Davet kodu: <span style={{ fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)' }}>{activeClass.invite_code}</span>
                  {' · '}{students.length} öğrenci
                </div>
              </div>
              <button onClick={() => deleteClassroom(activeClass.id)}
                style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)', background: 'var(--red-bg)', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Sınıfı sil
              </button>
            </div>

            {students.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
                <div style={{ fontSize: '13px' }}>Henüz öğrenci yok.</div>
                <div style={{ fontSize: '12px', marginTop: '6px' }}>
                  Öğrenciler <strong>{activeClass.invite_code}</strong> kodunu kullanarak katılabilir.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {students.map((s: any, i: number) => (
                  <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.profiles?.name || 'İsimsiz'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {s.profiles?.grade && `${s.profiles.grade}. Sınıf · `}
                        {s.profiles?.monthly_test_count || 0} test bu ay
                      </div>
                    </div>
                    <button onClick={() => removeStudent(s.student_id)}
                      style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      Çıkar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {classrooms.length === 0 && !showCreate && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏫</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Henüz sınıfın yok</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>İlk sınıfını oluştur ve öğrencilerini ekle.</div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ justifyContent: 'center' }}>
              + Sınıf Oluştur
            </button>
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
