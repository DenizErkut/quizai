'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DepartmentSelect, { resolveDepartmentValue } from '@/components/DepartmentSelect'
import { useT } from '@/lib/i18n/I18nProvider'
import { languageFromLocale } from '@/lib/i18n/core'
import { safeNextPath } from '@/lib/safe-next'

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
  const { t, locale } = useT()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const isSafeNext = (n: string | null) => safeNextPath(n) !== null
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [age, setAge] = useState('')
  const [grade, setGrade] = useState('')
  const [department, setDepartment] = useState('')
  const [departmentOther, setDepartmentOther] = useState('')
  const [classNumber, setClassNumber] = useState('')
  const [institutionCode, setInstitutionCode] = useState('')
  const [institutionName, setInstitutionName] = useState('')
  const [phone, setPhone] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [instagram, setInstagram] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [showOptional, setShowOptional] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletionRequested, setDeletionRequested] = useState(false)
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
    if (!name.trim()) { setError(t('Ad zorunludur.')); return }
    if (!surname.trim()) { setError(t('Soyad zorunludur.')); return }
    if (!age || parseInt(age) < 5 || parseInt(age) > 35) { setError(t('Geçerli bir yaş girin (5-35).')); return }
    if (!grade) { setError(t('Sınıf / eğitim seviyesi zorunludur.')); return }
    const isUniversity = grade.toLowerCase().startsWith('universite')
    const resolvedDepartment = resolveDepartmentValue(department, departmentOther)
    if (isUniversity && !resolvedDepartment) { setError(t('Bölüm seçimi zorunludur.')); return }
    // Okul adı ve sınıf numarası SADECE kurum kodu üzerinden bağlanan
    // öğrenciler için zorunlu — okul adı kurum kaydından otomatik gelir.
    if (institutionName) {
      if (!classNumber.trim()) { setError(t('Sınıf numarası zorunludur.')); return }
    }

    setError(''); setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError(t('Oturum bulunamadı, lütfen tekrar giriş yapın.')); setLoading(false); router.push(isSafeNext(next) ? `/login?next=${encodeURIComponent(next!)}` : '/login'); return }

    // Ad-soyad, yaş ve telefon kimlik verisidir → TR-PG'ye yazılır (Supabase'e değil).
    // NOT: Daha önce 'age' burada bilerek gönderilmiyordu ("profiles'ta kolon
    // yok" gerekçesiyle) — ama yaş zaten Supabase'e değil TR-PG'ye gitmesi
    // gerekiyordu, bu route (update-identity) tam da bunun için var. O yüzden
    // Google ile kayıt olan kullanıcıların yaşı hiçbir zaman kaydedilmiyordu.
    const { data: { session } } = await supabase.auth.getSession()
    const idRes = await fetch('/api/profile/update-identity', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: `${name.trim()} ${surname.trim()}`,
        age: parseInt(age, 10),
        phone: phone || null,
        parentEmail: parentEmail || null,
        role: 'student',
      }),
    })
    if (!idRes.ok) {
      setError(t('Kimlik bilgileri kaydedilemedi. Lütfen tekrar deneyin.'))
      setLoading(false)
      return
    }

    // Behavior/platform verisi Supabase'de kalır (kimlik alanları hariç).
    // school SADECE kurum kodu doğrulandığında dolar (institutionName) —
    // elle yazılmış bir okul adı asla kabul edilmez.
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      grade,
      department: resolvedDepartment || null,
      school: institutionName || null,
      class_number: institutionName ? classNumber.trim() : null,
      language: languageFromLocale(locale),
      instagram: instagram || null,
      tiktok: tiktok || null,
    })
    if (upsertError) {
      console.error('profiles upsert hatasi:', upsertError)
      setError(t('Profil kaydedilemedi: ') + upsertError.message)
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
    router.push(isSafeNext(next) ? next! : '/home')
  }

  async function requestDeletion() {
    if (!window.confirm(t('Kaydınızın silinmesi için admin incelemesine talep göndermek istediğinize emin misiniz?'))) return
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/profile/data-request', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } })
    setDeletionRequested(response.ok || response.status === 409)
    if (!response.ok && response.status !== 409) setError(t('Silme talebi oluşturulamadı. Lütfen tekrar deneyin.'))
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
            {step === 1 ? t('Merhaba! 👋') : t('Eğitim bilgilerin')}
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.25rem' }}>
            {step === 1
              ? t('Sana nasıl hitap edelim?')
              : t('Sorular sınıfına göre kişiselleştirilecek.')}
          </p>

          {step === 1 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="field-label">{t('Ad')} <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" placeholder="Deniz" value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="field-label">{t('Soyad')} <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" placeholder="Yılmaz" value={surname} onChange={e => setSurname(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <button onClick={requestDeletion} className="btn" style={{ color: 'var(--red)', borderColor: 'rgba(220,38,38,0.35)' }} disabled={deletionRequested}>
                  {deletionRequested ? t('✓ Silme talebi oluşturuldu') : t('Kaydımı sil')}
                </button>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>{t('Bu işlem hemen silme yapmaz; talebiniz admin doğrulamasına gönderilir.')}</div>
              </div>

              {error && <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}

              <button className="btn btn-primary" onClick={() => {
                if (!name.trim() || !surname.trim()) { setError(t('Ad ve soyad zorunludur.')); return }
                setError(''); setStep(2)
              }} style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                {t('Devam et →')}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="field-label">{t('Yaş')} <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input className="input" type="number" placeholder="16" min={5} max={35} value={age} onChange={e => setAge(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="field-label">{t('Sınıf')} <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select className="input" value={grade} onChange={e => setGrade(e.target.value)}>
                    <option value="">{t('Seç')}</option>
                    {GRADES.map(g => <option key={g.value} value={g.value}>{t(g.label)}</option>)}
                  </select>
                </div>
              </div>

              {grade.toLowerCase().startsWith('universite') && (
                <div style={{ marginTop: '10px' }}>
                  <DepartmentSelect
                    value={department}
                    onChange={setDepartment}
                    otherValue={departmentOther}
                    onOtherChange={setDepartmentOther}
                  />
                </div>
              )}

              {/* Kurum kodu — okul adı BURADAN otomatik gelir, elle yazılmaz */}
              <div style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(217,119,6,0.04)', border: '1.5px solid rgba(217,119,6,0.15)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', marginBottom: '6px' }}>{t('🏛️ Kurum Kodu (Opsiyonel)')}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', lineHeight: 1.5 }}>
                  {t('Okulunuz Pratium ile anlaşmalıysa size verilen kodu girin — okul bilginiz otomatik eklenir.')}
                </div>
                <input className="input" placeholder={t('8 haneli kurum kodu')}
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
                    {t('✓ {name} kurumuna bağlanıyor', { name: institutionName })}
                  </div>
                )}
              </div>

              {/* Okul adı + sınıf numarası: SADECE kurum kodu doğrulandığında
                  görünür ve zorunludur. Okul adı kurum kaydından otomatik
                  gelir (salt okunur). İnternetten bireysel kayıtta sorulmaz. */}
              {institutionName && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div>
                    <label className="field-label">{t('Okul Adı')}</label>
                    <input className="input" value={institutionName} readOnly disabled
                      style={{ background: 'var(--bg2)', color: 'var(--text2)', cursor: 'not-allowed' }} />
                  </div>
                  <div>
                    <label className="field-label">{t('Sınıf Numarası')} <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input className="input" placeholder={t('Örn: 14')} value={classNumber} onChange={e => setClassNumber(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Opsiyonel */}
              <button onClick={() => setShowOptional(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text2)', marginTop: '10px', padding: '4px 0', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px' }}>{showOptional ? '▲' : '▼'}</span>
                {t('Veli e-postası, telefon ve sosyal medya (opsiyonel)')}
              </button>

              {showOptional && (
                <div style={{ marginTop: '8px', padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <label className="field-label">{t('Veli E-postası')}</label>
                  <input className="input" type="email" placeholder="veli@mail.com" value={parentEmail} onChange={e => setParentEmail(e.target.value)} />
                  <label className="field-label">{t('Telefon')}</label>
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
                <button className="btn" onClick={() => setStep(1)} style={{ justifyContent: 'center' }}>{t('← Geri')}</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : t('Başla ⚡')}
                </button>
              </div>
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <button onClick={requestDeletion} className="btn" style={{ color: 'var(--red)', borderColor: 'rgba(220,38,38,0.35)', width: '100%', justifyContent: 'center' }} disabled={deletionRequested}>
                  {deletionRequested ? t('✓ Silme talebi oluşturuldu') : t('Kaydımı sil')}
                </button>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>{t('Talep admin doğrulamasına gönderilir; hemen silme yapılmaz.')}</div>
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
