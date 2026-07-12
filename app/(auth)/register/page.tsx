'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

const ROLES = [
  {
    key: 'student',
    icon: '⚡',
    title: 'Öğrenci',
    desc: 'Test çöz, gelişimini takip et',
    color: '#082465',
    bg: 'rgba(8,36,101,0.06)',
    border: 'rgba(8,36,101,0.2)',
  },
  {
    key: 'teacher',
    icon: '🎓',
    title: 'Öğretmen',
    desc: 'Sınıf yönet, ödev ata, analiz yap',
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.06)',
    border: 'rgba(124,58,237,0.25)',
  },
  {
    key: 'parent',
    icon: '👨‍👩‍👧',
    title: 'Veli',
    desc: 'Çocuğunun performansını takip et',
    color: '#1ECFB8',
    bg: 'rgba(30,207,184,0.06)',
    border: 'rgba(30,207,184,0.3)',
  },
]

function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref') || ''
  const kurumParam = searchParams.get('kurum') || ''
  const supabase = createClient() as any

  // Adım yönetimi
  const [step, setStep] = useState<'role' | 'info' | 'teacher_info'>('role')
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher' | 'parent' | null>(null)

  // Ortak alanlar
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [kvkk, setKvkk] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  // Öğrenci alanları
  const [age, setAge] = useState('')
  const [grade, setGrade] = useState('')
  const [studentSchool, setStudentSchool] = useState('')
  const [classNumber, setClassNumber] = useState('')
  const [institutionCode, setInstitutionCode] = useState(kurumParam.toUpperCase())
  const [institutionName, setInstitutionName] = useState('')
  const [kvkkAydinlatma, setKvkkAydinlatma] = useState(false)
  const [kvkkAcikRiza, setKvkkAcikRiza] = useState(false)
  const [veliOnayi, setVeliOnayi] = useState(false)

  // Öğretmen alanları
  const [school, setSchool] = useState('')
  const [subject, setSubject] = useState('')
  const [phone, setPhone] = useState('')
  const [doc, setDoc] = useState<File | null>(null)

  // Kurum davet kodunu doğrular (hem manuel giriş hem de QR/link ile gelen ?kurum= için ortak)
  async function verifyInstitutionCode(val: string) {
    if (val.length === 8) {
      const { data: inst } = await supabase.from('institutions').select('name').eq('code', val).eq('active', true).maybeSingle()
      setInstitutionName(inst?.name || '')
    } else {
      setInstitutionName('')
    }
  }

  // QR kod / paylaşılan link (?kurum=KOD) ile gelindiyse: kodu doğrula ve
  // öğrenciyi doğrudan kayıt adımına götür (rol seçimini atla — davet zaten
  // "öğrenci kaydı" niyetini taşıyor).
  useEffect(() => {
    if (kurumParam.length === 8) {
      verifyInstitutionCode(kurumParam.toUpperCase())
      setSelectedRole('student')
      setStep('info')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Referral
  const [referrerName, setReferrerName] = useState('')
  useEffect(() => {
    if (!ref) return
    supabase.from('profiles').select('name').eq('referral_code', ref.toUpperCase()).single()
      .then(({ data }: any) => { if (data) setReferrerName(data.name.split(' ')[0]) })
  }, [ref])

  async function handleOAuth() {
    if (!selectedRole) return
    setOauthLoading(true)
    localStorage.setItem('pending_role', selectedRole)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?role=${selectedRole}${ref ? `&ref=${ref}` : ''}` },
    })
  }

  async function handleRegister() {
    if (!name.trim()) { setError('Ad zorunludur.'); return }
    if (!surname.trim()) { setError('Soyad zorunludur.'); return }
    if (!email.trim()) { setError('E-posta zorunludur.'); return }
    if (pass.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return }
    if (!kvkkAydinlatma) { setError('KVKK Aydınlatma Metnini okuduğunuzu onaylamalısınız.'); return }
    if (!kvkkAcikRiza) { setError('Yapay zeka destekli analiz için açık rıza vermelisiniz.'); return }
    if (selectedRole === 'student' && age && parseInt(age) < 18 && !veliOnayi) { setError('18 yaş altı kayıtlar için veli onayı beyanı gereklidir.'); return }

    // Öğrenci için ek kontrol
    if (selectedRole === 'student') {
      if (!age || parseInt(age) < 5 || parseInt(age) > 35) { setError('Gecerli bir yas girin (5-35).'); return }
      if (!grade) { setError('Sinif / egitim seviyesi zorunludur.'); return }
      if (!studentSchool.trim()) { setError('Okul adı zorunludur.'); return }
      if (!classNumber.trim()) { setError('Sınıf numarası zorunludur.'); return }
    }

    setError(''); setLoading(true)
    const fullName = `${name.trim()} ${surname.trim()}`

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { name: fullName } },
    })

    if (err) { setError(err.message); setLoading(false); return }

    if (data.user) {
      if (selectedRole === 'student') {
        // Öğrenci profili
        // NOT: 'age' bilerek gönderilmiyor — profiles tablosunda böyle bir kolon
        // yok. Yaş formda hâlâ isteniyor ve doğrulanıyor (yukarıdaki 5-35 ve
        // 18 yaş altı veli onayı kontrolleri için), ama veritabanına yazılmıyor.
        const { error: upsertError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          name: fullName,
          grade,
          school: studentSchool.trim(),
          class_number: classNumber.trim(),
          language: 'Türkçe',
          role: 'student',
        })
        if (upsertError) {
          console.error('profiles upsert hatasi (register):', upsertError)
          setError('Profil oluşturulamadı: ' + upsertError.message)
          setLoading(false)
          return
        }

        // KVKK rıza kayıtları (ispat yükümlülüğü)
        const consentRows: any[] = [
          { user_id: data.user.id, consent_type: 'aydinlatma', consent_version: 'v1.0', granted: kvkkAydinlatma },
          { user_id: data.user.id, consent_type: 'acik_riza_analiz', consent_version: 'v1.0', granted: kvkkAcikRiza },
        ]
        if (parseInt(age) < 18) {
          consentRows.push({ user_id: data.user.id, consent_type: 'veli_onayi', consent_version: 'v1.0', granted: veliOnayi })
        }
        await supabase.from('consent_records').insert(consentRows).then(() => {}, () => {})

        // Kurum kodu
        if (institutionCode.trim()) {
          const { data: inst } = await supabase.from('institutions')
            .select('id').eq('code', institutionCode.trim().toUpperCase()).eq('active', true).maybeSingle()
          if (inst) {
            await supabase.from('institution_users').insert({ institution_id: inst.id, user_id: data.user.id, role: 'student' })
          }
        }

        // Referral — ödül sistemi ile
        if (ref) {
          const { data: referrer } = await supabase.from('profiles').select('id').eq('referral_code', ref.toUpperCase()).single()
          if (referrer && referrer.id !== data.user.id) {
            await new Promise(r => setTimeout(r, 800))
            await fetch('/api/referral/reward', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ referrer_id: referrer.id, referred_id: data.user.id }),
            }).catch(() => {})
          }
        }

        setLoading(false)
        router.push('/quiz')

      } else if (selectedRole === 'parent') {
        // Veli profili
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name: fullName,
          language: 'Türkçe',
          role: 'parent',
        })
        setLoading(false)
        router.push('/parent')

      } else if (selectedRole === 'teacher') {
        // Öğretmen: profil + başvuru
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name: fullName,
          language: 'Türkçe',
          role: 'teacher',
        })
        setStep('teacher_info')
        setLoading(false)
      }
    }
  }

  async function handleTeacherApply() {
    if (!school.trim()) { setError('Okul/Kurum zorunlu.'); return }
    setError(''); setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Oturum bulunamadi.'); setLoading(false); return }

    let docUrl = ''
    if (doc) {
      const ext = doc.name.split('.').pop()
      const path = `teacher-docs/${user.id}-${Date.now()}.${ext}`
      const { data: uploadData } = await supabase.storage.from('teacher-documents').upload(path, doc, { upsert: true })
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('teacher-documents').getPublicUrl(path)
        docUrl = urlData.publicUrl
      }
    }

    await supabase.from('teachers').insert({
      user_id: user.id,
      name: `${name.trim()} ${surname.trim()}`,
      email: user.email,
      school: school.trim(),
      subject: subject.trim(),
      phone: phone.trim() || null,
      document_url: docUrl || null,
      approved: false,
    })

    setLoading(false)
    // Öğretmen onay bekliyor — quiz'e git ama panel kısıtlı
    router.push('/teacher')
  }

  // ── ADIM 1: Rol Seçimi ──
  if (step === 'role') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
              <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '64px', width: 'auto' }} />
            </Link>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginTop: '12px' }}>
              Hesap oluştur
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
              Kimsin? Sana uygun deneyim hazırlayalım.
            </p>
          </div>

          {referrerName && (
            <div style={{ marginBottom: '1rem', padding: '10px 14px', background: 'var(--accent-bg)', borderRadius: '10px', fontSize: '13px', color: 'var(--accent)', textAlign: 'center', fontWeight: 600 }}>
              🎁 {referrerName} seni davet etti!
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }} className="anim-up-1">
            {ROLES.map(role => (
              <button key={role.key} onClick={() => { setSelectedRole(role.key as any); setStep('info') }}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', borderRadius: '16px', border: `1.5px solid ${role.border}`, background: role.bg, cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s', textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                <div style={{ width: 48, height: 48, borderRadius: '14px', background: role.bg, border: `1.5px solid ${role.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                  {role.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: role.color }}>{role.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{role.desc}</div>
                </div>
                <span style={{ color: role.color, fontSize: '20px', opacity: 0.5 }}>›</span>
              </button>
            ))}
          </div>

          <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text3)' }} className="anim-up-2">
            Zaten hesabın var mı?{' '}
            <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Giriş yap</Link>
          </div>
        </div>
      </main>
    )
  }

  // ── ADIM 2: Öğretmen başvuru bilgileri (kayıt sonrası) ──
  if (step === 'teacher_info') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }} className="anim-up">
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎓</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>Öğretmen Bilgileri</h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Admin onayından sonra panele erişebilirsiniz</p>
          </div>

          <div className="card anim-up-1">
            <label className="field-label">Okul / Kurum *</label>
            <input className="input" placeholder="Ankara Anadolu Lisesi"
              value={school} onChange={e => setSchool(e.target.value)} />

            <label className="field-label">Branş</label>
            <input className="input" placeholder="Matematik, Fizik..."
              value={subject} onChange={e => setSubject(e.target.value)} />

            <label className="field-label">Telefon (Opsiyonel)</label>
            <input className="input" type="tel" placeholder="05xx xxx xx xx"
              value={phone} onChange={e => setPhone(e.target.value)} />

            <label className="field-label">Belge Yükle (Opsiyonel)</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', fontSize: '13px', cursor: 'pointer', color: 'var(--text2)', fontFamily: 'var(--font-sans)', marginBottom: '4px' }}>
              📎 {doc ? doc.name : 'Belge seç (PDF, JPG)'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                onChange={e => setDoc(e.target.files?.[0] || null)} />
            </label>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '1rem' }}>Öğretmenlik belgesi, diploma vb.</div>

            {error && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{error}</div>}

            <button className="btn btn-primary" onClick={handleTeacherApply} disabled={loading}
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Başvuruyu Gönder →'}
            </button>

            <button onClick={() => router.push('/teacher')} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text3)', marginTop: '8px', fontFamily: 'var(--font-sans)', textAlign: 'center' }}>
              Daha sonra tamamla →
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── ADIM 2: Kayıt Formu (Öğrenci / Veli / Öğretmen) ──
  const roleInfo = ROLES.find(r => r.key === selectedRole)!

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }} className="anim-up">
          <button onClick={() => setStep('role')} style={{ fontSize: '13px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'block', margin: '0 auto 12px' }}>← Geri</button>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '999px', background: roleInfo.bg, border: `1px solid ${roleInfo.border}`, fontSize: '13px', fontWeight: 700, color: roleInfo.color, marginBottom: '8px' }}>
            {roleInfo.icon} {roleInfo.title} Kaydı
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>Hesap Oluştur</h1>
        </div>

        <div className="card anim-up-1">
          {/* Google ile kayıt */}
          <button className="btn" onClick={handleOAuth} disabled={oauthLoading}
            style={{ width: '100%', justifyContent: 'center', gap: '10px', fontWeight: 500, marginBottom: '0.5rem' }}>
            {oauthLoading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Google ile kayıt ol
          </button>
          <div className="divider">veya e-posta ile</div>

          {/* Ad / Soyad */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="field-label">Ad *</label>
              <input className="input" placeholder="Ahmet" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Soyad *</label>
              <input className="input" placeholder="Yilmaz" value={surname} onChange={e => setSurname(e.target.value)} />
            </div>
          </div>

          {/* Öğrenci özel alanlar */}
          {selectedRole === 'student' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="field-label">Yaş *</label>
                <input className="input" type="number" placeholder="16" value={age} onChange={e => setAge(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Sınıf *</label>
                <select className="input" value={grade} onChange={e => setGrade(e.target.value)}
                  style={{ cursor: 'pointer' }}>
                  <option value="">Seç...</option>
                  {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Okul Adı *</label>
                <input className="input" placeholder="Örn: Atatürk Ortaokulu" value={studentSchool} onChange={e => setStudentSchool(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Sınıf Numarası *</label>
                <input className="input" placeholder="Örn: 14" value={classNumber} onChange={e => setClassNumber(e.target.value)} />
              </div>
            </div>
          )}

          <label className="field-label">E-posta *</label>
          <input className="input" type="email" placeholder="ornek@mail.com"
            value={email} onChange={e => setEmail(e.target.value)} />

          <label className="field-label">Şifre *</label>
          <input className="input" type="password" placeholder="En az 6 karakter"
            value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()} />

          {/* Kurum kodu - sadece öğrenci */}
          {selectedRole === 'student' && (
            <div style={{ marginBottom: '0.75rem', padding: '12px 14px', borderRadius: '12px', background: 'rgba(217,119,6,0.04)', border: '1.5px solid rgba(217,119,6,0.15)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', marginBottom: '6px' }}>🏛️ Kurum Kodu (Opsiyonel)</div>
              <input className="input" placeholder="8 haneli kurum kodu"
                value={institutionCode}
                onChange={async e => {
                  const val = e.target.value.toUpperCase()
                  setInstitutionCode(val)
                  await verifyInstitutionCode(val)
                }}
              />
              {institutionName && <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600, marginTop: '4px' }}>✓ {institutionName} kurumuna baglaniyor</div>}
            </div>
          )}

          {/* KVKK — Aydınlatma ve Açık Rıza AYRI metinler (KVKK Kurulu İlke Kararı 2026/347) */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
            <input type="checkbox" checked={kvkkAydinlatma} onChange={e => { setKvkkAydinlatma(e.target.checked); setKvkk(e.target.checked && kvkkAcikRiza) }}
              style={{ marginTop: '2px', flexShrink: 0, width: 16, height: 16, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              <Link href="/kvkk/aydinlatma" target="_blank" style={{ color: 'var(--accent)', fontWeight: 600 }}>KVKK Aydınlatma Metni</Link>'ni okudum.
              (<Link href="/terms" target="_blank" style={{ color: 'var(--accent)' }}>Kullanım Koşulları</Link>)
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
            <input type="checkbox" checked={kvkkAcikRiza} onChange={e => { setKvkkAcikRiza(e.target.checked); setKvkk(kvkkAydinlatma && e.target.checked) }}
              style={{ marginTop: '2px', flexShrink: 0, width: 16, height: 16, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              Performans verilerimin yapay zeka destekli analiz ve kişiselleştirilmiş öneriler için işlenmesine{' '}
              <Link href="/kvkk/acik-riza" target="_blank" style={{ color: 'var(--accent)', fontWeight: 600 }}>açık rıza</Link> veriyorum.
            </span>
          </label>

          {selectedRole === 'student' && age && parseInt(age) < 18 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '1rem', padding: '10px', borderRadius: '10px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <input type="checkbox" checked={veliOnayi} onChange={e => setVeliOnayi(e.target.checked)}
                style={{ marginTop: '2px', flexShrink: 0, width: 16, height: 16, accentColor: '#7c3aed' }} />
              <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                <b>18 yaşından küçüğüm:</b> Bu platforma kaydım ve kişisel verilerimin işlenmesi konusunda
                velimin/vasimin bilgisi ve onayı vardır. Velim, Veli Paneli üzerinden hesabımı takip edebilir.
              </span>
            </label>
          )}

          {error && (
            <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleRegister} disabled={loading || !kvkkAydinlatma || !kvkkAcikRiza}
            style={{ width: '100%', justifyContent: 'center', background: selectedRole === 'teacher' ? 'linear-gradient(135deg, #7c3aed, #5b21b6)' : selectedRole === 'parent' ? 'linear-gradient(135deg, #1ECFB8, #0a9e90)' : undefined }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
              selectedRole === 'teacher' ? 'Hesap Oluştur → Başvuruya Devam Et' :
              selectedRole === 'parent' ? 'Veli Hesabı Oluştur →' :
              'Öğrenci Hesabı Oluştur →'
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '13px', color: 'var(--text3)' }}>
            Zaten hesabın var mı?{' '}
            <Link href="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Giriş yap</Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <RegisterContent />
    </Suspense>
  )
}
