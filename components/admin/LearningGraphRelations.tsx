'use client'

import { useState } from 'react'

interface Edge { id: string; source_node_id: string; target_node_id: string; edge_type: string; confidence: number | null; rationale: string | null; source_type: string; is_verified: boolean; reviewed_by: string | null; curriculum_version_id: string | null; relation_version: number; updated_at: string }
interface Node { id: string; label: string; node_type: string; subject: string | null; grade: string | null }
interface Reviewer { id: string; name: string }
interface Version { id: string; code: string; title: string; status: string }
interface History { id: number; edge_id: string; relation_version: number; change_type: string; changed_at: string }

export default function LearningGraphRelations() {
  const [data, setData] = useState<{ edges: Edge[]; nodes: Node[]; reviewers: Reviewer[]; versions: Version[]; history: History[] } | null>(null)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-graph-relations?limit=100')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Bağlantı geçmişi yüklenemedi.')
      setData(result)
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  const nodeMap = new Map((data?.nodes || []).map(node => [node.id, node]))
  const reviewerMap = new Map((data?.reviewers || []).map(reviewer => [reviewer.id, reviewer.name]))
  const versionMap = new Map((data?.versions || []).map(version => [version.id, version.code]))
  const historyCount = new Map<string, number>()
  for (const item of data?.history || []) historyCount.set(item.edge_id, (historyCount.get(item.edge_id) || 0) + 1)

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🔎 Graph Bağlantı Kaynağı ve Sürüm Geçmişi</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Bağlantının kaynağını, güvenini, inceleyen kişiyi, müfredat sürümünü ve değişiklik geçmişini gösterir.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Yükleniyor…' : 'Bağlantıları yükle'}</button>
    {message && <div style={{ color: '#dc2626', marginTop: 8, fontSize: 12 }}>{message}</div>}
    {data && <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
      <div style={{ fontSize: 12 }}><strong>{data.edges.length}</strong> bağlantı gösteriliyor · <strong>{data.history.length}</strong> geçmiş kaydı</div>
      {data.edges.map(edge => {
        const source = nodeMap.get(edge.source_node_id); const target = nodeMap.get(edge.target_node_id)
        return <div key={edge.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9, fontSize: 11 }}>
          <div><strong>{source?.label || 'Bilinmeyen düğüm'}</strong> → <strong>{target?.label || 'Bilinmeyen düğüm'}</strong></div>
          <div style={{ color: 'var(--text3)', marginTop: 3 }}>
            {edge.edge_type} · kaynak: {edge.source_type} · güven: {edge.confidence ?? '—'} · {edge.is_verified ? 'doğrulanmış' : 'taslak'}
          </div>
          <div style={{ color: 'var(--text3)', marginTop: 2 }}>
            sürüm: {versionMap.get(edge.curriculum_version_id || '') || 'sürüm bağımsız'} · ilişki v{edge.relation_version} · geçmiş: {historyCount.get(edge.id) || 0} kayıt · inceleyen: {reviewerMap.get(edge.reviewed_by || '') || 'kayıt yok'}
          </div>
          {edge.rationale && <div style={{ marginTop: 3 }}>Gerekçe: {edge.rationale}</div>}
        </div>
      })}
    </div>}
  </div>
}
