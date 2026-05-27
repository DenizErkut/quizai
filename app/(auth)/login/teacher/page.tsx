'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function TeacherLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient() as any

  async function handleLogin() {
    if (!email.trim() || !pass) { setError('E-posta ve sifre gerekli.'); return }
    setError(''); setLoading(true)

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (err) { setError('E-posta veya sifre hatali.'); setLoading(false); return }

    // Öğretmen mi kontrol et
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id, approved')
      .eq('user_id', data.user.id)
      .maybeSingle()

    setLoading(false)

    if (!teacher) {
      await supabase.auth.signOut()
      setError('Bu hesap ogretmen paneline kayitli degil. Ogretmen basvurusu icin kayit sayfasini kullanin.')
      return
    }

    if (!teacher.approved) {
      await supabase.auth.signOut()
      setError('Ogretmen basvurunuz henuz onaylanmamis. Onay emaili bekleniyor.')
      return
    }

    router.push('/teacher')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/login" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'block', marginBottom: '12px' }}>← Geri</Link>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎓</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>Ogretmen Girisi</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Onaylanmis ogretmen hesabi gereklidir</p>
        </div>

        <div className="card anim-up-1">
          <label className="field-label">E-posta</label>
          <input className="input" type="email" placeholder="ornek@mail.com"
            value={email} onChange={e => setEmail(e.target.value)} />

          <label className="field-label">Sifre</label>
          <input className="input" type="password" placeholder="••••••••"
            value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />

          {error && (
            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleLogin} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Ogretmen Paneline Gir →'}
          </button>

          <div style={{ marginTop: '1rem', padding: '10px 12px', background: 'rgba(124,58,237,0.06)', borderRadius: '10px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>
            💡 Ogretmen basvurusu yapmak icin{' '}
            <Link href="/register/teacher" style={{ color: '#7c3aed', fontWeight: 600 }}>buraya tiklayin</Link>.
            Admin onayinden sonra panele erisebilirsiniz.
          </div>
        </div>
      </div>
    </main>
  )
}
