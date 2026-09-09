'use client'
import { useState } from 'react'

interface Item { id: string; subject: string; topic: string; label: string; source_type: string; evidence_count: number; review_note: string | null }
interface CanonicalItem { id: string; subject: string; topic: string; label: string; evidence_count: number }

function sourceLabel(sourceType: string): string {
  if (sourceType === 'ai_distractor') return 'AI tarafından önerildi'
  return sourceType.replaceAll('_', ' ')
}

export default function MisconceptionReview() {
  const [items, setItems] = useState<Item[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [canonicalItems, setCanonicalItems] = useState<CanonicalItem[]>([])
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/misconceptions?status=candidate')
    const result = await response.json()
    if (response.ok) { setItems(result.items || []); setCanonicalItems(result.canonicalItems || []) }
    else setMessage(`❌ ${result.error || 'Adaylar yüklenemedi.'}`)
    setBusy(false)
  }

  async function merge(aliasId: string) {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/misconceptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliasId, canonicalId: targets[aliasId], reason: notes[aliasId] || '' }),
    })
    const result = await response.json()
    if (response.ok) setItems(current => current.filter(item => item.id !== aliasId))
    else setMessage(`❌ ${result.error || 'Birleştirme yapılamadı.'}`)
    setBusy(false)
  }

  async function decide(id: string, decision: 'verified' | 'rejected') {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/misconceptions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, decision, note: notes[id] || '' }),
    })
    const result = await response.json()
    if (response.ok) setItems(current => current.filter(item => item.id !== id))
    else setMessage(`❌ ${result.error || 'Karar kaydedilemedi.'}`)
    setBusy(false)
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🧠 Kavram Yanılgısı Uzman İncelemesi</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>AI tarafından önerilen yanılgılar, öğrenci profillerinde güvenilir bilgi olarak kullanılmadan önce burada doğrulanır.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'İşleniyor…' : 'Bekleyen adayları yükle'}</button>
    {message && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{message}</div>}
    <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      {items.map(item => <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
        <strong style={{ fontSize: 13 }}>{item.label}</strong>
        <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 3 }}>{item.subject} → {item.topic} · {item.evidence_count} kanıt · {sourceLabel(item.source_type)}</div>
        <input value={notes[item.id] || ''} onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))}
          placeholder="Uzman notu; reddedilecekse gerekçe zorunlu" style={{ width: '100%', marginTop: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg2)' }} />
        <select value={targets[item.id] || ''} onChange={event => setTargets(current => ({ ...current, [item.id]: event.target.value }))}
          style={{ width: '100%', marginTop: 7, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg2)' }}>
          <option value="">Kanonik yanılgı seç (isteğe bağlı)</option>
          {canonicalItems.filter(target => target.id !== item.id && target.subject === item.subject)
            .map(target => <option key={target.id} value={target.id}>{target.topic} → {target.label} ({target.evidence_count})</option>)}
        </select>
        <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
          <button className="btn btn-sm" disabled={busy} onClick={() => decide(item.id, 'verified')}>✓ Doğrula</button>
          <button className="btn btn-sm" disabled={busy || !targets[item.id] || (notes[item.id] || '').trim().length < 3} onClick={() => merge(item.id)}>↪ Kanoniğe birleştir</button>
          <button className="btn btn-sm" disabled={busy} onClick={() => decide(item.id, 'rejected')} style={{ color: '#dc2626' }}>✕ Reddet</button>
        </div>
      </div>)}
      {!busy && items.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12 }}>Bekleyen adayları görmek için listeyi yükleyin.</div>}
    </div>
  </div>
}
