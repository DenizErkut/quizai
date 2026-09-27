'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Integration = {
  id: string
  name: string
  scopes: string[]
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  is_expired: boolean
}

const card: React.CSSProperties = {
  background: 'var(--card, #fff)',
  border: '1px solid var(--border, #e7e0d7)',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 18px rgba(20,40,32,.05)',
}

export default function InstitutionIntegrationsPage() {
  const router = useRouter()
  const [institutionId, setInstitutionId] = useState('')
  const [items, setItems] = useState<Integration[]>([])
  const [name, setName] = useState('')
  const [studentsScope, setStudentsScope] = useState(true)
  const [secret, setSecret] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadIntegrations = useCallback(async (id: string, token: string) => {
    const response = await fetch('/api/institution/integrations?institutionId=' + encodeURIComponent(id), {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result?.error?.message || 'Entegrasyonlar yüklenemedi.')
    setItems(result.data ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login/institution'); return }
      const response = await fetch('/api/institution/check-admin', {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      const result = await response.json().catch(() => ({}))
      if (!result.isAdmin || !result.institutionId) { router.replace('/login/institution'); return }
      if (cancelled) return
      setInstitutionId(result.institutionId)
      try {
        await loadIntegrations(result.institutionId, session.access_token)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Entegrasyonlar yüklenemedi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loadIntegrations, router])

  async function currentToken() {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Oturumunuz sona ermiş. Yeniden giriş yapın.')
    return session.access_token
  }

  async function createIntegration(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) { setError('Entegrasyona bir ad verin.'); return }
    setSaving(true); setError(''); setNotice(''); setSecret('')
    try {
      const token = await currentToken()
      const response = await fetch('/api/institution/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          institutionId,
          name: name.trim(),
          scopes: ['institution:read', ...(studentsScope ? ['students:read:pseudonymous'] : [])],
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error?.message || 'Entegrasyon anahtarı oluşturulamadı.')
      setSecret(result.secret)
      setNotice('Entegrasyon oluşturuldu. Anahtar yalnızca bu kez gösteriliyor.')
      setName('')
      await loadIntegrations(institutionId, token)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bir hata oluştu.')
    } finally {
      setSaving(false)
    }
  }

  async function revokeIntegration(item: Integration) {
    if (!window.confirm('“' + item.name + '” entegrasyonunu iptal etmek istediğinize emin misiniz? Bu işlem anahtarı hemen geçersiz kılar.')) return
    setError(''); setNotice('')
    try {
      const token = await currentToken()
      const response = await fetch('/api/institution/integrations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ institutionId, integrationId: item.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.error?.message || 'Entegrasyon iptal edilemedi.')
      setNotice('Entegrasyon anahtarı iptal edildi.')
      await loadIntegrations(institutionId, token)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bir hata oluştu.')
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      setNotice('Anahtar panoya kopyalandı. Güvenli bir parola kasasına kaydedin.')
    } catch {
      setError('Panoya kopyalanamadı. Anahtarı güvenli bir yere elle kaydedin.')
    }
  }

  if (loading) return <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}><div className="spinner" /></main>

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '28px 18px 80px', color: 'var(--text, #25332e)' }}>
      <Link href="/institution" style={{ color: 'var(--text3, #68736e)', textDecoration: 'none', fontSize: 14 }}>← Kurum paneli</Link>
      <header style={{ margin: '18px 0 24px' }}>
        <div style={{ color: '#178f87', fontWeight: 700, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase' }}>Kurum bağlantıları</div>
        <h1 style={{ margin: '7px 0', fontSize: 30 }}>CRM / ERP entegrasyonları</h1>
        <p style={{ margin: 0, color: 'var(--text3, #68736e)', lineHeight: 1.6 }}>
          Kurumunuzdaki sistemleri Pratium’a sınırlı izinli ve denetlenebilir anahtarlarla bağlayın.
        </p>
      </header>

      {error && <div role="alert" style={{ ...card, marginBottom: 14, borderColor: '#f3b5ac', color: '#a5281c' }}>{error}</div>}
      {notice && <div role="status" style={{ ...card, marginBottom: 14, borderColor: '#9bd6bf', color: '#176b4d' }}>{notice}</div>}

      {secret && (
        <section aria-label="Yeni entegrasyon anahtarı" style={{ ...card, marginBottom: 16, borderColor: '#e4c86a', background: '#fffbed' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Yeni anahtar — şimdi kaydedin</h2>
          <p style={{ lineHeight: 1.55, margin: '0 0 12px' }}>Bu gizli anahtar tekrar gösterilemez. Ekran görüntüsü veya kaynak kod deposunda saklamayın.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 380px', overflowWrap: 'anywhere', padding: 12, background: '#fff', border: '1px solid #eadfaa', borderRadius: 8 }}>{secret}</code>
            <button type="button" onClick={copySecret} style={primaryButton}>Anahtarı kopyala</button>
            <button type="button" onClick={() => setSecret('')} style={secondaryButton}>Gizle</button>
          </div>
        </section>
      )}

      <section style={{ ...card, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>Bağlantı anahtarı oluştur</h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text3, #68736e)', lineHeight: 1.55, fontSize: 14 }}>
          Anahtar varsayılan olarak 90 gün geçerlidir; en fazla 1 yıl kullanılabilir. Her entegrasyonu ayrı oluşturup gerektiğinde iptal edin.
        </p>
        <form onSubmit={createIntegration}>
          <label htmlFor="integration-name" style={labelStyle}>CRM / ERP veya bağlantı adı</label>
          <input id="integration-name" value={name} onChange={event => setName(event.target.value)} maxLength={100}
            placeholder="Örn. Kurum CRM" style={inputStyle} autoComplete="off" />
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 0', lineHeight: 1.45, fontSize: 14 }}>
            <input type="checkbox" checked={studentsScope} onChange={event => setStudentsScope(event.target.checked)} style={{ marginTop: 3 }} />
            Takma adlı öğrenci listesi ve sınıf düzeyi okuma izni
          </label>
          <div style={{ fontSize: 12, color: 'var(--text3, #68736e)', marginBottom: 14 }}>
            Öğrenci adı, iletişim bilgisi, okul numarası ve ham cevap geçmişi bu izinle paylaşılmaz.
          </div>
          <button type="submit" disabled={saving} style={{ ...primaryButton, opacity: saving ? .65 : 1 }}>
            {saving ? 'Oluşturuluyor…' : 'Güvenli anahtar oluştur'}
          </button>
        </form>
      </section>

      <section style={{ ...card, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 19 }}>Mevcut bağlantılar</h2>
        {items.length === 0 ? <p style={{ margin: 0, color: 'var(--text3, #68736e)' }}>Henüz entegrasyon anahtarı yok.</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map(item => {
              const revoked = Boolean(item.revoked_at)
              const expired = item.is_expired
              return (
                <article key={item.id} style={{ padding: 14, border: '1px solid var(--border, #e7e0d7)', borderRadius: 12, display: 'flex', gap: 14, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{item.name}</strong>
                    <div style={{ color: 'var(--text3, #68736e)', fontSize: 12, marginTop: 5 }}>
                      İzinler: {item.scopes.join(', ')}<br />
                      Oluşturma: {new Date(item.created_at).toLocaleDateString('tr-TR')} · Bitiş: {item.expires_at ? new Date(item.expires_at).toLocaleDateString('tr-TR') : '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: revoked || expired ? '#a5281c' : '#176b4d', fontWeight: 700 }}>{revoked ? 'İptal edildi' : expired ? 'Süresi doldu' : 'Aktif'}</span>
                    {!revoked && !expired && <button type="button" onClick={() => void revokeIntegration(item)} style={dangerButton}>İptal et</button>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: '0 0 8px', fontSize: 19 }}>API bağlantı bilgisi</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text3, #68736e)' }}>
          Bu sürüm kurum bilgisini ve takma adlı öğrenci listesini okur; sınıf ayrıntıları, ilerleme özeti ve CRM’den Pratium’a kayıt aktarımı sonraki aşamalardadır.
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 14, background: 'var(--bg2, #f7f4ef)', borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>
          GET https://pratium.com/api/integrations/v1/institution<br />
          GET https://pratium.com/api/integrations/v1/students?limit=50<br />
          Authorization: Bearer &lt;kuruma-özel-anahtar&gt;
        </pre>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text3, #68736e)' }}>
          Anahtarı yalnızca CRM/ERP’nin güvenli sunucu ortamında kullanın; tarayıcı koduna veya mobil uygulamaya koymayın.
        </p>
      </section>
    </main>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid var(--border, #ddd)', borderRadius: 9, font: 'inherit' }
const primaryButton: React.CSSProperties = { padding: '10px 15px', border: 0, borderRadius: 9, background: '#168c80', color: '#fff', fontWeight: 700, cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { padding: '10px 15px', border: '1px solid var(--border, #ddd)', borderRadius: 9, background: 'white', color: 'inherit', fontWeight: 600, cursor: 'pointer' }
const dangerButton: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e6b4ad', borderRadius: 8, background: '#fff7f5', color: '#a5281c', fontWeight: 700, cursor: 'pointer' }

