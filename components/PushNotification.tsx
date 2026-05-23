'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function PushNotificationToggle() {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setSupported(true)
      checkSubscription()
    }
  }, [])

  async function checkSubscription() {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    setSubscribed(!!sub)
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return reg
  }

  async function toggle() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      }

      if (subscribed) {
        // Unsubscribe
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        await sub?.unsubscribe()
        await fetch('/api/push', { method: 'POST', headers, body: JSON.stringify({ action: 'unsubscribe' }) })
        setSubscribed(false)
      } else {
        // Subscribe
        const reg = await registerSW()
        if (!reg) return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        await fetch('/api/push', { method: 'POST', headers, body: JSON.stringify({ action: 'subscribe', subscription: sub }) })
        // Test bildirimi gönder
        await fetch('/api/push', { method: 'POST', headers, body: JSON.stringify({ action: 'test' }) })
        setSubscribed(true)
      }
    } catch (e) {
      console.error('Push error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!supported) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderRadius: '12px',
      background: subscribed ? 'rgba(0,149,200,0.08)' : 'var(--bg2)',
      border: `1.5px solid ${subscribed ? 'rgba(0,149,200,0.25)' : 'var(--border)'}`,
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
          🔔 Günlük Test Bildirimleri
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
          {subscribed ? 'Bildirimler açık — her gün hatırlatma alırsın' : 'Streakini korumak için bildirim aç'}
        </div>
      </div>
      <button onClick={toggle} disabled={loading}
        style={{
          padding: '8px 16px', borderRadius: '99px', border: 'none', cursor: 'pointer',
          background: subscribed ? 'rgba(220,38,38,0.1)' : 'var(--accent)',
          color: subscribed ? 'var(--red)' : '#fff',
          fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-sans)',
          transition: 'all 0.15s', flexShrink: 0,
        }}>
        {loading ? '...' : subscribed ? 'Kapat' : 'Aç'}
      </button>
    </div>
  )
}
