'use client'
import { useState } from 'react'

export default function PilotAccountSetup({ users }: { users: Array<{ id: string; name: string; grade: string }> }) {
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function convert() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/pilot-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'convert-approved-teacher', userId }) })
      const result = await response.json()
      setMessage(response.ok ? result.message : result.error || 'Dönüşüm tamamlanamadı.')
    } catch { setMessage('Bağlantı kurulamadı.') }
    finally { setBusy(false) }
  }
  return <details className="card" style={{ marginBottom: 16 }}>
    <summary>Öğretmen hesabı hazırlığı</summary>
    <p>Mevcut onaylı öğretmen kaydı bulunan hesabın kimlik ve profil rolünü birlikte öğretmene dönüştürür. Geçmiş testler ve sınıflar silinmez.</p>
    <label>Hesap <select aria-label="Öğretmene dönüştürülecek hesap" value={userId} onChange={event => setUserId(event.target.value)} disabled={busy}>
      <option value="">Hesap seçin</option>
      {users.map(user => <option key={user.id} value={user.id}>{user.name || 'İsimsiz'} · {user.grade || 'Sınıf yok'} · {user.id.slice(0, 8)}</option>)}
    </select></label>
    <button className="btn btn-sm" disabled={!userId || busy} onClick={() => void convert()}>{busy ? 'Dönüştürülüyor…' : 'Onaylı hesabı öğretmene dönüştür'}</button>
    {message && <p role="status">{message}</p>}
  </details>
}
