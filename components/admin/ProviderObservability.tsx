'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Provider = {
  provider: string; calls: number; models: string[]; costUsd: number; costPerCallUsd: number | null
  p95DurationMs: number | null; pricingCoverage: number | null; observedSuccessRate: number | null
  qualitySample: number; topOperations: { operation: string; calls: number }[]
}
type Payload = {
  periodDays: number; totals: { calls: number; costUsd: number; inputTokens: number; outputTokens: number }
  providers: Provider[]
  routerShadow: { servedEngine: string; recommendedEngine: string; reason: string; calls: number }[]
  note: string
}

const names: Record<string, string> = { anthropic: 'Claude', openai: 'OpenAI', mistral: 'Mistral', google: 'Gemini' }

export default function ProviderObservability() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const response = await fetch('/api/admin/provider-observability', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (response.ok) setData(await response.json())
      else setError('Sağlayıcı ölçümleri alınamadı.')
    })()
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)', marginBottom: 16 }}>{error}</div>
  if (!data) return <div className="card" style={{ marginBottom: 16 }}>Sağlayıcı ölçümleri hazırlanıyor…</div>

  return <section className="card" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div><div className="badge badge-purple" style={{ marginBottom: 6 }}>AI Sağlayıcı Gözlemi</div><h2 className="serif" style={{ fontSize: 22 }}>Kalite, hız ve maliyet</h2></div>
      <div style={{ textAlign: 'right' }}><strong style={{ fontSize: 22 }}>${data.totals.costUsd.toFixed(4)}</strong><div style={{ fontSize: 11, color: 'var(--text3)' }}>{data.periodDays} gün · {data.totals.calls} çağrı</div></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
      {data.providers.map(provider => <article key={provider.provider} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{names[provider.provider] ?? provider.provider}</strong><strong>${provider.costUsd.toFixed(4)}</strong></div>
        <div style={{ fontSize: 11, color: 'var(--text3)', margin: '5px 0 10px' }}>{provider.models.join(', ') || 'Model belirtilmemiş'}</div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>Çağrı: <strong>{provider.calls}</strong><br />Çağrı maliyeti: <strong>{provider.costPerCallUsd == null ? '—' : `$${provider.costPerCallUsd.toFixed(6)}`}</strong><br />p95 süre: <strong>{provider.p95DurationMs == null ? '—' : `${(provider.p95DurationMs / 1000).toFixed(1)} sn`}</strong><br />Fiyat kapsaması: <strong>{provider.pricingCoverage == null ? '—' : `%${Math.round(provider.pricingCoverage * 100)}`}</strong><br />Teknik çağrı başarısı: <strong>{provider.observedSuccessRate == null ? 'Yeterli kanıt yok' : `%${Math.round(provider.observedSuccessRate * 100)} (${provider.qualitySample})`}</strong></div>
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>{provider.topOperations.map(operation => `${operation.operation}: ${operation.calls}`).join(' · ')}</div>
      </article>)}
    </div>
    <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
      <strong>Intelligence Router · gölge modu</strong>
      <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 8px' }}>Bu öneriler üretimdeki sağlayıcıyı değiştirmez. Eğitim kalitesi Education Eval benchmark’ı etkinleşince ayrıca ölçülecek.</div>
      {data.routerShadow.length === 0 ? <div style={{ fontSize: 12 }}>Henüz gölge modu ölçümü yok; yeni ölçümler geldikçe burada görünecek.</div> : <div style={{ display: 'grid', gap: 6 }}>
        {data.routerShadow.map((item, index) => <div key={`${item.servedEngine}-${item.recommendedEngine}-${item.reason}-${index}`} style={{ fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          Canlıda <strong>{item.servedEngine}</strong> kullanıldı; ölçümlü router <strong>{item.recommendedEngine}</strong> önerdi · {item.reason} · {item.calls} çağrı
        </div>)}
      </div>}
    </div>
    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 12 }}>{data.note}</div>
  </section>
}
