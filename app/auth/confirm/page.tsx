'use client'
// app/auth/confirm/page.tsx
//
// 19 Eylül 2026 — ACİL prod düzeltmesi (Deniz): e-posta onay ve şifre
// sıfırlama bağlantıları şimdiye kadar doğrudan Supabase'in kendi
// /auth/v1/verify uç noktasına gidiyordu ({{ .ConfirmationURL }}). O uç
// nokta tek kullanımlık token'ı SADECE bir GET isteğiyle bile tüketiyor —
// yani e-posta güvenlik tarayıcıları (Microsoft Outlook Safe Links, kurumsal
// antivirüs ağ geçitleri, bazı e-posta istemcilerinin link önizlemesi)
// kullanıcı gerçekten tıklamadan ÖNCE bağlantıyı "ziyaret edip" token'ı
// harcıyor. Kullanıcı asıl tıkladığında token zaten tükenmiş oluyor →
// "Onay bağlantısı geçersiz veya süresi dolmuş" / "otp_expired" hatası.
//
// Prod loglarında doğrulandı (2026-09-19, Supabase auth_logs):
//   52.102.13.101 / 52.102.18.53 (Microsoft link-tarayıcı IP aralığı)
//   /verify'a kullanıcının gerçek tıklamasından saniyeler önce çarpıyor;
//   hemen ardından kullanıcının kendi isteği "One-time token not found"
//   (403) ile başarısız oluyor. Aynı örüntü şifre sıfırlamada da var.
//
// ÇÖZÜM: E-posta şablonundaki bağlantı artık Supabase'in /verify'ına değil
// BU sayfaya gidecek şekilde değiştirilmeli (Supabase Dashboard >
// Authentication > Email Templates — bkz. proje notları). Bu sayfa token'ı
// SAYFA YÜKLENİRKEN OTOMATİK tüketmez — sadece kullanıcı gerçekten "Onayla"
// butonuna tıklarsa client tarafında verifyOtp() çağrılır. Bir bot sayfayı
// GET'leyip HTML'i render edebilir ama JS click event'i tetiklemediği için
// token güvende kalır.
import { useState } from 'react'
import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Status = 'idle' | 'verifying' | 'error' | 'done'
type OtpType = 'signup' | 'recovery' | 'email_change' | 'invite' | 'magiclink'

const TYPE_LABELS: Record<string, { title: string; cta: string; icon: string }> = {
  signup: { title: 'Hesabını onayla', cta: 'Hesabımı Onayla', icon: '📧' },
  recovery: { title: 'Şifre sıfırlamayı onayla', cta: 'Devam Et', icon: '🔑' },
  email_change: { title: 'E-posta değişikliğini onayla', cta: 'Onayla', icon: '✉️' },
  invite: { title: 'Daveti onayla', cta: 'Daveti Kabul Et', icon: '🎉' },
  magiclink: { title: 'Girişi onayla', cta: 'Giriş Yap', icon: '🔓' },
}

function resolveNextPath(next: string | null, fallback: string): string {
  if (!next) return fallback
  try {
    // Supabase e-posta şablonunda {{ .RedirectTo }} tam URL olarak gelir
    // (örn. https://pratium.com/auth/complete-profile) — aynı origin ise
    // path+query'ye indirgiyoruz, farklı bir origin ise (beklenmedik/
    // güvenilmez durum) güvenlik için fallback'e düşüyoruz.
    const url = new URL(next, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    return url.pathname + url.search
  } catch {
    return next.startsWith('/') ? next : fallback
  }
}

function ConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient() as any

  const tokenHash = searchParams.get('token_hash') || searchParams.get('token') || ''
  const type = (searchParams.get('type') || 'signup') as OtpType
  const nextParam = searchParams.get('next')

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const labels = TYPE_LABELS[type] || TYPE_LABELS.signup
  const fallbackNext = type === 'recovery' ? '/auth/reset-password' : '/auth/complete-profile'

  async function handleConfirm() {
    if (!tokenHash) {
      setError('Bağlantı eksik veya bozuk görünüyor. Lütfen e-postandaki bağlantıya tekrar tıkla.')
      setStatus('error')
      return
    }
    setStatus('verifying')
    setError('')
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (err) {
      const expired = /expired|not found|invalid/i.test(err.message || '')
      setError(expired
        ? 'Bu bağlantının süresi dolmuş veya daha önce kullanılmış olabilir. Lütfen yeni bir bağlantı iste.'
        : 'Onaylama sırasında bir sorun oluştu. Lütfen tekrar dene.')
      setStatus('error')
      return
    }
    setStatus('done')
    const dest = resolveNextPath(nextParam, fallbackNext)
    setTimeout(() => router.push(dest), 400)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '64px' }} />
        </div>
        <div className="card anim-up" style={{ textAlign: 'center' }}>
          {status === 'done' ? (
            <>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>✅</div>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.5rem' }}>Onaylandı!</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Yönlendiriliyorsun...</p>
            </>
          ) : status === 'error' ? (
            <>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⚠️</div>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.5rem' }}>Bir sorun oluştu</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.25rem' }}>{error}</p>
              <button className="btn" onClick={() => router.push('/login')} style={{ width: '100%', justifyContent: 'center' }}>
                Giriş sayfasına dön
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>{labels.icon}</div>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.5rem' }}>{labels.title}</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                Devam etmek için aşağıdaki butona tıkla.
              </p>
              <button className="btn" disabled={status === 'verifying'} onClick={handleConfirm} style={{ width: '100%', justifyContent: 'center' }}>
                {status === 'verifying' ? 'Onaylanıyor…' : labels.cta}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <ConfirmInner />
    </Suspense>
  )
}
