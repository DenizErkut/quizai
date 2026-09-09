'use client'

import { useMemo, useState } from 'react'

interface Node { id: string; label: string; node_type: string; subject: string | null; grade: string | null }
interface Version { id: string; code: string; title: string; status: string }
interface Package { id: string; name: string; subject: string; grade: string; curriculum_version_id: string; source_reference: string; status: string }
interface Item { id: string; package_id: string; source_node_id: string; target_node_id: string; confidence: number; rationale: string; review_status: string; review_note: string | null }
interface Data { packages: Package[]; items: Item[]; nodes: Node[]; versions: Version[] }

export default function LearningGraphPrerequisitePackages() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', curriculumVersionId: '', sourceReference: '', sourceNodeId: '', targetNodeId: '', confidence: '0.85', rationale: '' })

  async function load() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/learning-graph-prerequisite-packages')
    const result = await response.json()
    if (response.ok) setData(result); else setMessage(`❌ ${result.error || 'Paketler yüklenemedi.'}`)
    setBusy(false)
  }
  const nodeMap = useMemo(() => new Map((data?.nodes || []).map(node => [node.id, node])), [data])
  const selectedSource = nodeMap.get(form.sourceNodeId)
  const compatibleTargets = (data?.nodes || []).filter(node => node.id !== form.sourceNodeId
    && (!selectedSource || (node.subject === selectedSource.subject && node.grade === selectedSource.grade)))

  async function act(body: Record<string, unknown>) {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/learning-graph-prerequisite-packages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const result = await response.json()
    setMessage(response.ok ? '✅ İşlem tamamlandı.' : `❌ ${result.error || 'İşlem tamamlanamadı.'}`)
    if (response.ok) { setForm({ name: '', curriculumVersionId: '', sourceReference: '', sourceNodeId: '', targetNodeId: '', confidence: '0.85', rationale: '' }); await load() }
    setBusy(false)
  }

  function create() {
    if (!selectedSource || !form.targetNodeId || !form.curriculumVersionId || !form.name.trim() || !form.sourceReference.trim() || !form.rationale.trim()) {
      setMessage('❌ Tüm paket ve bağlantı alanlarını doldurun.'); return
    }
    void act({ action: 'create', ...form, subject: selectedSource.subject, grade: selectedSource.grade })
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🧩 Uzman Ön Koşul Paketleri</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Ön koşul ilişkileri önce taslak pakete girer; satır bazında onaylanır, döngü kontrolünden sonra yayımlanır.</div>
    {!data && <button className="btn btn-sm" disabled={busy} onClick={() => void load()}>{busy ? 'Yükleniyor…' : 'Paketleri ve konuları yükle'}</button>}
    {data && <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
      <input className="input" placeholder="Paket adı" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <select className="input" value={form.curriculumVersionId} onChange={e => setForm({ ...form, curriculumVersionId: e.target.value })}><option value="">Müfredat sürümü</option>{data?.versions.map(v => <option key={v.id} value={v.id}>{v.code} · {v.status}</option>)}</select>
      <input className="input" placeholder="Kaynak / belge referansı" value={form.sourceReference} onChange={e => setForm({ ...form, sourceReference: e.target.value })} />
      <select className="input" value={form.sourceNodeId} onChange={e => setForm({ ...form, sourceNodeId: e.target.value, targetNodeId: '' })}><option value="">Ön koşul konu/kazanım</option>{data?.nodes.map(n => <option key={n.id} value={n.id}>{n.label} · {n.grade}</option>)}</select>
      <select className="input" value={form.targetNodeId} onChange={e => setForm({ ...form, targetNodeId: e.target.value })}><option value="">Hedef konu/kazanım</option>{compatibleTargets.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
      <input className="input" type="number" min="0" max="1" step="0.05" value={form.confidence} onChange={e => setForm({ ...form, confidence: e.target.value })} />
    </div>
    <textarea className="input" style={{ marginTop: 8, width: '100%' }} placeholder="Pedagojik gerekçe" value={form.rationale} onChange={e => setForm({ ...form, rationale: e.target.value })} />
    <button className="btn btn-sm" disabled={busy} onClick={create}>{busy ? 'İşleniyor…' : 'İnceleme paketi oluştur'}</button>
    {message && <div style={{ marginTop: 8, fontSize: 12 }}>{message}</div>}
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{data?.packages.map(pkg => {
      const items = data.items.filter(item => item.package_id === pkg.id)
      return <div key={pkg.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12 }}>
        <strong>{pkg.name}</strong> · {pkg.status}<div style={{ color: 'var(--text3)' }}>{pkg.subject} · {pkg.grade} · {pkg.source_reference}</div>
        {items.map(item => <div key={item.id} style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--border)' }}>
          <div>{nodeMap.get(item.source_node_id)?.label} → {nodeMap.get(item.target_node_id)?.label} · güven {item.confidence} · {item.review_status}</div>
          <div style={{ color: 'var(--text3)' }}>{item.rationale}</div>
          {item.review_status !== 'published' && <div style={{ display: 'flex', gap: 6, marginTop: 5 }}><button className="btn btn-sm" disabled={busy} onClick={() => void act({ action: 'review', itemId: item.id, decision: 'approved' })}>Onayla</button><button className="btn btn-sm" disabled={busy} onClick={() => { const note = window.prompt('Ret gerekçesi (zorunlu)'); if (note) void act({ action: 'review', itemId: item.id, decision: 'rejected', reviewNote: note }) }}>Reddet</button></div>}
        </div>)}
        {pkg.status === 'ready' && <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => void act({ action: 'publish', packageId: pkg.id })}>Döngü kontrolüyle yayımla</button>}
      </div>
    })}</div>
    </>}
  </div>
}
