// app/admin/ai-quality-test/page.tsx
//
// 21 Eylül 2026 — Deniz'in isteğiyle: önceki /admin/mistral-test sayfasının
// genelleştirilmiş hali. Artık üç sağlayıcıdan (Mistral / GPT-4.1-mini /
// Claude Sonnet) herhangi birini, gerçek öğrenci trafiğine HİÇ dokunmadan,
// aynı konu/sınıf/soru sayısıyla zorlayıp yan yana karşılaştırabiliyor.
// /api/generate-quiz'e body.forceProvider:'mistral'|'openai'|'claude'
// göndererek üretimi kova/yüzdeden bağımsız olarak o sağlayıcıya zorluyor —
// bu, sunucu tarafında SADECE profiles.is_admin=true olan hesap için
// etkilidir (route.ts içinde ayrıca doğrulanıyor). Route.ts'teki normal akış
// değişmediği için bu da normal bir test gibi quiz_sessions'a kaydolur ve
// admin hesabının kendi test kotasını kullanır (premium/unlimited planda
// sorun olmaz) — sadece gen_engine='<provider>-admin-test' olarak ayrı
// etiketlenir, gerçek A/B istatistiklerine karışmaz.
//
// Kalite/maliyet/hız karşılaştırması için gerçek token+süre+maliyet verisi
// ai_usage_logs tablosunda kalıyor (bkz. lib/ai-usage.ts, lib/openai.ts —
// artık OpenAI çağrıları da durationMs ölçüyor, Claude çağrısı da route.ts
// içinde ölçülüp logAnthropicUsage'a geçiriliyor). Bu sayfa sadece gözle
// kalite kontrolü + kabaca istemci-taraflı süre için; kesin token/maliyet/
// süre karşılaştırması Supabase'deki ai_usage_logs'tan yapılmalı.
//
// Önceki bulgu (21 Eylül): Mistral bazen kısa/eksik bir yanıt dönüp sistem
// sessizce soru bankası fallback'ine düşüyordu — admin bunu fark edemiyordu.
// Bunu önlemek için backend artık forced-test isteklerinde
// debugGenEngine/debugBankFallback alanlarını dönüyor; bu sayfa bunları
// açıkça gösteriyor.
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GRADE_OPTIONS = [
  'ortaokul 6. sinif', 'ortaokul 7. sinif', 'ortaokul 8. sinif',
  'lise 9. sinif', 'lise 10. sinif', 'lise 11. sinif', 'lise 12. sinif',
]

const PROVIDERS = [
  { id: 'mistral', label: 'Mistral Large', color: '#f97316' },
  { id: 'openai', label: 'GPT-4.1-mini', color: '#16a34a' },
  { id: 'claude', label: 'Claude Sonnet', color: '#6366f1' },
] as const

type ProviderId = typeof PROVIDERS[number]['id']

type RunResult = {
  provider: ProviderId
  loading: boolean
  error: string | null
  data: any | null
  clientMs: number | null
}

