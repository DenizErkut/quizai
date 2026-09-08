'use client'

import { useState } from 'react'

interface Batch {
  id: string
  source_type: string
  source_reference: string
  status: string
  total_count: number
  valid_count: number
  invalid_count: number
  created_at: string
}

interface ImportItem {
  id: string; row_number: number; objective_code: string; title: string
  level: string; grade: string; subject: string; unit: string; topic: string
  validation_status: 'pending' | 'valid' | 'invalid'; validation_errors: string[]
  review_status: 'pending' | 'approved' | 'rejected' | 'published'
  review_notes: string | null; selected_topic_node_id: string | null
  objective_id: string | null
}

interface PublishTarget {
  topic_node_id: string; topic: string; grade: string; level: string
  unit: string; subject: string
}

interface ItemEdit { title: string; topicNodeId: string; notes: string }

function gradeKey(value: string) {
  return value.toLocaleLowerCase('tr-TR')
    .replace(/sinif/g, 'sınıf')
    .replace(/^(ilk\s*okul|orta\s*okul|lise|üniversite|universite)\s+/, '')
    .replace(/(\d+)\s*\.\s*sınıf/g, '$1. sınıf')
    .replace(/\s+/g, ' ').trim()
}

const example = `[
  {
    "objective_code": "RESMI-KOD",
    "title": "Kazanım açıklaması",
    "level": "ortaokul",
    "grade": "5. sınıf",
    "subject": "Matematik",
    "unit": "Ünite adı",
    "topic": "Konu adı",
    "source_reference": "Belge ve sayfa"
  }
]`

