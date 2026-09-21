// app/admin/mistral-test/page.tsx
//
// 21 Eylül 2026 — Deniz'in isteğiyle: Mistral canlı pilotunun (bkz.
// lib/ai-gateway/, app/api/generate-quiz/route.ts) kalitesini gerçek
// öğrenci trafiğine HİÇ dokunmadan gözle kontrol edebilmesi için admin-only
// bir test sayfası. /api/generate-quiz'e body.forceMistralTest:true
// göndererek üretimi kova/yüzdeden bağımsız olarak Mistral'e zorluyor —
// bu, sunucu tarafında SADECE profiles.is_admin=true olan hesap için
// etkilidir (route.ts içinde ayrıca doğrulanıyor). Route.ts'teki normal
// akış değişmediği için bu da normal bir test gibi quiz_sessions'a
// kaydolur ve admin hesabının kendi test kotasını kullanır (premium/
// unlimited planda sorun olmaz) — sadece gen_engine='mistral-admin-test'
// olarak ayrı etiketlenir, gerçek A/B istatistiklerine karışmaz.
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GRADE_OPTIONS = [
  'ortaokul 6. sinif', 'ortaokul 7. sinif', 'ortaokul 8. sinif',
  'lise 9. sinif', 'lise 10. sinif', 'lise 11. sinif', 'lise 12. sinif',
]

export default function MistralTestPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [subject, setSubject] = useState('Matematik')
  const [topic, setTopic] = useState('Mutlak değer')
  const [grade, setGrade] = useState('lise 9. sinif')
  const [questionCount, setQuestionCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)

  async function runTest() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Oturum bulunamadı — lütfen tekrar giriş yap.')
        setLoading(false)
        return
      }
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          topic,
          subject,
          questionCount,
          difficulty: 'auto',
          questionType: 'multiple_choice',
          includeVisuals: false, // bütçeyi görsel üretimine harcamayalım — sadece soru kalitesi görülsün
          forceMistralTest: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.message || data?.error || `İstek başarısız (${res.status})`)
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e?.message || 'Beklenmeyen hata')
    }
    setLoading(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #082465, #1a3a7a)', padding: '2rem 1.5rem 1.5rem' }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0 }}>
          ← Admin paneli
        </button>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '24px', margin: 0 }}>🧪 Mistral Kalite Testi</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: 4 }}>
          Gerçek öğrenci trafiğini etkilemeden, tek seferlik Mistral üretimi (yalnızca admin hesaplar).
        </p>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Ders</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Sınıf</label>
              <select value={grade} onChange={e => setGrade(e.target.value)} className="input" style={{ width: '100%', boxSizing: 'border-box' }}>
                {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Konu</label>
              <input value={topic} onChange={e => setTopic(e.target.value)} className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Soru sayısı</label>
              <input type="number" min={1} max={10} value={questionCount} onChange={e => setQuestionCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          <button onClick={runTest} disabled={loading}
            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            {loading ? 'Üretiliyor... (30-60sn sürebilir)' : 'Mistral ile üret'}
          </button>
        </div>

        {error && (
          <div className="card" style={{ borderColor: 'rgba(220,38,38,0.3)', color: '#dc2626', marginBottom: '1.5rem' }}>
            {error}
            {error.includes('yetk') || error.includes('403') ? null : (
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 6 }}>
                Not: Bu sayfa yalnızca profiles.is_admin=true olan hesaplarda çalışır ve MISTRAL_API_KEY tanımlı olmalıdır.
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              Sonuç ({result.questions?.length || 0} soru, kaynak: {result.source})
            </div>
            {(result.questions || []).map((q: any, i: number) => (
              <div key={i} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg2)', marginBottom: '10px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: 6 }}>{i + 1}. {q.q}</div>
                {Array.isArray(q.opts) && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                    {q.opts.map((opt: string, oi: number) => (
                      <div key={oi} style={{ color: oi === q.ans ? '#16a34a' : 'var(--text2)', fontWeight: oi === q.ans ? 700 : 400 }}>
                        {String.fromCharCode(65 + oi)}) {opt} {oi === q.ans ? '✓' : ''}
                      </div>
                    ))}
                  </div>
                )}
                {q.explanation && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>{q.explanation}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
