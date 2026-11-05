'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'

function QrApprove() {
  const { t } = useT()
  const router = useRouter()
  const id = useSearchParams().get('id') || ''
  const [state, setState] = useState<'loading' | 'ask' | 'done' | 'error'>('loading')
  const [msg, setMsg] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace(`/login?next=${encodeURIComponent(`/auth/qr?id=${id}`)}`)
      else setState('ask')
    })
  }, [id, router, supabase])

  async function approve() {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/auth/qr/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ id }) })
    if (res.ok) setState('done'); else { setMsg((await res.json().catch(() => ({}))).error || ''); setState('error') }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        {state === 'loading' && <span className="spinner" />}
        {state === 'ask' && (<>
          <h1 className="serif" style={{ fontSize: 22 }}>{t('Başka bir cihazda giriş')}</h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', margin: '12px 0 20px', lineHeight: 1.6 }}>{t('Bu hesapla QR kodu gösteren cihazda giriş yapılsın mı? Yalnızca kendi ekranında gördüğün QR kodu onayla.')}</p>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={approve}>{t('Onayla')}</button>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => router.replace('/home')}>{t('Vazgeç')}</button>
        </>)}
        {state === 'done' && <p style={{ fontSize: 15 }}>{t('Onaylandı ✓ Diğer cihazda giriş yapılıyor.')}</p>}
        {state === 'error' && <p style={{ fontSize: 14, color: 'var(--red)' }}>{msg || t('Bir hata oluştu. Lütfen tekrar deneyin.')}</p>}
      </div>
    </main>
  )
}

export default function QrApprovePage() {
  return <Suspense fallback={null}><QrApprove /></Suspense>
}
