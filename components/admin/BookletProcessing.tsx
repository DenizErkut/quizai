'use client'
import { useState } from 'react'
import { finishBookletProcessing } from '@/lib/booklet-processing'

export default function BookletProcessing({ resourceId }: { resourceId: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <div style={{ marginTop: 8 }}>
    <button className="btn btn-sm" disabled={busy} onClick={async () => {
      setBusy(true)
      try {
        const result = await finishBookletProcessing(resourceId, setMessage)
        setMessage(`İşleme tamamlandı; ${result.promoted || 0} yeni soru havuza alındı. Listeyi yenileyin. Görsel gerektiren sorular ayrıca incelenmelidir.`)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'İşleme tamamlanamadı.') }
      finally { setBusy(false) }
    }}>{busy ? 'Sorular işleniyor…' : 'İşlemeyi sürdür / durumu kontrol et'}</button>
    {message && <div role="status" style={{ fontSize: 12, marginTop: 6 }}>{message}</div>}
  </div>
}
