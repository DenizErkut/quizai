'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
  action_url?: string
  data?: any
}

const TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  assignment:      { icon: '📝', color: '#6366f1', bg: 'rgba(99,102,241,0.08)',   label: 'Ödev' },
  streak:          { icon: '🔥', color: '#f97316', bg: 'rgba(249,115,22,0.08)',   label: 'Seri' },
  teacher_message: { icon: '🎓', color: '#082465', bg: 'rgba(8,36,101,0.06)',     label: 'Öğretmen' },
  system:          { icon: '📢', color: '#1ECFB8', bg: 'rgba(30,207,184,0.08)',   label: 'Sistem' },
  achievement:     { icon: '🏆', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   label: 'Başarı' },
  weekly_summary:  { icon: '📊', color: '#10b981', bg: 'rgba(16,185,129,0.08)',   label: 'Haftalık' },
  quiz_result:     { icon: '✅', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',   label: 'Test' },
  reminder:        { icon: '⏰', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',   label: 'Hatırlatma' },
  parent_report:   { icon: '👨‍👩‍👧', color: '#ec4899', bg: 'rgba(236,72,153,0.08)', label: 'Veli' },
}

function getMeta(type: string) {
  return TYPE_META[type] || { icon: '🔔', color: 'var(--primary)', bg: 'var(--bg2)', label: 'Diğer' }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Az önce'
  if (mins < 60) return `${mins} dk önce`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} saat önce`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} gün önce`
  return new Date(dateStr).toLocaleDateString('tr-TR')
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient() as any
  const { setUnreadCount } = useUser()
  const channelRef = useRef<any>(null)

  useEffect(() => {
    load()
    // Push notification desteği kontrol
    if ('Notification' in window && 'serviceWorker' in navigator) {
      setPushSupported(true)
      setPushEnabled(Notification.permission === 'granted')
    }
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60)

    setNotifications(data ?? [])
    setLoading(false)

    // Tümünü okundu yap
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setUnreadCount(0)

    // Realtime dinle
    channelRef.current = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}`
      }, (payload: any) => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .subscribe()
  }

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  async function deleteNotif(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
  }

  async function clearAll() {
    if (!confirm('Tüm bildirimler silinsin mi?')) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('notifications').delete().eq('user_id', user.id)
    setNotifications([])
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function enablePush() {
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushLoading(false); return }

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })

      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })

      setPushEnabled(true)
    } catch (e) { console.error(e) }
    setPushLoading(false)
  }

  // Filtre uygula
  const types = ['all', ...Array.from(new Set(notifications.map(n => n.type)))]
  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter)
  const unread = notifications.filter(n => !n.read).length

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem 1rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '2px' }}>
              🔔 Bildirim Merkezi
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
              {notifications.length} bildirim{unread > 0 ? ` · ${unread} okunmamış` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {unread > 0 && (
              <button onClick={markAllRead} className="btn btn-sm"
                style={{ fontSize: '12px', padding: '6px 12px' }}>
                ✓ Tümü Okundu
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll} className="btn btn-sm"
                style={{ fontSize: '12px', padding: '6px 12px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                🗑️ Temizle
              </button>
            )}
          </div>
        </div>

        {/* Push Notification Banner */}
        {pushSupported && !pushEnabled && (
          <div style={{ marginBottom: '1rem', padding: '14px 16px', borderRadius: '14px', background: 'rgba(99,102,241,0.06)', border: '1.5px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '24px' }}>📲</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>Anlık Bildirimler</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Ödev, seri ve başarı bildirimlerini anında al.</div>
            </div>
            <button onClick={enablePush} disabled={pushLoading} className="btn btn-primary"
              style={{ padding: '7px 14px', fontSize: '13px' }}>
              {pushLoading ? '⏳...' : '✓ Etkinleştir'}
            </button>
          </div>
        )}

        {pushEnabled && (
          <div style={{ marginBottom: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '13px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✅</span> Anlık bildirimler açık — seni güncel tutacağız!
          </div>
        )}

        {/* Tür Filtresi */}
        {types.length > 2 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {types.map(t => {
              const meta = t === 'all' ? { icon: '🔔', label: 'Tümü', color: 'var(--primary)', bg: 'var(--bg2)' } : getMeta(t)
              const count = t === 'all' ? notifications.length : notifications.filter(n => n.type === t).length
              return (
                <button key={t} onClick={() => setFilter(t)}
                  style={{ padding: '5px 12px', borderRadius: '99px', border: `1.5px solid ${filter === t ? meta.color : 'var(--border)'}`, background: filter === t ? meta.bg : 'var(--bg)', color: filter === t ? meta.color : 'var(--text3)', fontSize: '12px', fontWeight: filter === t ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  {meta.icon} {meta.label} <span style={{ opacity: 0.6 }}>({count})</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Bildirim listesi */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>🔕</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)', marginBottom: '6px' }}>
              {filter === 'all' ? 'Henüz bildirim yok' : 'Bu türde bildirim yok'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
              Test çözdükçe, ödev aldıkça bildirimler burada görünecek.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(n => {
              const meta = getMeta(n.type)
              return (
                <div key={n.id}
                  style={{ display: 'flex', gap: '12px', padding: '14px', borderRadius: '14px', background: n.read ? 'var(--bg2)' : meta.bg, border: `1.5px solid ${n.read ? 'var(--border)' : meta.color + '33'}`, position: 'relative', cursor: n.action_url ? 'pointer' : 'default', transition: 'all 0.15s' }}
                  onClick={() => { if (!n.read) markRead(n.id); if (n.action_url) router.push(n.action_url) }}>

                  {/* Okunmamış nokta */}
                  {!n.read && (
                    <div style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                  )}

                  {/* İkon */}
                  <div style={{ width: 44, height: 44, borderRadius: '12px', background: meta.bg, border: `1.5px solid ${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                    {meta.icon}
                  </div>

                  {/* İçerik */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ fontWeight: n.read ? 500 : 700, fontSize: '14px', color: 'var(--text)' }}>
                        {n.title}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text4)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '3px', lineHeight: 1.5 }}>
                      {n.body}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: meta.bg, color: meta.color, fontWeight: 600 }}>
                        {meta.icon} {meta.label}
                      </span>
                      {n.action_url && (
                        <span style={{ fontSize: '12px', color: meta.color, fontWeight: 600 }}>
                          Görüntüle →
                        </span>
                      )}
                      <button onClick={e => { e.stopPropagation(); deleteNotif(n.id) }}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: '16px', lineHeight: 1, padding: '2px 4px' }}
                        title="Sil">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Bildirim Ayarları */}
        <div className="card" style={{ marginTop: '1.5rem', background: 'var(--bg2)' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '12px' }}>⚙️ Bildirim Tercihleri</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: '📝 Yeni ödev bildirimleri', key: 'assignment' },
              { label: '🔥 Seri hatırlatmaları', key: 'streak' },
              { label: '🏆 Başarı rozetleri', key: 'achievement' },
              { label: '📊 Haftalık özet (Pazar)', key: 'weekly_summary' },
              { label: '🎓 Öğretmen mesajları', key: 'teacher_message' },
            ].map(pref => (
              <div key={pref.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{pref.label}</span>
                <div style={{ width: 40, height: 22, borderRadius: '99px', background: 'rgba(16,185,129,0.2)', border: '1.5px solid #10b981', display: 'flex', alignItems: 'center', padding: '2px', cursor: 'pointer' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#10b981', marginLeft: 'auto', transition: 'margin 0.2s' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text4)', marginTop: '10px' }}>
            * Tercihler yakında Supabase'e kaydedilecek
          </div>
        </div>

      </div>
    </main>
  )
}
