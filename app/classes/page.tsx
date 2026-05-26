'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface ClassRoom {
  id: string
  name: string
  subject: string
  description: string | null
  invite_code: string
  created_at: string
  teacher_id: string
  teacher_name?: string
  student_count?: number
  students?: { id: string; name: string; grade: string; plan: string; joined_at: string }[]
}

const SUBJECT_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'Matematik':  { bg: 'rgba(37,99,235,0.08)',  color: '#2563eb', border: 'rgba(37,99,235,0.2)' },
  'Türkçe':    { bg: 'rgba(124,58,237,0.08)', color: '#7c3aed', border: 'rgba(124,58,237,0.2)' },
  'Fen':       { bg: 'rgba(16,185,129,0.08)', color: '#059669', border: 'rgba(16,185,129,0.2)' },
  'Tarih':     { bg: 'rgba(217,119,6,0.08)',  color: '#d97706', border: 'rgba(217,119,6,0.2)' },
  'Coğrafya':  { bg: 'rgba(6,182,212,0.08)',  color: '#0891b2', border: 'rgba(6,182,212,0.2)' },
  'İngilizce': { bg: 'rgba(239,68,68,0.08)',  color: '#dc2626', border: 'rgba(239,68,68,0.2)' },
  'Fizik':     { bg: 'rgba(249,115,22,0.08)', color: '#ea580c', border: 'rgba(249,115,22,0.2)' },
  'Kimya':     { bg: 'rgba(20,184,166,0.08)', color: '#0d9488', border: 'rgba(20,184,166,0.2)' },
  'Biyoloji':  { bg: 'rgba(22,163,74,0.08)',  color: '#16a34a', border: 'rgba(22,163,74,0.2)' },
  'Genel':     { bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'rgba(100,116,139,0.2)' },
}

const SUBJECT_EMOJI: Record<string, string> = {
  'Matematik':'🔢','Türkçe':'📖','Fen':'🔬','Tarih':'🏛️',
  'Coğrafya':'🌍','İngilizce':'🇬🇧','Fizik':'⚛️','Kimya':'🧪','Biyoloji':'🧬'
}

function subjectStyle(subject: string) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS['Genel']
}

