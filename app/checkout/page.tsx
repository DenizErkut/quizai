'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const PLANS = {
  monthly: {
    name: 'Aylık Premium',
    price: '79',
    period: 'ay',
    badge: '',
    color: '#2563eb',
    features: ['Günde 25 test', '20 soru/test', 'Tüm soru tipleri', 'Dosya yükleme', '6 dil', 'Öncelikli destek'],
  },
  yearly: {
    name: 'Yıllık Premium',
    price: '599',
    originalPrice: '948',
    period: 'yıl',
    saving: '%37 tasarruf',
    badge: '🏆 En popüler',
    color: '#2563eb',
    features: ['Günde 25 test', '20 soru/test', 'Tüm soru tipleri', 'Dosya yükleme', '6 dil', 'Öncelikli destek', '4 ay bedava'],
  },
  unlimited: {
    name: 'Yıllık Unlimited',
    price: '6.000',
    period: 'yıl',
    badge: '👑 Tüm özellikler',
    color: '#0d9488',
    features: ['Sınırsız günlük test', '20 soru/test', 'Tüm soru tipleri', 'Gelişmiş analiz', 'Sınırsız sınıf', '12× birebir koç', 'Telefon desteği'],
  },
}

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | 'unlimited'>('yearly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formHtml, setFormHtml] = useState('')
  const formRef = useRef<HTMLDivElement>(null)
  const supabase = createClient() as any

  // Ödeme sonucu kontrol
  const paymentStatus = searchParams.get('payment')

  useEffect(() => {
    // URL'den plan al
    const planParam = searchParams.get('plan')
    if (planParam === 'monthly' || planParam === 'yearly' || planParam === 'unlimited') {
      setSelectedPlan(planParam as any)
    }
  }, [])

  // iyzico form inject et
  useEffect(() => {
    if (!formHtml || !formRef.current) return
    formRef.current.innerHTML = formHtml

    // iyzico script'ini çalıştır
    const scripts = formRef.current.querySelectorAll('script')
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script')
      if (oldScript.src) {
        newScript.src = oldScript.src
        newScript.async = true
      } else {
        newScript.textContent = oldScript.textContent
      }
      document.head.appendChild(newScript)
      oldScript.remove()
    })
  }, [formHtml])

  async function startPayment() {
    setError(''); setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const res = await fetch('/api/iyzico/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: selectedPlan }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setFormHtml(data.checkoutFormContent)
    } catch (e: any) {
      setError(e.message || 'Ödeme başlatılamadı.')
    } finally {
      setLoading(false)
    }
  }

  // Başarılı ödeme
  if (paymentStatus === 'success') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }} className="anim-up">
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>🎉</div>
        <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>Premium aktif!</h2>
        <p style={{ color: 'var(--text2)', fontSize: '15px', marginBottom: '2rem', lineHeight: 1.7 }}>
          Ödemen başarıyla alındı. Artık sınırsız test çözebilirsin.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '280px', margin: '0 auto' }}>
          <Link href="/quiz" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
            ⚡ Teste başla
          </Link>
          <Link href="/dashboard" className="btn btn-lg" style={{ justifyContent: 'center' }}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )

  // Başarısız ödeme
  if (paymentStatus === 'failed' || paymentStatus === 'error') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }} className="anim-up">
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>❌</div>
        <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>Ödeme başarısız</h2>
        <p style={{ color: 'var(--text2)', fontSize: '15px', marginBottom: '2rem' }}>
          Ödeme işlemi tamamlanamadı. Tekrar deneyebilirsin.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => router.push('/checkout')}
          style={{ justifyContent: 'center' }}>
          Tekrar dene
        </button>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
          <Link href="/" className="serif" style={{ fontSize: '20px', textDecoration: 'none', color: 'var(--text)' }}>
            PRATIUM
          </Link>
          <Link href="/pricing" className="btn btn-ghost btn-sm">← Planlara dön</Link>
        </nav>

        {!formHtml ? (
          <>
            {/* Plan seçimi */}
            <div className="anim-up" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Premium</div>
              <h1 className="serif" style={{ fontSize: '30px' }}>Plan seç</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '1.5rem' }} className="anim-up-1">
              {(Object.entries(PLANS) as [string, typeof PLANS.monthly][]).map(([key, plan]) => (
                <button key={key} onClick={() => setSelectedPlan(key as 'monthly' | 'yearly')}
                  style={{
                    padding: '1.25rem', borderRadius: '14px', textAlign: 'left',
                    border: `2px solid ${selectedPlan === key ? 'var(--accent)' : 'var(--border)'}`,
                    background: selectedPlan === key ? 'var(--accent-bg)' : 'var(--bg)',
                    cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
                  }}>
                  {'saving' in plan && (
                    <div style={{
                      position: 'absolute', top: '-10px', right: '12px',
                      background: 'var(--green)', color: '#fff',
                      fontSize: '11px', fontWeight: 700, padding: '3px 10px',
                      borderRadius: '99px',
                    }}>{(plan as any).saving}</div>
                  )}
                  <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>{plan.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                    <span className="serif" style={{ fontSize: '32px', color: 'var(--text)' }}>₺{plan.price}</span>
                    <span style={{ fontSize: '13px', color: 'var(--text3)' }}>/{plan.period}</span>
                  </div>
                  {'originalPrice' in plan && (
                    <div style={{ fontSize: '12px', color: 'var(--text3)', textDecoration: 'line-through' }}>
                      ₺{(plan as any).originalPrice}/{plan.period}
                    </div>
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {plan.features.slice(0, 4).map(f => (
                      <div key={f} style={{ fontSize: '12px', color: selectedPlan === key ? 'var(--accent)' : 'var(--text2)', display: 'flex', gap: '6px' }}>
                        <span style={{ color: 'var(--green)' }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Güven unsurları */}
            <div className="card-sm anim-up-2" style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', fontSize: '12px', color: 'var(--text2)' }}>
              <span>🔒 SSL ile güvenli ödeme</span>
              <span>💳 iyzico güvencesi</span>
              <span>🔄 İstediğin zaman iptal</span>
              <span>📧 Fatura e-postayla</span>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', fontSize: '13px', color: 'var(--red)', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary btn-lg" onClick={startPayment} disabled={loading}
              style={{ width: "100%", justifyContent: "center" }}>
              {loading
                ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Yükleniyor...</>
                : `₺${PLANS[selectedPlan].price} — Ödemeye geç →`}
            </button>

            <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '1rem' }}>
              Ödemeye geçerek <a href="#" style={{ color: 'var(--text2)' }}>Kullanım Şartları</a>'nı kabul etmiş olursun.
            </p>
          </>
        ) : (
          /* iyzico ödeme formu */
          <div className="anim-up">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h2 className="serif" style={{ fontSize: '24px' }}>Ödeme bilgileri</h2>
              <p style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '4px' }}>
                {PLANS[selectedPlan].name} — ₺{PLANS[selectedPlan].price}
              </p>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div ref={formRef} id="iyzipay-checkout-form" className="responsive" />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setFormHtml('')}
              style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}>
              ← Geri dön
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </main>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
