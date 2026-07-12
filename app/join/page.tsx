'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveIdentities, resolveName } from '@/lib/identity/resolve-client'

function JoinContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code')?.toUpperCase() || '')
  const [loading, setLoading] = useState(false)
  const [checkingMembership, setCheckingMembership] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<any>(null)
  const [alreadyJoined, setAlreadyJoined] = useState(false)
  const [myClasses, setMyClasses] = useState<any[]>([])
  const supabase = createClient() as any

  useEffect(() => {
    loadMyClasses()
  }, [])

  async function loadMyClasses() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCheckingMembership(false); return }

    // Get classes the user is a member of (öğretmen adı TR-PG'den)
    const { data: memberships } = await supabase
      .from('classroom_students')
      .select('classroom_id, joined_at, classrooms(id, name, invite_code, grade, teachers(user_id, school))')
      .eq('student_id', user.id)

    const teacherUserIds = (memberships || []).map((m: any) => m.classrooms?.teachers?.user_id).filter(Boolean)
    const teacherIdentities = await resolveIdentities(supabase, teacherUserIds)

    setMyClasses((memberships || []).map((m: any) => ({
      ...m.classrooms,
      teachers: m.classrooms?.teachers
        ? { ...m.classrooms.teachers, name: teacherIdentities[m.classrooms.teachers.user_id]?.full_name || null }
        : null,
      joined_at: m.joined_at,
    })))
    setCheckingMembership(false)

    // Auto-join if code in URL
    const urlCode = searchParams.get('code')
    if (urlCode) handleJoin(urlCode.toUpperCase())
  }

  async function handleJoin(inputCode?: string) {
    const joinCode = (inputCode || code).trim().toUpperCase()
    if (!joinCode || joinCode.length < 4) { setError('Geçerli bir kod gir.'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: classroomRaw } = await supabase
      .from('classrooms')
      .select('*, teachers(user_id, school)')
      .eq('invite_code', joinCode)
      .single()

    if (!classroomRaw) { setError('Bu koda ait sınıf bulunamadı.'); setLoading(false); return }

    // Öğretmen adı TR-PG'den
    const teacherName = classroomRaw.teachers?.user_id
      ? await resolveName(supabase, classroomRaw.teachers.user_id)
      : null
    const classroom = {
      ...classroomRaw,
      teachers: classroomRaw.teachers ? { ...classroomRaw.teachers, name: teacherName } : null,
    }

    const { data: existing } = await supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('classroom_id', classroom.id)
      .eq('student_id', user.id)
      .single()

    if (existing) { setAlreadyJoined(true); setSuccess(classroom); setLoading(false); return }

    await supabase.from('classroom_students').insert({
      classroom_id: classroom.id, student_id: user.id
    })

    setSuccess(classroom)
    setMyClasses(prev => [...prev, { ...classroom, joined_at: new Date().toISOString() }])
    setLoading(false)
  }

  async function leaveClass(classroomId: string) {
    if (!confirm('Sınıftan çıkmak istediğine emin misin?')) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('classroom_students')
      .delete().eq('classroom_id', classroomId).eq('student_id', user.id)
    setMyClasses(prev => prev.filter(c => c.id !== classroomId))
  }

  if (checkingMembership) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #fff 50%, #fff8e8 100%)' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/quiz">
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px', margin: '0 auto' }} />
          </Link>
        </div>

        {/* Sınıfa katıl formu */}
        {!success ? (
          <div className="card anim-up" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '36px', textAlign: 'center', marginBottom: '1rem' }}>🏫</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, marginBottom: '6px', textAlign: 'center', color: 'var(--primary)' }}>
              Sınıfa Katıl
            </h1>
            <p style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '1.75rem', textAlign: 'center' }}>
              Öğretmeninin verdiği davet kodunu girerek sınıfına katıl.
            </p>
            <label className="field-label">Davet Kodu</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="örn: A1B2C3" maxLength={8} autoFocus
              style={{ padding: '14px 18px', borderRadius: '12px', border: '2px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.2em', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center', textTransform: 'uppercase', transition: 'border-color 0.18s' }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            {error && <div style={{ marginTop: '10px', padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}
            <button className="btn btn-primary" onClick={() => handleJoin()} disabled={loading || code.length < 4}
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', opacity: code.length < 4 ? 0.5 : 1 }}>
              {loading ? <div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> : 'Sınıfa Katıl →'}
            </button>
          </div>
        ) : (
          <div className="card anim-up" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '52px', marginBottom: '1rem' }}>{alreadyJoined ? '✅' : '🎉'}</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: 'var(--primary)' }}>
              {alreadyJoined ? 'Zaten bu sınıftasın!' : 'Sınıfa katıldın!'}
            </h1>
            <p style={{ color: 'var(--text3)', fontSize: '14px', marginBottom: '1.5rem' }}>
              <strong style={{ color: 'var(--primary)' }}>{success.name}</strong>
              {success.teachers?.name && ` · ${success.teachers.name} öğretmeni`}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="btn" onClick={() => { setSuccess(null); setCode(''); setAlreadyJoined(false) }}>
                Başka sınıfa katıl
              </button>
              <Link href="/quiz" className="btn btn-primary" style={{ justifyContent: 'center' }}>Teste başla ⚡</Link>
            </div>
          </div>
        )}

        {/* Mevcut sınıflarım */}
        {myClasses.length > 0 && (
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📚 Sınıflarım ({myClasses.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {myClasses.map((cls: any) => (
                <div key={cls.id} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>{cls.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                      {cls.teachers?.name && `${cls.teachers.name} · `}
                      Kod: <span style={{ fontWeight: 700, letterSpacing: '0.1em' }}>{cls.invite_code}</span>
                    </div>
                  </div>
                  <button onClick={() => leaveClass(cls.id)}
                    style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)', background: 'var(--red-bg)', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                    Çık
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {myClasses.length === 0 && !success && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link href="/quiz" style={{ fontSize: '13px', color: 'var(--text3)' }}>← Ana sayfaya dön</Link>
          </div>
        )}
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <JoinContent />
    </Suspense>
  )
}
