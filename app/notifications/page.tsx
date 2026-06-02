'use client'
import PageHeader from '@/components/PageHeader'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  type: string // 'assignment' | 'streak' | 'teacher_message' | 'system'
  title: string
  body: string
  read: boolean
  created_at: string
  data?: any
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    setNotifications(data ?? [])

    // Okunmamışları okundu yap
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    setLoading(false)
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function clearAll() {
    if (!confirm('Tüm bildirimler silinsin mi?')) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('notifications').delete().eq('user_id', user.id)
    setNotifications([])
  }

  function typeIcon(type: string) {
    const icons: Record<string, string> = {
      assignment: '📝',
      streak: '🔥',
      teacher_message: '🎓',
      system: '📢',
      achievement: '🏆',
    }
    return icons[type] || '🔔'
  }

  function typeColor(type: string) {
    const colors: Record<string, string> = {
      assignment: 'rgba(91,127,238,0.1)',
      streak: 'rgba(251,146,60,0.1)',
      teacher_message: 'rgba(8,36,101,0.08)',
      system: 'rgba(30,207,184,0.1)',
      achievement: 'rgba(253,211,29,0.12)',
    }
    return colors[type] || 'var(--bg2)'
  }

  function formatTime(iso: string) {
    const date = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return 'Az önce'
    if (mins < 60) return `${mins} dakika önce`
    if (hours < 24) return `${hours} saat önce`
    if (days < 7) return `${days} gün önce`
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
  }

  const unreadCount = notifications.filter(n => !n.read).length

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 0, padding: '0', paddingBottom: '5rem' }}>
      <PageHeader title="Bildirimler" subtitle="Ödev ve duyurularını takip et" icon="🔔" color="#8b5cf6" backHref="/quiz" backLabel="Geri" />
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
              🔔 Bildirimler
            </h1>
            {unreadCount > 0 && (
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>
                {unreadCount} yeni bildirim
              </p>
            )}
          </div>
          {notifications.length > 0 && (
            <button onClick={clearAll}
              style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.25)', background: 'var(--red-bg)', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              Tümünü temizle
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>🔕</div>
            <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--primary)', marginBottom: '6px' }}>
              Bildirim yok
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
              Yeni ödev, streak ve mesajlar burada görünecek.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notifications.map((n, i) => (
              <div key={n.id} className={i === 0 ? 'anim-up' : ''} style={{
                display: 'flex', gap: '12px', padding: '14px 16px',
                borderRadius: '14px', border: '1px solid var(--border)',
                background: n.read ? 'var(--bg)' : 'rgba(8,36,101,0.03)',
                borderLeft: n.read ? undefined : '3px solid #082465',
                transition: 'all 0.15s',
              }}>
                {/* İkon */}
                <div style={{
                  width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                  background: typeColor(n.type),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px',
                }}>
                  {typeIcon(n.type)}
                </div>

                {/* İçerik */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ fontWeight: n.read ? 500 : 700, fontSize: '14px', color: 'var(--primary)', lineHeight: 1.4 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text4)', flexShrink: 0 }}>
                      {formatTime(n.created_at)}
                    </div>
                  </div>
                  {n.body && (
                    <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px', lineHeight: 1.6 }}>
                      {n.body}
                    </div>
                  )}
                  {n.data?.href && (
                    <Link href={n.data.href} style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginTop: '6px', display: 'inline-block' }}>
                      Görüntüle →
                    </Link>
                  )}
                </div>

                {/* Sil */}
                <button onClick={() => deleteNotification(n.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: '16px', flexShrink: 0, padding: '0 4px', alignSelf: 'flex-start' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text4)')}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
