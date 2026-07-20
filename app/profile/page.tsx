'use client'
import { Suspense, useState, useEffect } from 'react'
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

function ProfileSetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const isSafeNext = (n: string | null) => !!n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [age, setAge] = useState('')
  const [grade, setGrade] = useState('')
  const [school, setSchool] = useState('')
  const [classNumber, setClassNumber] = useState('')
  const [institutionCode, setInstitutionCode] = useState('')
  const [institutionName, setInstitutionName] = useState('')
  const [phone, setPhone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [showOptional, setShowOptional] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1) // 1: ad/soyad, 2: sınıf/yaş
  const supabase = createClient() as any

  useEffect(() => {
    // Kullanıcı yoksa login'e
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (!user) router.push(isSafeNext(next) ? `/login?next=${encodeURIComponent(next!)}` : '/login')
      // Google'dan gelen isim varsa doldur
      if (user?.user_metadata?.full_name) {
        const parts = user.user_metadata.full_name.split(' ')
        setName(parts[0] || '')
        setSurname(parts.slice(1).join(' ') || '')
      } else if (user?.user_metadata?.name) {
        const parts = user.user_metadata.name.split(' ')
        setName(parts[0] || '')
        setSurname(parts.slice(1).join(' ') || '')
      }
    })
  }, [])

  async function handleSave() {
    if (!name.trim()) { setError('Ad zorunludur.'); return }
    if (!surname.trim()) { setError('Soyad zorunludur.'); return }
    if (!age || parseInt(age) < 5 || parseInt(age) > 35) { setError('Geçerli bir yaş girin (5-35).'); return }
    if (!grade) { setError('Sınıf / eğitim seviyesi zorunludur.'); return }
    if (!school.trim()) { setError('Okul adı zorunludur.'); return }
    if (!classNumber.trim()) { setError('Sınıf numarası zorunludur.'); return }

    setError(''); setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Oturum bulunamadı, lütfen tekrar giriş yapın.'); setLoading(false); router.push(isSafeNext(next) ? `/login?next=${encodeURIComponent(next!)}` : '/login'); return }

    // NOT: 'age' bilerek gönderilmiyor — profiles tablosunda böyle bir kolon
    // yok (şema: id, name, surname, grade, school, ... ). Yaş formda hâlâ
    // isteniyor ve doğrulanıyor (5-35 aralığı), ama veritabanına yazılmıyor.
    // İleride yaş bilgisini kalıcı saklamak istenirse önce Supabase'de
    // `age INTEGER` kolonu migration ile eklenmeli.
    // Ad-soyad ve telefon kimlik verisidir → TR-PG'ye yazılır (Supabase'e değil)
    const { data: { session } } = await supabase.auth.getSession()
    const idRes = await fetch('/api/profile/update-identity', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: `${name.trim()} ${surname.trim()}`, phone: phone || null, role: 'student' }),
    })
    if (!idRes.ok) {
      setError('Kimlik bilgileri kaydedilemedi. Lütfen tekrar deneyin.')
      setLoading(false)
      return
    }

    // Davranış/platform verisi Supabase'de kalır (kimlik alanları hariç)
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      grade,
      school: school.trim(),
      class_number: classNumber.trim(),
      language: 'Türkçe',
      instagram: instagram || null,
      tiktok: tiktok || null,
    })
    if (upsertError) {
      console.error('profiles upsert hatasi:', upsertError)
      setError('Profil kaydedilemedi: ' + upsertError.message)
      setLoading(false)
      return
    }

    // Kurum kodu işle
    if (institutionCode.trim()) {
      const { data: inst } = await supabase
        .from('institutions')
        .select('id, name')
        .eq('code', institutionCode.trim().toUpperCase())
        .eq('active', true)
        .maybeSingle()
      if (inst) {
        await supabase.from('institution_users').upsert({
          institution_id: inst.id,
          user_id: user.id,
          role: 'student',
        }, { onConflict: 'institution_id,user_id' })
      }
    }

    setLoading(false)
    router.push(isSafeNext(next) ? next! : '/quiz')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '64px' }} />
        </div>

        <div className="card anim-up">
          {/* İlerleme */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '4px', borderRadius: '99px', background: 'var(--accent)' }} />
            <div style={{ flex: 1, height: '4px', borderRadius: '99px', background: step >= 2 ? 'var(--accent)' : 'var(--border)' }} />
          </div>

          <h1 className="serif" style={{ fontSize: '20px', marginBottom: '4px' }}>
            {step === 1 ? 'Merhaba! 👋' : 'Eğitim bilgilerin'}
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.25rem' }}>
            {step === 1
              ? 'Sana nasıl hitap edelim?'
              : 'Sorular sınıfına göre kişiselleştirilecek.'}
          </p>

          {step === 1 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="field-label">Ad <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" placeholder="Deniz" value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="field-label">Soyad <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" placeholder="Yılmaz" value={surname} onChange={e => setSurname(e.target.value)} />
                </div>
              </div>

              {error && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}

              <button className="btn btn-primary" onClick={() => {
                if (!name.trim() || !surname.trim()) { setError('Ad ve soyad zorunludur.'); return }
                setError(''); setStep(2)
              }} style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                Devam et →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="field-label">Yaş <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" type="number" placeholder="16" min={5} max={35} value={age} onChange={e => setAge(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="field-label">Sınıf <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select className="input" value={grade} onChange={e => setGrade(e.target.value)}>
                    <option value="">Seç</option>
                    {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Okul Adı <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" placeholder="Örn: Atatürk Ortaokulu" value={school} onChange={e => setSchool(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Sınıf Numarası <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" placeholder="Örn: 14" value={classNumber} onChange={e => setClassNumber(e.target.value)} />
                </div>
              </div>

              {/* Kurum kodu */}
              <div style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(217,119,6,0.04)', border: '1.5px solid rgba(217,119,6,0.15)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', marginBottom: '6px' }}>🏛️ Kurum Kodu (Opsiyonel)</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', lineHeight: 1.5 }}>
                  Okulunuz Pratium ile anlaşmalıysa size verilen kodu girin.
                </div>
                <input className="input" placeholder="8 haneli kurum kodu"
                  value={institutionCode}
                  onChange={async e => {
                    const val = e.target.value.toUpperCase()
                    setInstitutionCode(val)
                    if (val.length === 8) {
                      const { data: inst } = await supabase.from('institutions').select('name').eq('code', val).eq('active', true).maybeSingle()
                      setInstitutionName(inst?.name || '')
                    } else setInstitutionName('')
                  }}
                />
                {institutionName && (
                  <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600, marginTop: '4px' }}>
                    ✓ {institutionName} kurumuna bağlanıyor
                  </div>
                )}
              </div>

              {/* Opsiyonel */}
              <button onClick={() => setShowOptional(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text2)', marginTop: '10px', padding: '4px 0', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px' }}>{showOptional ? '▲' : '▼'}</span>
                Telefon ve sosyal medya (opsiyonel)
              </button>

              {showOptional && (
                <div style={{ marginTop: '8px', padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <label className="field-label">Telefon</label>
                  <input className="input" type="tel" placeholder="+90 555 000 00 00" value={phone} onChange={e => setPhone(e.target.value)} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                    <div>
                      <label className="field-label">Instagram</label>
                      <input className="input" placeholder="@kullanici" value={instagram} onChange={e => setInstagram(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">TikTok</label>
                      <input className="input" placeholder="@kullanici" value={tiktok} onChange={e => setTiktok(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {error && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}

              <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
                <button className="btn" onClick={() => setStep(1)} style={{ justifyContent: 'center' }}>← Geri</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Başla ⚡'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ProfileSetupPage() {
  return (
    <Suspense fallback={null}>
      <ProfileSetupContent />
    </Suspense>
  )
}
