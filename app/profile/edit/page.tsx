'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const GRADES = [
  { value: 'ilkokul 1. sinif', label: 'İlkokul 1. Sınıf' },
  { value: 'ilkokul 2. sinif', label: 'İlkokul 2. Sınıf' },
  { value: 'ilkokul 3. sinif', label: 'İlkokul 3. Sınıf' },
  { value: 'ilkokul 4. sinif', label: 'İlkokul 4. Sınıf' },
  { value: 'ortaokul 5. sinif', label: 'Ortaokul 5. Sınıf' },
  { value: 'ortaokul 6. sinif', label: 'Ortaokul 6. Sınıf' },
  { value: 'ortaokul 7. sinif', label: 'Ortaokul 7. Sınıf' },
  { value: 'ortaokul 8. sinif', label: 'Ortaokul 8. Sınıf' },
  { value: 'lise 9. sinif', label: 'Lise 9. Sınıf' },
  { value: 'lise 10. sinif', label: 'Lise 10. Sınıf' },
  { value: 'lise 11. sinif', label: 'Lise 11. Sınıf' },
  { value: 'lise 12. sinif', label: 'Lise 12. Sınıf' },
  { value: 'universite 1. sinif', label: 'Üniversite 1. Sınıf' },
  { value: 'universite 2. sinif', label: 'Üniversite 2. Sınıf' },
  { value: 'universite 3. sinif', label: 'Üniversite 3. Sınıf' },
  { value: 'universite 4. sinif', label: 'Üniversite 4. Sınıf' },
]

const LANGS = [
  { code: 'Türkçe', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'English', label: 'English', flag: '🇬🇧' },
  { code: 'Deutsch', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'Français', label: 'Français', flag: '🇫🇷' },
  { code: 'Español', label: 'Español', flag: '🇪🇸' },
  { code: 'العربية', label: 'العربية', flag: '🇸🇦' },
]

