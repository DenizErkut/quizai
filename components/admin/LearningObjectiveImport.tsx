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
        {batches.map(batch => <div key={batch.id} style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}>
          <strong>{batch.source_reference}</strong> · {batch.status} · {batch.valid_count}/{batch.total_count} geçerli{batch.invalid_count > 0 ? ` · ${batch.invalid_count} hatalı` : ''}
        </div>)}
      </div>}
    </div>
  )
}
