'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

const LANGS = ['Türkçe', 'English', 'Deutsch', 'Français', 'Español']

export default function ProfilePage() {
  const router = useRouter()
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [grade, setGrade] = useState('')
  const [school, setSchool] = useState('')
  const [lang, setLang] = useState('Türkçe')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!age || !gender || !grade) {
      setError('Yaş, cinsiyet ve sınıf zorunlu.')
      return
    }
    setError('')
    setLoading(true)

    const supabase = createClient() as any
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error: err } = await supabase.from('profiles').upsert({
      id: user.id,
      name: (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'Kullanici',
      age: parseInt(age),
      gender,
      grade,
      school: school || null,
      language: lang,
    })

    setLoading(false)
    if (err) { setError(err.message); return }
    router.push('/quiz')
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div className="anim-up" style={{ marginBottom: '1.5rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Adım 2 / 2</div>
          <h1 className="serif" style={{ fontSize: '30px', lineHeight: 1.2 }}>Profilini kur</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '0.5rem' }}>
            Bu bilgiler sana tam uygun sorular oluşturmamızı sağlar.
          </p>
        </div>

        <div className="card anim-up-1">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="field-label">Yaş</label>
              <input className="input" type="number" placeholder="12" min={5} max={30}
                value={age} onChange={e => setAge(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Cinsiyet</label>
              <select className="input" value={gender} onChange={e => setGender(e.target.value)}>
                <option value="">Seç</option>
                <option value="erkek">Erkek</option>
                <option value="kadin">Kadın</option>
                <option value="diger">Diğer</option>
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

          <label className="field-label">Dil tercihi</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            {LANGS.map(l => (
              <button key={l} className={`tag ${lang === l ? 'active' : ''}`}
                onClick={() => setLang(l)}>
                {l}
              </button>
            ))}
          </div>

          {error && (
            <div style={{
              marginTop: '12px', padding: '10px 12px',
              background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: '9px', fontSize: '13px', color: 'var(--red)',
            }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleSave} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}>
            {loading
              ? <span className="spinner" style={{ width: 18, height: 18 }} />
              : 'Kaydet ve devam et →'}
          </button>
        </div>
      </div>
    </main>
  )
}