export default function AIQualityTestPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [subject, setSubject] = useState('Matematik')
  const [topic, setTopic] = useState('Mutlak değer')
  const [grade, setGrade] = useState('lise 9. sinif')
  const [questionCount, setQuestionCount] = useState(5)
  const [runs, setRuns] = useState<Record<ProviderId, RunResult>>({
    mistral: { provider: 'mistral', loading: false, error: null, data: null, clientMs: null },
    openai: { provider: 'openai', loading: false, error: null, data: null, clientMs: null },
    claude: { provider: 'claude', loading: false, error: null, data: null, clientMs: null },
  })

  async function runOne(provider: ProviderId) {
    setRuns(prev => ({ ...prev, [provider]: { ...prev[provider], loading: true, error: null, data: null, clientMs: null } }))
    const startedAt = Date.now()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setRuns(prev => ({ ...prev, [provider]: { ...prev[provider], loading: false, error: 'Oturum bulunamadı — lütfen tekrar giriş yap.' } }))
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
          forceProvider: provider,
        }),
      })
      const clientMs = Date.now() - startedAt
      const data = await res.json()
      if (!res.ok) {
        setRuns(prev => ({ ...prev, [provider]: { ...prev[provider], loading: false, error: data?.message || data?.error || `İstek başarısız (${res.status})`, clientMs } }))
      } else {
        setRuns(prev => ({ ...prev, [provider]: { ...prev[provider], loading: false, data, clientMs } }))
      }
    } catch (e: any) {
      setRuns(prev => ({ ...prev, [provider]: { ...prev[provider], loading: false, error: e?.message || 'Beklenmeyen hata', clientMs: Date.now() - startedAt } }))
    }
  }

  async function runAll() {
    await Promise.all(PROVIDERS.map(p => runOne(p.id)))
  }

  const anyLoading = Object.values(runs).some(r => r.loading)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #082465, #1a3a7a)', padding: '2rem 1.5rem 1.5rem' }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0 }}>
          ← Admin paneli
        </button>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '24px', margin: 0 }}>🧪 AI Kalite Testi</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: 4 }}>
          Gerçek öğrenci trafiğini etkilemeden, Mistral / GPT-4.1-mini / Claude Sonnet'i aynı konuyla zorlayıp yan yana karşılaştır (yalnızca admin hesaplar).
        </p>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={runAll} disabled={anyLoading}
              style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#082465', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: anyLoading ? 0.5 : 1 }}>
              {anyLoading ? 'Üretiliyor...' : '🔀 Üçünü birden üret'}
            </button>
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => runOne(p.id)} disabled={anyLoading}
                style={{ padding: '10px 16px', borderRadius: '10px', border: `1.5px solid ${p.color}`, background: 'transparent', color: p.color, fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: anyLoading ? 0.5 : 1 }}>
                {p.label} ile üret
              </button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 10 }}>
            Not: Burada gösterilen süre yalnızca istemci-taraflı kaba bir ölçüm (ağ dahil). Kesin token/maliyet/sunucu-süresi karşılaştırması için Supabase <code>ai_usage_logs</code> tablosundaki <code>generate-quiz:admin-test-*</code> kayıtlarına bak.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          {PROVIDERS.map(p => {
            const run = runs[p.id]
            return (
              <div key={p.id} className="card" style={{ borderTop: `3px solid ${p.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: p.color }}>{p.label}</div>
                  {run.clientMs != null && (
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>⏱ {(run.clientMs / 1000).toFixed(1)}sn</div>
                  )}
                </div>

                {run.loading && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Üretiliyor... (30-60sn sürebilir)</div>}

                {run.error && (
                  <div style={{ fontSize: '12px', color: '#dc2626' }}>{run.error}</div>
                )}

                {run.data && (
                  <>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
                      {run.data.questions?.length || 0} soru · kaynak: {run.data.source}
                      {run.data.debugGenEngine && (
                        <>
                          {' · motor: '}
                          <strong style={{ color: run.data.debugBankFallback ? '#dc2626' : 'var(--text2)' }}>{run.data.debugGenEngine}</strong>
                        </>
                      )}
                    </div>
                    {run.data.debugBankFallback && (
                      <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '8px', padding: '6px 8px', background: 'rgba(220,38,38,0.08)', borderRadius: 6 }}>
                        ⚠️ Bu sonuç {p.label}'den değil, soru bankası fallback'inden geldi ({p.label} eksik/geçersiz yanıt verdi). Kalite değerlendirmesi için geçerli değil.
                      </div>
                    )}
                    <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
                      {(run.data.questions || []).map((q: any, i: number) => (
                        <div key={i} style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg2)', marginBottom: '8px' }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: 5, whiteSpace: 'pre-wrap' }}>{i + 1}. {q.q}</div>
                          {Array.isArray(q.opts) && (
                            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                              {q.opts.map((opt: string, oi: number) => (
                                <div key={oi} style={{ color: oi === q.ans ? '#16a34a' : 'var(--text2)', fontWeight: oi === q.ans ? 700 : 400 }}>
                                  {String.fromCharCode(65 + oi)}) {opt} {oi === q.ans ? '✓' : ''}
                                </div>
                              ))}
                            </div>
                          )}
                          {q.explanation && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: 5, fontStyle: 'italic' }}>{q.explanation}</div>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
