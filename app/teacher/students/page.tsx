'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function TeacherStudentsContent() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [suggestedStudents, setSuggestedStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [addingStudent, setAddingStudent] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [newClass, setNewClass] = useState({ name: '', grade: '', subject: '' })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)
    const { data: cls } = await supabase
      .from('classrooms').select('*').eq('teacher_id', t.id)
      .order('created_at', { ascending: false })
    setClassrooms(cls ?? [])
    if (cls?.length) {
      // URL'den gelen sınıf ID'si varsa onu seç
      const urlClassId = searchParams.get('class')
      const targetClass = urlClassId
        ? cls.find((c: any) => c.id === urlClassId) || cls[0]
        : cls[0]
      setSelectedClass(targetClass.id)
      await loadStudents(targetClass.id)
      await loadSuggestions(t, targetClass)
    }
    setLoading(false)
  }

  async function loadStudents(classroomId: string) {
    // Use nested select — let Supabase handle the join with service role
    const { data: cs, error: csErr } = await supabase
      .from('classroom_students')
      .select('student_id, joined_at')
      .eq('classroom_id', classroomId)

    if (!cs?.length) { setStudents([]); return [] }

    // Fetch profiles one by one to bypass any RLS edge cases
    const profileMap: Record<string, any> = {}
    await Promise.all(
      cs.map(async (c: any) => {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, name, grade, school, monthly_test_count')
          .eq('id', c.student_id)
          .maybeSingle()
        if (p) profileMap[c.student_id] = p
      })
    )

    const merged = cs.map((c: any) => ({
      ...c,
      profiles: profileMap[c.student_id] || null,
    }))
    setStudents(merged)
    return merged
  }

  async function loadSuggestions(t: any, classroom: any) {
    if (!classroom) { setSuggestedStudents([]); return }

    // Sınıftaki mevcut öğrencileri al
    const { data: existing } = await supabase
      .from('classroom_students')
      .select('student_id')
      .eq('classroom_id', classroom.id)
    const existingIds = (existing ?? []).map((e: any) => e.student_id)

    // Aynı okul veya aynı sınıf seviyesindeki öğrencileri öner
    let query = supabase
      .from('profiles')
      .select('id, name, grade, school')
      .neq('id', t.user_id)
      .limit(20)

    if (t.school) {
      query = query.eq('school', t.school)
    } else if (classroom.grade) {
      query = query.eq('grade', classroom.grade)
    }

    const { data: candidates } = await query

    // Zaten sınıfta olanları filtrele
    const filtered = (candidates ?? []).filter(
      (c: any) => !existingIds.includes(c.id)
    )
    setSuggestedStudents(filtered.slice(0, 8))
  }

  async function selectClassroom(cls: any) {
    setSelectedClass(cls.id)
    const currentStudents = await loadStudents(cls.id)
    await loadSuggestions(teacher, cls)
  }

  async function createClassroom() {
    if (!newClass.name.trim() || !newClass.grade) return
    setCreating(true)
    const { data, error } = await supabase.from('classrooms').insert({
      teacher_id: teacher.id,
      name: newClass.name.trim(),
      grade: newClass.grade,
      subject: newClass.subject.trim(),
    }).select().single()
    setCreating(false)
    if (error || !data) {
      console.error('Classroom insert error:', error)
      alert('Hata: ' + (error?.message || 'Bilinmeyen hata'))
      return
    }
    const updated = [data, ...classrooms]
    setClassrooms(updated)
    setSelectedClass(data.id)
    setStudents([])
    setSuggestedStudents([])
    setShowCreate(false)
    setNewClass({ name: '', grade: '', subject: '' })
    await loadSuggestions(teacher, data)
  }

  async function addSuggestedStudent(studentId: string) {
    if (!selectedClass) return
    setAddingStudent(studentId)
    const { error } = await supabase.from('classroom_students').insert({
      classroom_id: selectedClass,
      student_id: studentId,
    })
    setAddingStudent(null)
    if (!error) {
      setSuggestedStudents(prev => prev.filter(s => s.id !== studentId))
      await loadStudents(selectedClass)
    }
  }

  async function removeStudent(studentId: string) {
    if (!selectedClass) return
    await supabase.from('classroom_students').delete()
      .eq('classroom_id', selectedClass).eq('student_id', studentId)
    setStudents(prev => prev.filter(s => s.student_id !== studentId))
    // Geri önerilere ekle
    const removed = students.find(s => s.student_id === studentId)
    if (removed?.profiles) {
      setSuggestedStudents(prev => [...prev, { id: studentId, ...removed.profiles }])
    }
  }

  async function deleteClassroom(id: string) {
    if (!confirm('Bu sınıfı silmek istediğine emin misin?')) return
    await supabase.from('classrooms').delete().eq('id', id)
    const updated = classrooms.filter(c => c.id !== id)
    setClassrooms(updated)
    if (selectedClass === id) {
      if (updated.length) {
        setSelectedClass(updated[0].id)
        await loadStudents(updated[0].id)
        await loadSuggestions(teacher, updated[0])
      } else {
        setSelectedClass(null)
        setStudents([])
        setSuggestedStudents([])
      }
    }
  }

  const activeClass = classrooms.find(c => c.id === selectedClass)

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Öğrenci Yönetimi</h1>
        </div>

        {/* Sınıf sekmeleri */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
          {classrooms.map(c => (
            <button key={c.id} onClick={() => selectClassroom(c)} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: '1.5px solid', fontFamily: 'var(--font-sans)', fontWeight: 500,
              background: selectedClass === c.id ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
              borderColor: selectedClass === c.id ? 'rgba(8,36,101,0.3)' : 'var(--border)',
              color: selectedClass === c.id ? 'var(--primary)' : 'var(--text)',
            }}>
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
              <input placeholder="Sınıf adı (örn: 6-D Matematik)" value={newClass.name}
                onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))} style={inputStyle}
                autoFocus />
              <select value={newClass.grade} onChange={e => setNewClass(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
                <option value="">Sınıf seviyesi seç</option>
                {['5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>{g}. Sınıf</option>)}
              </select>
              <input placeholder="Ders (isteğe bağlı)" value={newClass.subject}
                onChange={e => setNewClass(p => ({ ...p, subject: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={createClassroom}
                  disabled={creating || !newClass.name.trim() || !newClass.grade}
                  style={{ flex: 1, justifyContent: 'center', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
                <button className="btn" onClick={() => { setShowCreate(false); setNewClass({ name: '', grade: '', subject: '' }) }}
                  style={{ justifyContent: 'center' }}>İptal</button>
              </div>
            </div>
          </div>
        )}

        {/* Aktif sınıf */}
        {activeClass && (
          <>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>{activeClass.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                    Davet kodu:{' '}
                    <span style={{ fontWeight: 700, letterSpacing: '0.12em', color: 'var(--primary)', fontSize: '13px' }}>
                      {activeClass.invite_code}
                    </span>
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
                    Öğrenciler <strong style={{ color: 'var(--primary)' }}>{activeClass.invite_code}</strong> kodunu kullanarak katılabilir.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {students.map((s: any, i: number) => (
                    <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>
                          {(s.profiles?.name || 'İ').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.profiles?.name || 'İsimsiz'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                            {s.profiles?.grade && `${s.profiles.grade} · `}
                            {s.profiles?.monthly_test_count || 0} test bu ay
                          </div>
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

            {/* Öğrenci önerileri */}
            {suggestedStudents.length > 0 && (
              <div className="card anim-up" style={{ borderLeft: '3px solid #fdd31d' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
                  💡 Önerilen öğrenciler
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1rem' }}>
                  {teacher.school ? `${teacher.school} okulundan` : `${activeClass.grade}. sınıf seviyesinden`} öğrenciler
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {suggestedStudents.map((s: any) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(253,211,29,0.2)', border: '1.5px solid rgba(253,211,29,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#082465', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>
                          {(s.name || 'İ').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {s.grade}{s.school ? ` · ${s.school}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => addSuggestedStudent(s.id)}
                        disabled={addingStudent === s.id}
                        style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #082465, #1ECFB8)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: addingStudent === s.id ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                        {addingStudent === s.id ? '...' : '+ Ekle'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
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

export default function TeacherStudentsPage() {
  return <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}><TeacherStudentsContent /></Suspense>
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
