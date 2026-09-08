'use client'

import { useState } from 'react'

interface Summary { subject: string; action_type: string; graph_used: boolean; engine_version: string; sample_size: number; evaluated_count: number; avg_event_score_pct: number | null; avg_mastery_delta: number | null }
interface Recent { id: string; subject: string; topic: string; action_type: string; graph_used: boolean; graph_relation_version: number | null; baseline_mastery: number | null; post_mastery: number | null; mastery_delta: number | null; event_score_pct: number | null; event_count: number; applied_at: string }

export default function RecommendationImpact() {
  const [data, setData] = useState<{ summary: Summary[]; recent: Recent[] } | null>(null)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  async function load() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/recommendation-impact')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Etki raporu yüklenemedi.')
      setData(result)
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }
  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>📈 Learning Graph → Öneri Etki Ölçümü</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Graf destekli önerilerin uygulanma, test başarısı ve mastery değişimini karşılaştırır. Küçük örneklemler nedensel sonuç olarak yorumlanmaz.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Etki raporunu yükle'}</button>
    {message && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{message}</div>}
    {data && <div style={{ marginTop: 10, display: 'grid', gap: 9, fontSize: 11 }}>
      {data.summary.length === 0 && <div style={{ color: 'var(--text3)' }}>Henüz ölçülebilir öneri uygulaması yok. Yeni adaptif testler otomatik örneklem oluşturacak.</div>}
      {data.summary.map((row, index) => <div key={`${row.subject}-${row.action_type}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <strong>{row.subject} · {row.action_type}</strong> · {row.graph_used ? 'Graph kullanıldı' : 'Graph kullanılmadı'}
        <div style={{ color: 'var(--text3)', marginTop: 3 }}>Örneklem: {row.sample_size} · değerlendirilen: {row.evaluated_count} · test başarısı: {row.avg_event_score_pct ?? '—'} · mastery değişimi: {row.avg_mastery_delta ?? '—'}</div>
      </div>)}
      {data.recent.length > 0 && <div><strong>Son uygulamalar</strong>{data.recent.slice(0, 20).map(row => <div key={row.id} style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
        {row.subject} → {row.topic} · {row.graph_used ? `Graph v${row.graph_relation_version ?? '?'}` : 'Graph yok'} · test %{row.event_score_pct ?? '—'} · mastery {row.baseline_mastery ?? '—'} → {row.post_mastery ?? '—'}
      </div>)}</div>}
    </div>}
  </div>
}
