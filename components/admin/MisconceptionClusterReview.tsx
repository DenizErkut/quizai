'use client'
import { useState } from 'react'

interface Proposal {
  id: string; subject: string; topic: string; canonical_label: string; rationale: string | null
  members: { id: string; label: string }[]
}

export default function MisconceptionClusterReview() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [dropped, setDropped] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/misconception-clusters')
    const result = await response.json()
    if (response.ok) setProposals(result.proposals || [])
    else setMessage(`❌ ${result.error || 'Öneriler yüklenemedi.'}`)
    setBusy(false)
  }

  async function generate() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/misconception-clusters', { method: 'POST' })
    const result = await response.json()
    setMessage(response.ok ? `${result.groupsAnalyzed} grup incelendi, ${result.proposalsCreated} öneri oluşturuldu${result.failures?.length ? ` (${result.failures.length} hata)` : ''}.` : `❌ ${result.error}`)
    setBusy(false)
    if (response.ok) void load()
  }

  async function decide(proposal: Proposal, decision: 'approve' | 'reject') {
    setBusy(true); setMessage('')
    const memberIds = proposal.members.map(member => member.id).filter(id => !(dropped[proposal.id] || []).includes(id))
    const response = await fetch('/api/admin/misconception-clusters', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proposal.id, decision, note: notes[proposal.id] || '', canonicalLabel: labels[proposal.id] ?? proposal.canonical_label, memberIds }),
    })
    const result = await response.json()
    if (response.ok) setProposals(current => current.filter(item => item.id !== proposal.id))
    else setMessage(`❌ ${result.error || 'Karar kaydedilemedi.'}`)
    setBusy(false)
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🧩 Yanılgı Kümeleme Önerileri</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Aynı öğrenci ve konuda, aynı hatayı anlatan ≥3 etiket önerilir. Onayladığında tek kanonik yanılgıda birleşir ve kanıtlar toplanır; onaylamadan hiçbir şey değişmez.</div>
    <div style={{ display: 'flex', gap: 7 }}>
      <button className="btn btn-sm" disabled={busy} onClick={generate}>{busy ? 'İşleniyor…' : 'Yeni öneri üret'}</button>
      <button className="btn btn-sm" disabled={busy} onClick={load}>Bekleyenleri yükle</button>
    </div>
    {message && <div style={{ fontSize: 12, marginTop: 8 }}>{message}</div>}
    <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      {proposals.map(proposal => {
        const kept = proposal.members.filter(member => !(dropped[proposal.id] || []).includes(member.id))
        return <div key={proposal.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
          <div style={{ color: 'var(--text3)', fontSize: 11 }}>{proposal.subject} → {proposal.topic}</div>
          <input value={labels[proposal.id] ?? proposal.canonical_label} onChange={event => setLabels(current => ({ ...current, [proposal.id]: event.target.value }))}
            style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg2)', fontWeight: 600 }} />
          {proposal.rationale && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5 }}>Model gerekçesi: {proposal.rationale}</div>}
          <div style={{ marginTop: 7, display: 'grid', gap: 4 }}>
            {proposal.members.map(member => <label key={member.id} style={{ fontSize: 12, display: 'flex', gap: 6 }}>
              <input type="checkbox" checked={!(dropped[proposal.id] || []).includes(member.id)} onChange={event => setDropped(current => ({
                ...current, [proposal.id]: event.target.checked ? (current[proposal.id] || []).filter(id => id !== member.id) : [...(current[proposal.id] || []), member.id] }))} />
              {member.label}
            </label>)}
          </div>
          <input value={notes[proposal.id] || ''} onChange={event => setNotes(current => ({ ...current, [proposal.id]: event.target.value }))}
            placeholder="Uzman gerekçesi (en az 10 karakter)" style={{ width: '100%', marginTop: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg2)' }} />
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            <button className="btn btn-sm" disabled={busy || kept.length < 3 || (notes[proposal.id] || '').trim().length < 10} onClick={() => decide(proposal, 'approve')}>✓ Onayla ve birleştir ({kept.length})</button>
            <button className="btn btn-sm" disabled={busy || (notes[proposal.id] || '').trim().length < 10} onClick={() => decide(proposal, 'reject')} style={{ color: '#dc2626' }}>✕ Reddet</button>
          </div>
        </div>
      })}
    </div>
  </div>
}