export default function ClassesPage() {
  const router = useRouter()
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [shareResult, setShareResult] = useState(false)
  const supabase = createClient() as any

  useEffect(() => { loadClasses() }, [])

  async function loadClasses() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setMyUserId(user.id)

    // classroom_students üzerinden katıldığım sınıfları bul
    const { data: memberships } = await supabase
      .from('classroom_students')
      .select('classroom_id, joined_at')
      .eq('student_id', user.id)

    if (!memberships?.length) { setLoading(false); return }

    const classIds = memberships.map((m: any) => m.classroom_id)

    // classrooms tablosundan sınıf bilgilerini çek
    const { data: classData } = await supabase
      .from('classrooms')
      .select('*')
      .in('id', classIds)
      .order('created_at', { ascending: false })

    if (!classData?.length) { setLoading(false); return }

    // Her sınıf için öğrenci listesini ve öğretmen adını çek
    const enriched = await Promise.all(classData.map(async (cls: any) => {
      const [{ data: students }, { data: teacher }] = await Promise.all([
        supabase.from('classroom_students')
          .select('student_id, joined_at, profiles(name, grade, plan)')
          .eq('classroom_id', cls.id),
        supabase.from('profiles').select('name').eq('id', cls.teacher_id).single(),
      ])

      return {
        ...cls,
        teacher_name: teacher?.name || '—',
        student_count: students?.length || 0,
        students: (students || []).map((s: any) => ({
          id: s.student_id,
          name: s.profiles?.name || 'İsimsiz',
          grade: s.profiles?.grade || '—',
          plan: s.profiles?.plan || 'free',
          joined_at: s.joined_at,
        })),
      }
    }))

    setClasses(enriched)
    setLoading(false)
  }

  async function joinClass() {
    if (!joinCode.trim()) return
    setJoinError('')
    setJoinLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    const code = joinCode.trim().toUpperCase()

    const { data: cls } = await supabase
      .from('classrooms')
      .select('id, name, subject')
      .eq('invite_code', code)
      .maybeSingle()

    if (!cls) {
      setJoinError('Geçersiz kod. Öğretmeninden doğru kodu iste.')
      setJoinLoading(false)
      return
    }

    const { data: existing } = await supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('classroom_id', cls.id)
      .eq('student_id', user.id)
      .maybeSingle()

    if (existing) {
      setJoinError('Bu sınıfa zaten kayıtlısın.')
      setJoinLoading(false)
      return
    }

    const { error } = await supabase.from('classroom_students').insert({
      classroom_id: cls.id,
      student_id: user.id,
    })

    if (error) {
      setJoinError('Bir hata oluştu, tekrar dene.')
    } else {
      setJoinCode('')
      setShowJoin(false)
      await loadClasses()
    }
    setJoinLoading(false)
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </main>
  )

  // ── SINIF DETAY ──
  if (selectedClass) {
    const sStyle = subjectStyle(selectedClass.subject)
    const students = selectedClass.students || []

    return (
      <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <button onClick={() => setSelectedClass(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: '14px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
            ← Sınıflarıma dön
          </button>

          <div className="card anim-up" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: sStyle.bg, color: sStyle.color, border: `1px solid ${sStyle.border}`, fontWeight: 700, marginBottom: '8px', display: 'inline-block' }}>
                  {selectedClass.subject || 'Genel'}
                </span>
                <h2 className="serif" style={{ fontSize: '24px', marginBottom: '4px' }}>{selectedClass.name}</h2>
                {selectedClass.description && (
                  <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{selectedClass.description}</p>
                )}
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>
                  👨‍🏫 Öğretmen: <strong>{selectedClass.teacher_name}</strong>
                  <span style={{ margin: '0 8px' }}>·</span>
                  {students.length} öğrenci
                </div>
              </div>
              <div style={{ fontSize: '40px' }}>{SUBJECT_EMOJI[selectedClass.subject] || '📚'}</div>
            </div>

            <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>Test sonuçlarımı sınıfla paylaş</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Açıksa arkadaşların sonuçlarını görebilir</div>
              </div>
              <button onClick={() => setShareResult(v => !v)}
                style={{ width: 44, height: 24, borderRadius: '12px', border: 'none', cursor: 'pointer', background: shareResult ? 'var(--accent)' : '#cbd5e1', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: shareResult ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
              </button>
            </div>
          </div>

          <div className="card anim-up-1">
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
              Sınıf üyeleri · {students.length} öğrenci
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {students.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: s.id === myUserId ? 'var(--accent)' : 'rgba(8,36,101,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', color: s.id === myUserId ? '#fff' : 'var(--primary)', flexShrink: 0 }}>
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: s.id === myUserId ? 700 : 500, fontSize: '14px' }}>
                      {s.name}
                      {s.id === myUserId && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>(Sen)</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>
                      {s.grade}
                      {s.plan === 'premium' && <span style={{ marginLeft: '6px', color: 'var(--accent)' }}>★ Premium</span>}
                      {s.plan === 'unlimited' && <span style={{ marginLeft: '6px', color: '#0d9488' }}>⭐ Unlimited</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0 }}>
                    {new Date(s.joined_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
              {students.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)', fontSize: '13px' }}>
                  Henüz öğrenci yok.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    )
  }

  // ── ANA LİSTE ──
  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="badge badge-purple" style={{ marginBottom: '0.5rem' }}>Sınıflarım</div>
            <h1 className="serif" style={{ fontSize: '28px', marginBottom: '4px' }}>Sınıflarım</h1>
            <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Dahil olduğun sınıflar ve arkadaşların</p>
          </div>
          <button onClick={() => setShowJoin(v => !v)} className="btn btn-primary" style={{ flexShrink: 0 }}>
            + Sınıfa katıl
          </button>
        </div>

        {showJoin && (
          <div className="card anim-up" style={{ marginBottom: '1rem', border: '2px solid var(--accent)' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '0.75rem' }}>🏫 Sınıfa katıl</div>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1rem', lineHeight: 1.6 }}>
              Öğretmeninden aldığın davet kodunu gir. Her öğretmen her dersi için ayrı bir sınıf oluşturabilir.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input className="input" placeholder="Örn: 8A002D"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
                onKeyDown={e => e.key === 'Enter' && joinClass()}
                style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }} />
              <button className="btn btn-primary" onClick={joinClass} disabled={joinLoading || !joinCode.trim()}>
                {joinLoading ? '⏳' : 'Katıl'}
              </button>
            </div>
            {joinError && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)' }}>{joinError}</div>}
          </div>
        )}

        {classes.length === 0 ? (
          <div className="card anim-up-1" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🏫</div>
            <h3 className="serif" style={{ fontSize: '22px', marginBottom: '0.5rem' }}>Henüz bir sınıfa dahil değilsin</h3>
            <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Öğretmeninden davet kodu alarak matematik, Türkçe veya istediğin ders için sınıfa katılabilirsin.
            </p>
            <button className="btn btn-primary" onClick={() => setShowJoin(true)} style={{ justifyContent: 'center' }}>
              + Sınıfa katıl
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {classes.map((cls, idx) => {
              const sStyle = subjectStyle(cls.subject)
              return (
                <div key={cls.id} className={`card anim-up-${idx + 1}`}
                  onClick={() => setSelectedClass(cls)}
                  style={{ cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(8,36,101,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '14px', background: sStyle.bg, border: `1.5px solid ${sStyle.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                      {SUBJECT_EMOJI[cls.subject] || '📚'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '16px' }}>{cls.name}</span>
                        {cls.subject && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: sStyle.bg, color: sStyle.color, border: `1px solid ${sStyle.border}`, fontWeight: 700 }}>{cls.subject}</span>}
                      </div>
                      {cls.description && <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls.description}</div>}
                      <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span>👨‍🏫 {cls.teacher_name}</span>
                        <span>👥 {cls.student_count} öğrenci</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '18px', color: 'var(--text3)', alignSelf: 'center' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {classes.length > 0 && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button onClick={() => setShowJoin(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
              + Başka bir sınıfa katıl
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