export default function ProfileEditPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [grade, setGrade] = useState('')
  const [school, setSchool] = useState('')
  const [lang, setLang] = useState('Türkçe')
  const [plan, setPlan] = useState('free')
  const [referralCode, setReferralCode] = useState('')
  const [parentCode, setParentCode] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [instCode, setInstCode] = useState('')
  const [instName, setInstName] = useState('')
  const [instJoined, setInstJoined] = useState('')
  const [instSaving, setInstSaving] = useState(false)
  const [instMsg, setInstMsg] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')

  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setEmail(user.email || '')
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (data) {
        setName(data.name || '')
        setGender(data.gender || '')
        setGrade(data.grade || '')
        setSchool(data.school || '')
        setLang(data.language || 'Türkçe')
        setPlan(data.plan || 'free')
        setReferralCode(data.referral_code || '')
        setParentCode(data.parent_code || '')

        // Mevcut kurum bağlantısı
        const { data: instUser } = await supabase
          .from('institution_users')
          .select('joined_at, institutions(name, code)')
          .eq('user_id', user.id)
          .eq('role', 'student')
          .maybeSingle()
        if (instUser) {
          setInstJoined(instUser.joined_at)
          setInstName((instUser.institutions as any)?.name || '')
          setInstCode((instUser.institutions as any)?.code || '')
        }
        setAvatarUrl(data.avatar_url || '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function uploadAvatar(file: File) {
    if (!file || file.size > 2 * 1024 * 1024) {
      alert('Dosya 2MB den kucuk olmali.')
      return
    }
    setAvatarUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { alert('Yükleme hatası: ' + error.message); setAvatarUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = publicUrl + '?t=' + Date.now() // cache bust

    await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
    setAvatarUrl(url)
    setAvatarUploading(false)
  }

  async function handleSave() {
    if (!name.trim() || !grade) { setError('Ad ve sınıf zorunlu.'); return }
    setError(''); setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    await supabase.from('profiles').upsert({
      id: user.id,
      name: name.trim(),
      gender: gender || null,
      grade,
      school: school || null,
      language: lang,
    })

    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2500)
  }

  function copyReferral() {
    const link = `${window.location.origin}/register?ref=${referralCode}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <Link href="/">
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '36px' }} />
          </Link>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/quiz" className="btn btn-ghost btn-sm">← Testler</Link>
            <Link href="/dashboard" className="btn btn-ghost btn-sm">Dashboard</Link>
          </div>
        </nav>

        <div className="anim-up" style={{ marginBottom: '1.5rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.5rem' }}>Profil</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Profil ayarları</h1>
        </div>

        {/* Kisisel bilgiler */}
        <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
            Kişisel bilgiler
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar"
                  style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)' }} />
              ) : (
                <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '26px', border: '3px solid var(--border)' }}>
                  {name?.slice(0, 2).toUpperCase() || '?'}
                </div>
              )}
              {avatarUploading && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" style={{ width: 20, height: 20 }} />
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>Profil Fotoğrafı</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>JPG, PNG · Maks. 2MB</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1.5px solid var(--border)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: 'var(--text2)' }}>
                  📷 {avatarUrl ? 'Değiştir' : 'Yükle'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }} />
                </label>
                {avatarUrl && (
                  <button onClick={async () => {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user) return
                    await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`])
                    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
                    setAvatarUrl('')
                  }} style={{ fontSize: '12px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                    Kaldır
                  </button>
                )}
              </div>
            </div>
          </div>

          <label className="field-label">Ad soyad</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Adın Soyadın" />

          <label className="field-label">E-posta</label>
          <input className="input" value={email} disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="field-label">Yaş</label>
              <input className="input" type="number" min={5} max={30} placeholder="12"
                value={age} onChange={e => setAge(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Cinsiyet</label>
              <select className="input" value={gender} onChange={e => setGender(e.target.value)}>
                <option value="">Seç</option>
                <option value="erkek">Erkek</option>
                <option value="kiz">Kız</option>
                <option value="belirtmek istemiyorum">Belirtmek istemiyorum</option>
              </select>
            </div>
          </div>

          <label className="field-label">Sınıf / eğitim seviyesi</label>
          <select className="input" value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="">Seç</option>
            {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>

          <label className="field-label">Okul (isteğe bağlı)</label>
          <input className="input" placeholder="İzmir Fen Lisesi"
            value={school} onChange={e => setSchool(e.target.value)} />
        </div>

        {/* Dil secimi */}
        <div className="card anim-up-2" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
            Test dili
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1rem' }}>
            Sorular ve açıklamalar seçtiğin dilde gelecek.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: `1.5px solid ${lang === l.code ? 'var(--accent)' : 'var(--border)'}`,
                  background: lang === l.code ? 'var(--accent-bg)' : 'var(--bg2)',
                  color: lang === l.code ? 'var(--accent)' : 'var(--text)',
                  fontSize: '13px',
                  fontWeight: lang === l.code ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Plan bilgisi */}
        <div className="card anim-up-3" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
            Üyelik
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 500 }}>
                {plan === 'premium' ? '★ Premium üye' : 'Ücretsiz plan'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '2px' }}>
                {plan === 'free' ? 'Ayda 10 test · Sınırsız için yükselt' : 'Sınırsız test · Tüm özellikler aktif'}
              </div>
            </div>
            <Link href="/pricing" className={`btn btn-sm ${plan === 'premium' ? '' : 'btn-primary'}`}>
              {plan === 'premium' ? 'Planı gör' : 'Yükselt →'}
            </Link>
          </div>
        </div>

        {/* Veli bağlantısı */}
        {parentCode && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
              👨‍👩‍👧 Veli Bağlantısı
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px', lineHeight: 1.6 }}>
              Velinize bu kodu verin — Veli Panelinden performansınızı takip edebilirler.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', background: 'var(--bg2)', border: '1.5px solid var(--border)', fontSize: '16px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--primary)', fontFamily: 'monospace' }}>
                {parentCode}
              </div>
              <button onClick={() => navigator.clipboard.writeText(parentCode)}
                style={{ padding: '10px 14px', borderRadius: '10px', background: '#082465', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Kopyala
              </button>
            </div>
          </div>
        )}

        {/* Referral */}
        {/* Kurum Kodu */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
            🏛️ Kurum Bağlantısı
          </div>
          {instName ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', background: 'var(--bg2)', border: '1.5px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>{instName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    Kod: <strong style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{instCode}</strong>
                    {instJoined && ` · Katılım: ${new Date(instJoined).toLocaleDateString('tr-TR')}`}
                  </div>
                </div>
                <button onClick={async () => {
                  if (!confirm('Kurumdan ayrılmak istediğinize emin misiniz?')) return
                  const { data: { user: u } } = await supabase.auth.getUser()
                  const { data: inst } = await supabase.from('institutions').select('id').eq('code', instCode).maybeSingle()
                  if (inst) await supabase.from('institution_users').delete().eq('user_id', u.id).eq('institution_id', inst.id)
                  setInstName(''); setInstCode(''); setInstJoined('')
                }} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.2)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                  Ayrıl
                </button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--green)', margin: 0 }}>✅ Bu kuruma kayıtlısınız.</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px', lineHeight: 1.6 }}>
                Okulunuz veya kurumunuz Pratium ile anlaşmalıysa size verilen kodu girin.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="input"
                  placeholder="8 haneli kurum kodu"
                  value={instCode}
                  style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  onChange={async e => {
                    const val = e.target.value.toUpperCase()
                    setInstCode(val)
                    setInstMsg('')
                    if (val.length === 8) {
                      const { data: inst } = await supabase.from('institutions').select('name').eq('code', val).eq('active', true).maybeSingle()
                      if (inst) setInstMsg(`🏛️ ${inst.name} — Katılmak için butona bas`)
                      else setInstMsg('Kurum bulunamadı.')
                    }
                  }}
                />
                <button disabled={instSaving || instCode.length !== 8} onClick={async () => {
                  setInstSaving(true); setInstMsg('')
                  const { data: { user: u } } = await supabase.auth.getUser()
                  if (!u) { setInstMsg('Oturum bulunamadı.'); setInstSaving(false); return }
                  const { data: { session } } = await supabase.auth.getSession()
                  const res = await fetch('/api/institution/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                    body: JSON.stringify({ institution_code: instCode, user_id: u.id }),
                  })
                  const json = await res.json()
                  if (!res.ok) {
                    setInstMsg(`Hata: ${json.error}`)
                    setInstSaving(false)
                    return
                  }
                  setInstName(json.institution_name)
                  setInstJoined(new Date().toISOString())
                  setInstMsg('✅ Kuruma başarıyla kaydoldunuz!')
                  setInstSaving(false)
                }} style={{ padding: '10px 16px', borderRadius: '10px', background: '#082465', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: instSaving || instCode.length !== 8 ? 0.5 : 1 }}>
                  {instSaving ? '...' : 'Katıl'}
                </button>
              </div>

              {instMsg && <div style={{ fontSize: '12px', color: instMsg.startsWith('✅') ? 'var(--green)' : instMsg.startsWith('🏛️') ? '#6366f1' : 'var(--red)', marginTop: '6px' }}>{instMsg}</div>}
            </div>
          )}
        </div>

        {referralCode && (
          <div className="card anim-up-4" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              Davet linkin
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '0.75rem' }}>
              10 kişiyi davet et → 1 yıl ücretsiz premium kazan.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${referralCode}`}
                style={{ fontSize: '12px' }}
              />
              <button className="btn btn-sm" onClick={copyReferral} style={{ flexShrink: 0 }}>
                {copied ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          </div>
        )}

        {/* Error / success */}
        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--red)', marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--green)', marginBottom: '1rem' }}>
            ✓ Profil kaydedildi!
          </div>
        )}

        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}
          style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Kaydet'}
        </button>
      </div>
    </main>
  )
}
