'use client'
// app/apply-teacher/page.tsx
//
// Zaten kayıtlı bir kullanıcının (örn. önce öğrenci olarak kaydolmuş biri)
// AYNI hesaptan öğretmenlik başvurusu yapabilmesi için. Supabase Auth'ta
// bir e-posta = bir hesap olduğundan, aynı adresle ikinci bir kayıt formu
// e-posta gönderemiyordu (zaten onaylı bir hesap için). Bu sayfa, yeni bir
// hesap açmadan, mevcut oturuma bağlı olarak `teachers` tablosuna kayıt
// ekliyor — `profiles.role` DEĞİŞTİRİLMİYOR (öğrenci deneyimi korunur),
// çünkü /teacher erişimi zaten `teachers` tablosundaki kayda bakıyor,
// profiles.role'e değil.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Phase = 'loading' | 'form' | 'pending' | 'approved' | 'done' | 'error'

export default function ApplyTeacherPage() {
  const router = useRouter()
  const supabase = createClient() as any

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [userId, setUserId] = useState('')

  const [school, setSchool] = useState('')
  const [subject, setSubject] = useState('')
  const [phone, setPhone] = useState('')
  const [docs, setDocs] = useState<File[]>([])
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (cancelled) return
      setUserId(user.id)

      const { data: existing } = await supabase
        .from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()

      if (cancelled) return
      if (existing) {
        setPhase(existing.approved ? 'approved' : 'pending')
      } else {
        setPhase('form')
      }
    }
    run().catch((e) => {
      console.error('[apply-teacher] beklenmeyen hata:', e)
      setErrorMsg('Bir sorun oluştu. Lütfen tekrar dene.')
      setPhase('error')
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    if (!school.trim()) { setFormError('Okul/Kurum zorunlu.'); return }
    setFormError(''); setLoading(true)
    try {
      const docUrls: string[] = []
      const uploadErrors: string[] = []
      for (let i = 0; i < docs.length; i++) {
        const file = docs[i]
        const ext = file.name.split('.').pop()
        const path = `teacher-docs/${userId}/${Date.now()}-${i}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('teacher-documents').upload(path, file, { upsert: true })
        if (uploadErr) {
          console.error('[apply-teacher] belge yukleme hatasi:', file.name, uploadErr)
          uploadErrors.push(file.name)
          continue
        }
        const { data: urlData } = supabase.storage.from('teacher-documents').getPublicUrl(path)
        docUrls.push(urlData.publicUrl)
      }
      // NOT: docs seçilmiş ama hepsi/bazısı yüklenemediyse başvuru yine de
      // devam eder (okul/branş bilgisiyle) — admin panelinde "Belge
      // yüklenmemiş" uyarısı zaten görünür, başvuru tamamen engellenmez.

      const { error: insertErr } = await supabase.from('teachers').insert({
        user_id: userId,
        school: school.trim(),
        subject: subject.trim(),
        document_url: docUrls[0] || null,
        document_urls: docUrls.length > 0 ? docUrls : null,
        approved: false,
      })
      if (insertErr) { setFormError('Başvuru gönderilemedi: ' + insertErr.message); return }

      if (phone.trim()) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/profile/update-identity', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone.trim(), role: 'teacher' }),
        }).catch(() => {})
      }

      setPhase('done')
    } catch (e: any) {
      console.error('[apply-teacher handleSubmit] beklenmeyen hata:', e)
      setFormError('Beklenmeyen bir hata oluştu. Lütfen tekrar dene.')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'loading') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="card" style={{ maxWidth: 440, textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⚠️</div>
          <p style={{ fontSize: '14px', color: 'var(--text2)' }}>{errorMsg}</p>
        </div>
      </main>
    )
  }

  if (phase === 'approved') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>🎓</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
              Zaten onaylı bir öğretmen hesabınız var!
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Bu hesapla öğretmen paneline erişebilirsin — öğrenci özelliklerin de aynen kalmaya devam ediyor.
            </p>
            <button onClick={() => router.push('/teacher')} className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              Öğretmen Paneline Git
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'pending') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>⏳</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
              Başvurunuz inceleniyor
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7 }}>
              Ekibimiz başvurunuzu inceliyor, onaylandığında e-posta ve bildirimle haberdar olacaksınız. Genellikle 1-2 iş günü sürer.
            </p>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
              Başvurunuz Alındı!
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Ekibimiz başvurunuzu inceleyecek ve e-posta ile bildirim gönderecek. Onay süreci genellikle 1-2 iş günü sürmektedir.
              Öğrenci hesabın bu süreçte olduğu gibi kullanılmaya devam edebilir.
            </p>
            <button onClick={() => router.push('/home')} className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}>
              Ana Sayfaya Dön
            </button>
          </div>
        </div>
      </main>
    )
  }

  // phase === 'form'
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎓</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>Öğretmenlik Başvurusu</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
            Mevcut hesabınla başvurabilirsin — öğrenci özelliklerin etkilenmez, admin onayından sonra öğretmen paneline de erişirsin.
          </p>
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
            📎 {docs.length > 0 ? `${docs.length} belge seçildi` : 'Belge seç (PDF, JPG — birden fazla seçebilirsin)'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: 'none' }}
              onChange={e => setDocs(Array.from(e.target.files || []))} />
          </label>
          {docs.length > 0 && (
            <ul style={{ margin: '0 0 8px', paddingLeft: '18px', fontSize: '12px', color: 'var(--text3)' }}>
              {docs.map((f, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span>{f.name}</span>
                  <button type="button" onClick={() => setDocs(docs.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>
                    Kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '1rem' }}>Öğretmenlik belgesi, diploma vb. — onay sürecini hızlandırır.</div>
          {formError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{formError}</div>}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Başvuruyu Gönder →'}
          </button>
        </div>
      </div>
    </main>
  )
}
