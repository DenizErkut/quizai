'use client'
import { useState } from 'react'

type Result = { apply: boolean; scanned: number; changed: number; updated: number; failed: string[] }

export default function QuestionBankSvgFit() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function run(apply: boolean) {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/admin/question-bank-svg-fit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply }) })
      const data = await response.json()
      if (!response.ok) setError(data.error || 'İşlem başarısız.')
      else setResult(data)
    } catch { setError('Bağlantı hatası.') }
    setBusy(false)
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '.5rem' }}>Eski görsellerde taşan yazıları düzelt</h3>
      <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '.75rem' }}>Havuzda kayıtlı SVG görsellerdeki sığmayan başlık/etiketleri küçültür veya satırlara böler. Önce “Say” ile kaç kaydın değişeceğine bakın.</p>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(false)}>{busy ? 'Çalışıyor…' : 'Say'}</button>
        <button className="btn btn-primary" disabled={busy || !result || result.apply || result.changed === 0}
          onClick={() => { if (window.confirm(`${result?.changed} kayıt güncellenecek. Devam edilsin mi?`)) run(true) }}>Düzelt</button>
      </div>
      {error && <p style={{ color: 'var(--danger, #c0392b)', marginTop: '.5rem' }}>{error}</p>}
      {result && <p style={{ marginTop: '.5rem', fontSize: '13px' }}>{result.scanned} görsel tarandı; {result.changed} kayıtta taşma var{result.apply ? `; ${result.updated} güncellendi${result.failed.length ? `, ${result.failed.length} başarısız` : ''}` : ''}.</p>}
    </div>
  )
}
