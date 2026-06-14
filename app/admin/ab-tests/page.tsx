// app/admin/ab-tests/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ABTestAdminPage() {
  const [tests, setTests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', controlLabel: 'Kontrol', treatmentLabel: 'Deney' })
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/ab', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const data = await res.json()
    if (res.ok) setTests(data.tests || [])
    setLoading(false)
  }

  async function createTest() {
    if (!form.name.trim()) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('ab_tests').insert({
      name: form.name.trim().toLowerCase().replace(/\s+/g, '_'),
      description: form.description,
      variants: [
        { id: 'control', label: form.controlLabel, weight: 50 },
        { id: 'treatment', label: form.treatmentLabel, weight: 50 },
      ],
      active: true,
    })
    setForm({ name: '', description: '', controlLabel: 'Kontrol', treatmentLabel: 'Deney' })
    setCreating(false)
    load()
  }

  async function toggleTest(id: string, active: boolean) {
    await supabase.from('ab_tests').update({ active: !active }).eq('id', id)
    load()
  }

  function pctBar(pct: number, color: string) {
    return (
      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden', marginTop: 4 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    )
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #082465, #1a3a7a)', padding: '2rem 1.5rem 1.5rem' }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0 }}>
          ← Admin paneli
        </button>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '24px', margin: 0 }}>🧪 A/B Testler</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: 4 }}>Feature flag + conversion tracking</p>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>

        {/* Yeni test oluştur */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>➕ Yeni Test Oluştur</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Test Adı (snake_case)</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="pricing_cta_button" className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Açıklama</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Pricing CTA butonundaki metin testi" className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Kontrol (A)</label>
              <input value={form.controlLabel} onChange={e => setForm(p => ({ ...p, controlLabel: e.target.value }))}
                className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Deney (B)</label>
              <input value={form.treatmentLabel} onChange={e => setForm(p => ({ ...p, treatmentLabel: e.target.value }))}
                className="input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
          <button onClick={createTest} disabled={creating || !form.name.trim()}
            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: creating || !form.name.trim() ? 0.5 : 1 }}>
            {creating ? 'Oluşturuluyor...' : 'Test Oluştur'}
          </button>
        </div>

        {/* Test listesi */}
        {tests.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
            Henüz A/B test yok.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tests.map((test: any) => (
              <div key={test.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ fontSize: '12px', background: 'var(--bg2)', padding: '2px 6px', borderRadius: 4 }}>{test.name}</code>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 99, background: test.active ? 'rgba(22,163,74,0.1)' : 'var(--bg2)', color: test.active ? '#16a34a' : 'var(--text3)', fontWeight: 600 }}>
                        {test.active ? '● Aktif' : '○ Pasif'}
                      </span>
                    </div>
                    {test.description && <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: 4 }}>{test.description}</div>}
                  </div>
                  <button onClick={() => toggleTest(test.id, test.active)}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {test.active ? 'Durdur' : 'Başlat'}
                  </button>
                </div>

                {/* Varyant sonuçları */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {test.variantResults?.map((v: any) => (
                    <div key={v.id} style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: `1.5px solid ${v.id === 'control' ? 'rgba(99,102,241,0.3)' : 'rgba(16,163,74,0.3)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: v.id === 'control' ? '#6366f1' : '#16a34a' }}>
                          {v.id === 'control' ? 'A — Kontrol' : 'B — Deney'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{v.weight}%</span>
                      </div>
                      {v.label && <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px', fontStyle: 'italic' }}>"{v.label}"</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                        <div><span style={{ color: 'var(--text3)' }}>Atanan:</span> <strong>{v.assignments}</strong></div>
                        <div><span style={{ color: 'var(--text3)' }}>Görüntü:</span> <strong>{v.views}</strong></div>
                        <div><span style={{ color: 'var(--text3)' }}>Tıklama:</span> <strong>{v.clicks}</strong></div>
                        <div><span style={{ color: 'var(--text3)' }}>Dönüşüm:</span> <strong style={{ color: '#16a34a' }}>{v.conversions}</strong></div>
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: 'var(--text3)' }}>Conversion Rate</span>
                          <strong style={{ color: v.convRate > 0 ? '#16a34a' : 'var(--text3)' }}>%{v.convRate}</strong>
                        </div>
                        {pctBar(v.convRate, v.id === 'control' ? '#6366f1' : '#16a34a')}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Uplift */}
                {test.uplift !== null && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: parseFloat(test.uplift) > 0 ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${parseFloat(test.uplift) > 0 ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`, fontSize: '12px', fontWeight: 700, color: parseFloat(test.uplift) > 0 ? '#16a34a' : '#dc2626', textAlign: 'center' }}>
                    {parseFloat(test.uplift) > 0 ? '📈' : '📉'} Deney varyantı {Math.abs(parseFloat(test.uplift))}% {parseFloat(test.uplift) > 0 ? 'daha iyi' : 'daha kötü'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
