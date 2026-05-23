'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function JoinContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code')?.toUpperCase() || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<any>(null)
  const [alreadyJoined, setAlreadyJoined] = useState(false)
  const supabase = createClient() as any

  // URL'de code varsa otomatik katıl
  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (urlCode) {
      setCode(urlCode.toUpperCase())
      handleJoin(urlCode.toUpperCase())
    }
  }, [])

  async function handleJoin(inputCode?: string) {
    const joinCode = (inputCode || code).trim().toUpperCase()
    if (!joinCode || joinCode.length < 4) { setError('Geçerli bir kod gir.'); return }

    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Sınıfı bul
    const { data: classroom } = await supabase
      .from('classrooms')
      .select('*, teachers(name, school)')
      .eq('invite_code', joinCode)
      .single()

    if (!classroom) {
      setError('Bu koda ait sınıf bulunamadı. Kodu kontrol et.')
      setLoading(false)
      return
    }

    // Zaten kayıtlı mı?
    const { data: existing } = await supabase
      .from('classroom_students')
      .select('classroom_id')
      .eq('classroom_id', classroom.id)
      .eq('student_id', user.id)
      .single()

    if (existing) {
      setAlreadyJoined(true)
      setSuccess(classroom)
      setLoading(false)
      return
    }

    // Sınıfa katıl
    const { error: joinError } = await supabase
      .from('classroom_students')
      .insert({ classroom_id: classroom.id, student_id: user.id })

    if (joinError) {
      setError('Sınıfa katılırken hata oluştu. Tekrar dene.')
      setLoading(false)
      return
    }

    setSuccess(classroom)
    setLoading(false)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #fff 50%, #fff8e8 100%)' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link href="/quiz">
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '56px', margin: '0 auto' }} />
          </Link>
        </div>

        {success ? (
          /* Başarı ekranı */
          <div className="card anim-up" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>{alreadyJoined ? '✅' : '🎉'}</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, marginBottom: '8px', color: 'var(--primary)' }}>
              {alreadyJoined ? 'Zaten kayıtlısın!' : 'Sınıfa katıldın!'}
            </h1>
            <p style={{ color: 'var(--text3)', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--primary)' }}>{success.name}</strong> sınıfına
              {success.teachers?.name && <> · {success.teachers.name} öğretmeni</>}
              {alreadyJoined ? ' zaten kayıtlısın.' : ' başarıyla katıldın.'}
            </p>

            <div style={{ background: 'var(--bg2)', borderRadius: '12px', padding: '14px', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '4px' }}>Sınıf</div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }}>{success.name}</div>
              {success.teachers?.school && (
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>🏫 {success.teachers.school}</div>
              )}
            </div>

            <Link href="/quiz" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
              Teste başla ⚡
            </Link>
          </div>
        ) : (
          /* Kod giriş formu */
          <div className="card anim-up">
            <div style={{ fontSize: '40px', textAlign: 'center', marginBottom: '1rem' }}>🏫</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, marginBottom: '6px', textAlign: 'center', color: 'var(--primary)' }}>
              Sınıfa Katıl
            </h1>
            <p style={{ color: 'var(--text3)', fontSize: '13px', marginBottom: '1.75rem', textAlign: 'center', lineHeight: 1.6 }}>
              Öğretmeninin verdiği davet kodunu girerek sınıfına katıl.
            </p>

            <label className="field-label">Davet Kodu</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="örn: A1B2C3"
              maxLength={8}
              autoFocus
              style={{
                padding: '14px 18px', borderRadius: '12px', border: '2px solid var(--border)',
                background: 'var(--bg2)', color: 'var(--primary)', fontSize: '22px',
                fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.2em',
                outline: 'none', width: '100%', boxSizing: 'border-box',
                textAlign: 'center', textTransform: 'uppercase',
                transition: 'border-color 0.18s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />

            {error && (
              <div style={{ marginTop: '10px', padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--red)' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={() => handleJoin()}
              disabled={loading || code.length < 4}
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', opacity: code.length < 4 ? 0.5 : 1 }}
            >
              {loading
                ? <><div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> Aranıyor...</>
                : 'Sınıfa Katıl →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link href="/quiz" style={{ fontSize: '13px', color: 'var(--text3)' }}>
                ← Ana sayfaya dön
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </main>
    }>
      <JoinContent />
    </Suspense>
  )
}