export default function LearningObjectiveImport() {
  const [sourceType, setSourceType] = useState('meb')
  const [sourceReference, setSourceReference] = useState('')
  const [payload, setPayload] = useState(example)
  const [batches, setBatches] = useState<Batch[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [items, setItems] = useState<ImportItem[]>([])
  const [targets, setTargets] = useState<PublishTarget[]>([])
  const [edits, setEdits] = useState<Record<string, ItemEdit>>({})
  const [updatingItem, setUpdatingItem] = useState<string | null>(null)

  async function loadBatches(clearMessage = true) {
    setBusy(true)
    if (clearMessage) setMessage('')
    try {
      const response = await fetch('/api/admin/learning-objective-import')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Import geçmişi yüklenemedi.')
      setBatches(data.batches || [])
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`)
    } finally { setBusy(false) }
  }

  async function loadBatch(batchId: string, clearMessage = true) {
    setBusy(true); if (clearMessage) setMessage('')
    try {
      const response = await fetch(`/api/admin/learning-objective-import?batchId=${encodeURIComponent(batchId)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Parti satırları yüklenemedi.')
      setSelectedBatchId(batchId); setItems(data.items || []); setTargets(data.targets || [])
      setEdits(Object.fromEntries((data.items || []).map((item: ImportItem) => [item.id, {
        title: item.title || '', topicNodeId: item.selected_topic_node_id || '', notes: item.review_notes || '',
      }])))
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`)
    } finally { setBusy(false) }
  }

  async function reviewItem(item: ImportItem, action: 'approve' | 'reject' | 'reopen' | 'publish') {
    const edit = edits[item.id] || { title: item.title, topicNodeId: '', notes: '' }
    setUpdatingItem(item.id); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-objective-import', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, action, title: edit.title, topicNodeId: edit.topicNodeId, notes: edit.notes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Satır işlemi tamamlanamadı.')
      setMessage(action === 'publish'
        ? `✅ ${item.objective_code} kataloğa ve Learning Graph'a yayımlandı.`
        : `✅ ${item.objective_code} satırı “${action}” durumuna geçirildi.`)
      if (selectedBatchId) await loadBatch(selectedBatchId, false)
      await loadBatches(false)
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`)
    } finally { setUpdatingItem(null) }
  }

  async function stageImport() {
    setBusy(true); setMessage('')
    try {
      const rows = JSON.parse(payload)
      if (!Array.isArray(rows)) throw new Error('İçerik bir JSON dizisi olmalıdır.')
      const response = await fetch('/api/admin/learning-objective-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType, sourceReference, rows }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kazanımlar doğrulanamadı.')
      const result = data.result
      setMessage(`✅ ${result.total_count} satır incelendi: ${result.valid_count} geçerli, ${result.invalid_count} düzeltme gerekli. Hiçbir kayıt henüz yayınlanmadı.`)
      await loadBatches(false)
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Geçersiz JSON'}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>
        🎯 Kanonik Kazanım Import Hazırlığı
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
        Resmî kazanım paketini doğrulama alanına alın. Yapısal kontrolden geçen kayıtlar bile ayrıca onaylanana kadar öğrenciye açılmaz.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(240px, 1fr)', gap: '8px', marginBottom: '8px' }}>
        <select value={sourceType} onChange={event => setSourceType(event.target.value)} aria-label="Kaynak türü">
          <option value="meb">MEB</option><option value="manual">Manuel</option><option value="import">Kontrollü import</option>
        </select>
        <input value={sourceReference} onChange={event => setSourceReference(event.target.value)}
          placeholder="Kaynak belge, URL veya sayfa referansı" aria-label="Kaynak referansı" />
      </div>
      <textarea value={payload} onChange={event => setPayload(event.target.value)} aria-label="Kazanım JSON verisi"
        rows={12} spellCheck={false} style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button className="btn btn-sm" disabled={busy || sourceReference.trim().length < 3} onClick={stageImport}>Doğrula ve Hazırla</button>
        <button className="btn btn-sm" disabled={busy} onClick={() => loadBatches()}>Import Geçmişini Yükle</button>
      </div>
      {message && <div style={{ marginTop: '10px', fontSize: '12px', color: message.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{message}</div>}
      {batches.length > 0 && <div style={{ marginTop: '12px', display: 'grid', gap: '6px' }}>
        {batches.map(batch => <button key={batch.id} onClick={() => loadBatch(batch.id)}
          style={{ padding: '8px', border: selectedBatchId === batch.id ? '2px solid #6366f1' : '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', textAlign: 'left', background: 'var(--bg2)', color: 'var(--primary)', cursor: 'pointer' }}>
          <strong>{batch.source_reference}</strong> · {batch.status} · {batch.valid_count}/{batch.total_count} geçerli{batch.invalid_count > 0 ? ` · ${batch.invalid_count} hatalı` : ''}
        </button>)}
      </div>}
      {selectedBatchId && <div style={{ marginTop: '16px', display: 'grid', gap: '10px' }}>
        <div style={{ fontWeight: 700, fontSize: '13px' }}>Satır bazlı inceleme</div>
        {items.map(item => {
          const edit = edits[item.id] || { title: item.title || '', topicNodeId: item.selected_topic_node_id || '', notes: item.review_notes || '' }
          const matchingTargets = targets.filter(target =>
            gradeKey(target.grade) === gradeKey(item.grade) && (!item.level || !target.level || target.level.toLocaleLowerCase('tr-TR') === item.level.toLocaleLowerCase('tr-TR')))
          return <div key={item.id} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <strong>#{item.row_number} · {item.objective_code || 'Kod yok'}</strong>
              <span style={{ color: item.review_status === 'published' ? '#16a34a' : item.validation_status === 'invalid' || item.review_status === 'rejected' ? '#dc2626' : '#d97706' }}>
                {item.validation_status} / {item.review_status}
              </span>
            </div>
            {item.validation_errors?.length > 0 && <div style={{ color: '#dc2626', marginTop: '6px' }}>{item.validation_errors.join(' · ')}</div>}
            <input value={edit.title} disabled={item.review_status === 'published'} aria-label={`${item.objective_code} kazanım başlığı`}
              onChange={event => setEdits(current => ({ ...current, [item.id]: { ...edit, title: event.target.value } }))}
              style={{ width: '100%', marginTop: '8px', padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }} />
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
              Kaynak: {item.subject} → {item.unit} → {item.topic} · {item.grade}
            </div>
            <select value={edit.topicNodeId} disabled={item.review_status === 'published'} aria-label={`${item.objective_code} yayın hedefi`}
              onChange={event => setEdits(current => ({ ...current, [item.id]: { ...edit, topicNodeId: event.target.value } }))}
              style={{ width: '100%', marginTop: '8px', padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }}>
              <option value="">— Doğrulanmış topic → unit → subject zinciri seçin —</option>
              {matchingTargets.map(target => <option key={target.topic_node_id} value={target.topic_node_id}>
                {target.subject} → {target.unit} → {target.topic} · {target.grade}
              </option>)}
            </select>
            <input value={edit.notes} disabled={item.review_status === 'published'} placeholder="İnceleme/red notu"
              aria-label={`${item.objective_code} inceleme notu`}
              onChange={event => setEdits(current => ({ ...current, [item.id]: { ...edit, notes: event.target.value } }))}
              style={{ width: '100%', marginTop: '8px', padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {item.review_status === 'pending' && <>
                <button className="btn btn-sm" disabled={item.validation_status !== 'valid' || !edit.topicNodeId || !edit.title.trim() || updatingItem === item.id}
                  onClick={() => reviewItem(item, 'approve')} style={{ background: '#16a34a', color: '#fff' }}>✓ Onayla</button>
                <button className="btn btn-sm" disabled={edit.notes.trim().length < 3 || updatingItem === item.id}
                  onClick={() => reviewItem(item, 'reject')}>✕ Reddet</button>
              </>}
              {item.review_status === 'approved' && <>
                <button className="btn btn-sm" disabled={updatingItem === item.id} onClick={() => reviewItem(item, 'publish')}
                  style={{ background: '#2563eb', color: '#fff' }}>🚀 Kontrollü yayımla</button>
                <button className="btn btn-sm" disabled={updatingItem === item.id} onClick={() => reviewItem(item, 'reopen')}>Yeniden aç</button>
              </>}
              {item.review_status === 'rejected' && <button className="btn btn-sm" disabled={updatingItem === item.id} onClick={() => reviewItem(item, 'reopen')}>Yeniden aç</button>}
              {item.review_status === 'published' && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Katalog ve grafik bağlantısı yayımlandı</span>}
            </div>
          </div>
        })}
      </div>}
    </div>
  )
}
