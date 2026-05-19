'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GRADES = [
  'ilkokul 1. sinif','ilkokul 2. sinif','ilkokul 3. sinif','ilkokul 4. sinif',
  'ortaokul 5. sinif','ortaokul 6. sinif','ortaokul 7. sinif','ortaokul 8. sinif',
  'lise 9. sinif','lise 10. sinif','lise 11. sinif','lise 12. sinif',
  'universite 1. sinif','universite 2. sinif','universite 3. sinif','universite 4. sinif',
]

const GRADE_LABELS: Record<string, string> = {
  'ilkokul 1. sinif': 'İlkokul 1. Sınıf',
  'ilkokul 2. sinif': 'İlkokul 2. Sınıf',
  'ilkokul 3. sinif': 'İlkokul 3. Sınıf',
  'ilkokul 4. sinif': 'İlkokul 4. Sınıf',
  'ortaokul 5. sinif': 'Ortaokul 5. Sınıf',
  'ortaokul 6. sinif': 'Ortaokul 6. Sınıf',
  'ortaokul 7. sinif': 'Ortaokul 7. Sınıf',
  'ortaokul 8. sinif': 'Ortaokul 8. Sınıf',
  'lise 9. sinif': 'Lise 9. Sınıf',
  'lise 10. sinif': 'Lise 10. Sınıf',
  'lise 11. sinif': 'Lise 11. Sınıf',
  'lise 12. sinif': 'Lise 12. Sınıf',
  'universite 1. sinif': 'Üniversite 1. Sınıf',
  'universite 2. sinif': 'Üniversite 2. Sınıf',
  'universite 3. sinif': 'Üniversite 3. Sınıf',
  'universite 4. sinif': 'Üniversite 4. Sınıf',
}

const LANGS = ['Türkçe','English','Deutsch','Français','Español']

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

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const profileData = {
      name: (user.user_metadata?.name as string) || 'Kullanici',
      age: parseInt(age),
      gender: gender,
      grade: grade,
      school: school || null,
      language: lang,
    }

    // Use raw query to avoid type conflicts
    const { error: err } = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...profileData })

    setLoading(false)
    if (err) { setError(err.message); return }
    router.push('/quiz')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div className="glow-blob" style={{ top: '-100px', right: '-100px' }} />
      <div style={{ width: '100%', maxWidth: '480px', position: 'relative', zIndex: 1 }}>
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
                <option value="kiz">Kız</option>
                <option value="belirtmek istemiyorum">Belirtmek istemiyorum</option>
              </select>
            </div>
          </div>

          <label className="field-label">Sınıf / eğitim seviyesi</label>
          <select className="input" value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="">Seç</option>
            {GRADES.map(g => (
              <option key={g} value={g}>{GRADE_LABELS[g] || g}</option>
            ))}
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
