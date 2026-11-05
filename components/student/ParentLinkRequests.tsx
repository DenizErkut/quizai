'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'

type Req = { id: string; parentName: string }

// Öğrenciye gelen veli takip isteklerini gösterir; onaylayınca veli takibe başlar.
export default function ParentLinkRequests() {
  const { t } = useT()
  const [requests, setRequests] = useState<Req[]>([])
  const [busy, setBusy] = useState('')

  const headers = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession()
    return session ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } : null
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const h = await headers()
      if (!h) return
      const res = await fetch('/api/parent/link-requests', { headers: h, cache: 'no-store' }).catch(() => null)
      if (res?.ok && alive) setRequests((await res.json()).requests || [])
    })()
    return () => { alive = false }
  }, [headers])

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(id)
    const h = await headers()
    if (h) {
      const res = await fetch('/api/parent/link-requests', { method: 'POST', headers: h, body: JSON.stringify({ id, action }) }).catch(() => null)
      if (res?.ok) setRequests(list => list.filter(r => r.id !== id))
    }
    setBusy('')
  }

  if (requests.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: '1rem' }}>
      {requests.map(r => (
        <div key={r.id} className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #df5c3f', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 14, lineHeight: 1.5 }}>
            👨‍👩‍👧 <b>{r.parentName}</b> {t('seni veli olarak takip etmek istiyor. Onaylarsan gelişimini görebilir.')}
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => decide(r.id, 'approve')}>{t('Onayla')}</button>
          <button className="btn btn-sm" disabled={busy === r.id} onClick={() => decide(r.id, 'reject')}>{t('Reddet')}</button>
        </div>
      ))}
    </div>
  )
}
