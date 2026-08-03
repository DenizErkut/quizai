'use client'
// app/auth/complete-profile/page.tsx
//
// E-posta onay bağlantısının hedefi (bkz. register/page.tsx signUp
// emailRedirectTo). createBrowserClient sayfa yüklenirken URL'deki
// ?code=... parametresini otomatik değiştirip (exchange) session kurar
// (aynı mekanizma OAuth için register/teacher sayfasında da kullanılıyor).
//
// Bu sayfa TEK görevi: session kurulduktan sonra, kayıt formunda toplanmış
// olan veriyi (varsa localStorage'dan) okuyup TR-PG kimlik + profiles
// kaydını TAMAMLAMAK. Veri bulunamazsa (farklı cihaz/tarayıcıdan onay,
// localStorage temizlenmiş vb.) kısa bir "profilini tamamla" formu
// gösterilir — kullanıcı kaybolmaz, veri kaybı yerine zarif bozulma olur.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loadPendingRegistration, clearPendingRegistration, PendingRole } from '@/lib/pending-registration'

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

type Phase = 'loading' | 'error' | 'teacher-apply' | 'teacher-done' | 'fallback-form' | 'done'

export default function CompleteProfilePage() {
  const router = useRouter()
  const supabase = createClient() as any

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // Öğretmen için başvuru adımı (school/subject/phone/doc) — pending veri
  // bulunsun ya da fallback formundan gelsin, teacher rolü için ortak.
  const [userId, setUserId] = useState('')
  const [nextUrl, setNextUrl] = useState('/home')
  const [school, setSchool] = useState('')
  const [subject, setSubject] = useState('')
  const [phone, setPhone] = useState('')
  const [doc, setDoc] = useState<File | null>(null)
  const [teacherError, setTeacherError] = useState('')

  // Fallback form alanları (pending veri bulunamazsa)
  const [fbRole, setFbRole] = useState<PendingRole>('student')
  const [fbName, setFbName] = useState('')
  const [fbAge, setFbAge] = useState('')
  const [fbGrade, setFbGrade] = useState('')
  const [fbSchool, setFbSchool] = useState('') // öğretmen: serbest metin okul/kurum adı
  const [fbClassNumber, setFbClassNumber] = useState('')
  const [fbInstitutionCode, setFbInstitutionCode] = useState('')
  const [fbInstitutionName, setFbInstitutionName] = useState('') // öğrenci: kurum kaydından otomatik
  const [fbParentEmail, setFbParentEmail] = useState('')
  const [fbPhone, setFbPhone] = useState('')
  const [fbKvkkAydinlatma, setFbKvkkAydinlatma] = useState(false)
  const [fbKvkkAcikRiza, setFbKvkkAcikRiza] = useState(false)
  const [fbVeliOnayi, setFbVeliOnayi] = useState(false)
  const [fbError, setFbError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        // createBrowserClient ?code=...'u otomatik değiştirir (detectSessionInUrl).
        // Bu işlem async olduğu için getUser() birkaç deneme gerektirebilir.
        let user = null
        for (let i = 0; i < 6; i++) {
          const { data } = await supabase.auth.getUser()
          if (data?.user) { user = data.user; break }
          await new Promise(r => setTimeout(r, 500))
        }
        if (cancelled) return

        if (!user) {
          setErrorMsg('Onay bağlantısı geçersiz veya süresi dolmuş olabilir. Lütfen tekrar kayıt olmayı deneyin ya da giriş yapmayı dene — hesabın zaten onaylanmış olabilir.')
          setPhase('error')
          return
        }
        setUserId(user.id)

        const pending = loadPendingRegistration()

        if (pending) {
          await completeWithPendingData(user.id, pending)
          return
        }

        // localStorage'da veri yok (farklı cihaz/tarayıcı vb.) — user_metadata'daki
        // pending_role ipucuyla fallback formu göster.
        const metaRole = (user.user_metadata?.pending_role as PendingRole) || 'student'
        setFbRole(metaRole)
        setPhase('fallback-form')
      } catch (e: any) {
        // Hiçbir hata 'loading' ekranında sonsuza kadar takılı bırakmasın —
        // kullanıcı en azından tekrar deneme/giriş seçenekleri görsün.
        if (cancelled) return
        console.error('[complete-profile run] beklenmeyen hata:', e)
        setErrorMsg('Beklenmeyen bir hata oluştu (' + (e?.message || 'bilinmeyen') + '). Lütfen tekrar dene.')
        setPhase('error')
      }
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function completeWithPendingData(uid: string, pending: NonNullable<ReturnType<typeof loadPendingRegistration>>) {
    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token
    if (!accessToken) {
      setErrorMsg('Oturum kurulamadı. Lütfen tekrar giriş yapmayı dene.')
      setPhase('error')
      return
    }

    const idRes = await fetch('/api/auth/create-identity', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: pending.fullName,
        age: pending.age,
        role: pending.role,
        parentEmail: pending.parentEmail || undefined,
        institutionName: pending.studentSchool || undefined,
        kvkkAydinlatma: pending.kvkkAydinlatma,
        kvkkAcikRiza: pending.kvkkAcikRiza,
        veliOnayi: pending.veliOnayi,
      }),
    })
    if (!idRes.ok) {
      setErrorMsg('Kimlik kaydı oluşturulamadı. Lütfen tekrar dene.')
      setPhase('error')
      return
    }
    if (pending.phone) {
      await fetch('/api/profile/update-identity', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pending.phone, role: pending.role }),
      }).catch(() => {})
    }

    const safeNext = pending.next && pending.next.startsWith('/') && !pending.next.startsWith('//') && !pending.next.startsWith('/login')
      ? pending.next : '/home'
    setNextUrl(safeNext)

    if (pending.role === 'student') {
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: uid,
        grade: pending.grade,
        school: pending.studentSchool,
        class_number: pending.classNumber,
        language: 'Türkçe',
        role: 'student',
      })
      if (upsertError) {
        setErrorMsg('Profil oluşturulamadı: ' + upsertError.message)
        setPhase('error')
        return
      }

      if (pending.institutionCode) {
        const { data: inst } = await supabase.from('institutions')
          .select('id').eq('code', pending.institutionCode.toUpperCase()).eq('active', true).maybeSingle()
        if (inst) {
          await supabase.from('institution_users').insert({ institution_id: inst.id, user_id: uid, role: 'student' })
        }
      }

      if (pending.ref) {
        const { data: referrer } = await supabase.from('profiles').select('id').eq('referral_code', pending.ref.toUpperCase()).single()
        if (referrer && referrer.id !== uid) {
          await fetch('/api/referral/reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referrer_id: referrer.id, referred_id: uid }),
          }).catch(() => {})
        }
      }

      clearPendingRegistration()
      setPhase('done')
      router.push(safeNext)
      return
    }

    if (pending.role === 'parent') {
      await supabase.from('profiles').upsert({ id: uid, language: 'Türkçe', role: 'parent' })
      clearPendingRegistration()
      setPhase('done')
      router.push('/parent')
      return
    }

    // teacher — profil oluştur, sonra okul/branş/belge adımını göster
    await supabase.from('profiles').upsert({ id: uid, language: 'Türkçe', role: 'teacher' })
    clearPendingRegistration()
    setPhase('teacher-apply')
  }

  async function handleTeacherApply() {
    if (!school.trim()) { setTeacherError('Okul/Kurum zorunlu.'); return }
    setTeacherError(''); setLoading(true)

    try {
      let docUrl = ''
      if (doc) {
        const ext = doc.name.split('.').pop()
        const path = `teacher-docs/${userId}-${Date.now()}.${ext}`
        const { data: uploadData } = await supabase.storage.from('teacher-documents').upload(path, doc, { upsert: true })
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('teacher-documents').getPublicUrl(path)
          docUrl = urlData.publicUrl
        }
      }

      await supabase.from('teachers').insert({
        user_id: userId,
        school: school.trim(),
        subject: subject.trim(),
        document_url: docUrl || null,
        approved: false,
      })

      if (phone.trim()) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/profile/update-identity', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone.trim(), role: 'teacher' }),
        }).catch(() => {})
      }

      setPhase('teacher-done')
    } catch (e: any) {
      console.error('[complete-profile handleTeacherApply] beklenmeyen hata:', e)
      setTeacherError('Beklenmeyen bir hata oluştu (' + (e?.message || 'bilinmeyen') + '). Lütfen tekrar dene.')
    } finally {
      setLoading(false)
    }
  }

  async function handleFallbackSubmit() {
    if (!fbName.trim()) { setFbError('Ad soyad zorunludur.'); return }
    if (!fbKvkkAydinlatma) { setFbError('KVKK Aydınlatma Metnini onaylamalısın.'); return }
    if (!fbKvkkAcikRiza) { setFbError('Açık rıza vermelisin.'); return }
    if (fbRole === 'student') {
      if (!fbAge || parseInt(fbAge) < 5 || parseInt(fbAge) > 35) { setFbError('Geçerli bir yaş girin (5-35).'); return }
      if (!fbGrade) { setFbError('Sınıf zorunludur.'); return }
      // Okul adı/sınıf numarası SADECE kurum kodu doğrulandığında zorunlu —
      // internetten bireysel kayıtta hiç istenmiyor (bkz. register/page.tsx
      // ve profile/page.tsx'teki aynı mantık).
      if (fbInstitutionName && !fbClassNumber.trim()) { setFbError('Sınıf numarası zorunludur.'); return }
      if (parseInt(fbAge) < 18 && !fbVeliOnayi) { setFbError('18 yaş altı için veli onayı gereklidir.'); return }
    }
    if (fbRole === 'teacher' && !fbSchool.trim()) { setFbError('Okul/Kurum zorunludur.'); return }

    setFbError(''); setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) { setFbError('Oturum bulunamadı.'); return }

      const idRes = await fetch('/api/auth/create-identity', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fbName.trim(),
          age: fbRole === 'student' && fbAge ? parseInt(fbAge) : undefined,
          role: fbRole,
          parentEmail: fbRole === 'student' ? (fbParentEmail.trim() || undefined) : undefined,
          institutionName: fbRole === 'student' ? (fbInstitutionName || undefined) : undefined,
          kvkkAydinlatma: fbKvkkAydinlatma, kvkkAcikRiza: fbKvkkAcikRiza, veliOnayi: fbVeliOnayi,
        }),
      })
      if (!idRes.ok) { setFbError('Kimlik kaydı oluşturulamadı.'); return }
      if (fbRole === 'student' && fbPhone.trim()) {
        await fetch('/api/profile/update-identity', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: fbPhone.trim(), role: 'student' }),
        }).catch(() => {})
      }

      if (fbRole === 'student') {
        // school SADECE kurum kodu doğrulandığında dolar (fbInstitutionName) —
        // elle yazılmış bir okul adı asla kabul edilmez.
        await supabase.from('profiles').upsert({
          id: userId, grade: fbGrade,
          school: fbInstitutionName || null,
          class_number: fbInstitutionName ? fbClassNumber.trim() : null,
          language: 'Türkçe', role: 'student',
        })
        router.push('/home')
      } else if (fbRole === 'parent') {
        await supabase.from('profiles').upsert({ id: userId, language: 'Türkçe', role: 'parent' })
        router.push('/parent')
      } else {
        await supabase.from('profiles').upsert({ id: userId, language: 'Türkçe', role: 'teacher' })
        setPhase('teacher-apply')
      }
    } catch (e: any) {
      console.error('[handleFallbackSubmit] beklenmeyen hata:', e)
      setFbError('Beklenmeyen bir hata oluştu (' + (e?.message || 'bilinmeyen') + '). Lütfen tekrar dene.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyFbInstitutionCode(val: string) {
    if (val.length === 8) {
      const { data: inst } = await supabase.from('institutions').select('name').eq('code', val).eq('active', true).maybeSingle()
      setFbInstitutionName(inst?.name || '')
    } else {
      setFbInstitutionName('')
    }
  }

  if (phase === 'loading') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <p style={{ fontSize: '14px', color: 'var(--text3)' }}>Hesabın onaylanıyor...</p>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="card" style={{ maxWidth: 440, textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: 'var(--primary)', marginBottom: '10px' }}>Bir sorun oluştu</h2>
          <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>{errorMsg}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <a href="/login" className="btn btn-primary">Giriş yap</a>
            <a href="/register" className="btn">Tekrar kayıt ol</a>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </main>
    )
  }

  if (phase === 'teacher-done') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div className="card anim-up-1" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
              Başvurunuz Alındı!
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Ekibimiz başvurunuzu inceleyecek ve e-posta ile bildirim gönderecek.
              Onay süreci genellikle 1-2 iş günü sürmektedir.
            </p>
            <button onClick={() => router.push('/teacher')} className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              Devam Et
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'teacher-apply') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎓</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>Hesabın onaylandı — son adım</h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Admin onayından sonra panele erişebilirsin</p>
          </div>
          <div className="card">
            <label className="field-label">Okul / Kurum *</label>
            <input className="input" placeholder="Ankara Anadolu Lisesi" value={school} onChange={e => setSchool(e.target.value)} />
            <label className="field-label">Branş</label>
            <input className="input" placeholder="Matematik, Fizik..." value={subject} onChange={e => setSubject(e.target.value)} />
            <label className="field-label">Telefon (Opsiyonel)</label>
            <input className="input" type="tel" placeholder="05xx xxx xx xx" value={phone} onChange={e => setPhone(e.target.value)} />
            <label className="field-label">Belge Yükle (Opsiyonel)</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', fontSize: '13px', cursor: 'pointer', color: 'var(--text2)', marginBottom: '4px' }}>
              📎 {doc ? doc.name : 'Belge seç (PDF, JPG)'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setDoc(e.target.files?.[0] || null)} />
            </label>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '1rem' }}>Öğretmenlik belgesi, diploma vb.</div>
            {teacherError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{teacherError}</div>}
            <button className="btn btn-primary" onClick={handleTeacherApply} disabled={loading}
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Başvuruyu Gönder →'}
            </button>
            <button onClick={() => router.push('/teacher')} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text3)', marginTop: '8px' }}>
              Daha sonra tamamla →
            </button>
          </div>
        </div>
      </main>
    )
  }

  // phase === 'fallback-form' — localStorage'da pending veri bulunamadı
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>Hesabın onaylandı!</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
            Kayıt bilgilerini bu cihazda bulamadık (farklı bir cihaz/tarayıcıdan onaylamış olabilirsin) — profilini tamamlamak için birkaç bilgi daha alalım.
          </p>
        </div>
        <div className="card">
          <label className="field-label">Ad Soyad *</label>
          <input className="input" value={fbName} onChange={e => setFbName(e.target.value)} placeholder="Ahmet Yılmaz" />

          {fbRole === 'student' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="field-label">Yaş *</label>
                  <input className="input" type="number" value={fbAge} onChange={e => setFbAge(e.target.value)} placeholder="16" />
                </div>
                <div>
                  <label className="field-label">Sınıf *</label>
                  <select className="input" value={fbGrade} onChange={e => setFbGrade(e.target.value)} style={{ cursor: 'pointer' }}>
                    <option value="">Seç...</option>
                    {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Kurum kodu — okul adı BURADAN otomatik gelir, elle yazılmaz */}
              <div style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(217,119,6,0.04)', border: '1.5px solid rgba(217,119,6,0.15)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', marginBottom: '6px' }}>🏛️ Kurum Kodu (Opsiyonel)</div>
                <input className="input" placeholder="8 haneli kurum kodu"
                  value={fbInstitutionCode}
                  onChange={async e => {
                    const val = e.target.value.toUpperCase()
                    setFbInstitutionCode(val)
                    await verifyFbInstitutionCode(val)
                  }}
                />
                {fbInstitutionName && (
                  <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600, marginTop: '4px' }}>
                    ✓ {fbInstitutionName} kurumuna bağlanıyor
                  </div>
                )}
              </div>

              {/* Okul adı + sınıf numarası: SADECE kurum kodu doğrulandığında
                  görünür ve zorunludur. */}
              {fbInstitutionName && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div>
                    <label className="field-label">Okul Adı</label>
                    <input className="input" value={fbInstitutionName} readOnly disabled
                      style={{ background: 'var(--bg2)', color: 'var(--text2)', cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label className="field-label">Sınıf Numarası *</label>
                    <input className="input" value={fbClassNumber} onChange={e => setFbClassNumber(e.target.value)} placeholder="Örn: 14" />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                <div>
                  <label className="field-label">Veli E-postası (Opsiyonel)</label>
                  <input className="input" type="email" value={fbParentEmail} onChange={e => setFbParentEmail(e.target.value)} placeholder="veli@mail.com" />
                </div>
                <div>
                  <label className="field-label">Telefon (Opsiyonel)</label>
                  <input className="input" type="tel" value={fbPhone} onChange={e => setFbPhone(e.target.value)} placeholder="05xx xxx xx xx" />
                </div>
              </div>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginTop: '10px', marginBottom: '8px' }}>
            <input type="checkbox" checked={fbKvkkAydinlatma} onChange={e => setFbKvkkAydinlatma(e.target.checked)} style={{ marginTop: '2px' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              <a href="/kvkk/aydinlatma" target="_blank" style={{ color: 'var(--accent)', fontWeight: 600 }}>KVKK Aydınlatma Metni</a>'ni okudum.
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}>
            <input type="checkbox" checked={fbKvkkAcikRiza} onChange={e => setFbKvkkAcikRiza(e.target.checked)} style={{ marginTop: '2px' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
              Performans verilerimin yapay zeka destekli analiz için işlenmesine <a href="/kvkk/acik-riza" target="_blank" style={{ color: 'var(--accent)', fontWeight: 600 }}>açık rıza</a> veriyorum.
            </span>
          </label>
          {fbRole === 'student' && fbAge && parseInt(fbAge) < 18 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '1rem', padding: '10px', borderRadius: '10px', background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <input type="checkbox" checked={fbVeliOnayi} onChange={e => setFbVeliOnayi(e.target.checked)} style={{ marginTop: '2px' }} />
              <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                <b>18 yaşından küçüğüm:</b> velimin/vasimin bilgisi ve onayı vardır.
              </span>
            </label>
          )}

          {fbRole === 'teacher' && (
            <>
              <label className="field-label">Okul / Kurum *</label>
              <input className="input" value={fbSchool} onChange={e => setFbSchool(e.target.value)} placeholder="Ankara Anadolu Lisesi" />
            </>
          )}

          {fbError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{fbError}</div>}

          <button className="btn btn-primary" onClick={handleFallbackSubmit} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Kaydı Tamamla →'}
          </button>
        </div>
      </div>
    </main>
  )
}
