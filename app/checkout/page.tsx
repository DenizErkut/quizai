'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BILLING_PLANS, resolveBillingPlanKey, type BillingPlanKey } from '@/lib/subscription-plans'

const BASE_PRICES = Object.fromEntries(Object.entries(BILLING_PLANS).map(([key, value]) => [key, value.price])) as Record<BillingPlanKey, number>

const PLANS: Record<BillingPlanKey, PlanDisplay> = {
  silver_monthly: {
    name: 'Aylık Gümüş',
    price: '299',
    period: 'ay',
    badge: '',
    color: '#94a3b8',
    features: ['Ayda 30 test', '10 soru/test', 'Sınav simülasyonu (demo)', 'Temel soru tipleri', '6 dil'],
  },
  silver_yearly: {
    name: 'Yıllık Gümüş',
    price: '2.490',
    period: 'yıl',
    badge: '',
    color: '#94a3b8',
    features: ['Ayda 30 test', '10 soru/test', 'Sınav simülasyonu (demo)', 'Temel soru tipleri', '6 dil'],
  },
  gold_monthly: {
    name: 'Aylık Altın',
    price: '499',
    period: 'ay',
    badge: '',
    color: '#2563eb',
    features: ['Sınırsız test', '20 soru/test', 'Tüm soru tipleri', 'Dosya/görsel yükleme', '6 dil', 'Öncelikli destek'],
  },
  gold_yearly: {
    name: 'Yıllık Altın',
    price: '4.490',
    period: 'yıl',
    badge: '🏆 En popüler',
    color: '#2563eb',
    features: ['Sınırsız test', '20 soru/test', 'Tüm soru tipleri', 'Dosya/görsel yükleme', '6 dil', 'Öncelikli destek'],
  },
  platinum_monthly: {
    name: 'Aylık Platin',
    price: '2.399',
    period: 'ay',
    badge: '👑 Tüm özellikler',
    color: '#0d9488',
    features: ['Sınırsız günlük test', '20 soru/test', 'Tüm soru tipleri', 'Gelişmiş analiz', 'Sınırsız sınıf', '12× birebir koç', 'Telefon desteği'],
  },
  platinum_yearly: {
    name: 'Yıllık Platin',
    price: '19.990',
    period: 'yıl',
    badge: '👑 Tüm özellikler',
    color: '#0d9488',
    features: ['Sınırsız günlük test', '20 soru/test', 'Tüm soru tipleri', 'Gelişmiş analiz', 'Sınırsız sınıf', '12× birebir koç', 'Telefon desteği'],
  },
}

// TR yerel biçim: 1200 -> "1.200", 1150.5 -> "1.150,5"
function formatTRY(n: number): string {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
}

interface PlanDisplay {
  name: string
  price: string
  period: string
  badge: string
  color: string
  features: string[]
  originalPrice?: string
}

// Bir satıcı indirimi varsa, PLANS'ın fiyat alanlarını indirimli hale
// getirir ve originalPrice ekler (checkout ekranındaki üstü çizili fiyat
// gösterimi zaten bu alanı destekliyordu, sadece hiç doldurulmuyordu).
function applyDiscount(discountRate: number): Record<keyof typeof PLANS, PlanDisplay> {
  const out = JSON.parse(JSON.stringify(PLANS)) as Record<keyof typeof PLANS, PlanDisplay>
  if (discountRate <= 0) return out
  ;(Object.keys(BASE_PRICES) as Array<keyof typeof BASE_PRICES>).forEach(key => {
    const base = BASE_PRICES[key]
    const discounted = Math.max(0, base * (1 - discountRate / 100))
    out[key].price = formatTRY(discounted)
    out[key].originalPrice = formatTRY(base)
    out[key].badge = out[key].badge ? `${out[key].badge} · %${discountRate} indirimli` : `%${discountRate} indirimli 🎉`
  })
  return out
}

// PayTR'ın merchant_ok_url'i (bkz. app/api/paytr/checkout/route.ts) sadece
// "kart formu tamamlandı" der, planın gerçekten aktive edildiğini garanti
// etmez — o, PayTR'ın ayrı ve asenkron sunucu-sunucu bildirimiyle olur (bkz.
// app/api/paytr/callback/route.ts). Bu ekran o bildirim gelene kadar
// kullanıcıyı bilgilendirip /api/paytr/status'u kısa aralıklarla polluyor.
function PaytrProcessingScreen({ oid }: { oid: string }) {
  const [status, setStatus] = useState<'pending' | 'active' | 'failed' | 'not_found'>('pending')
  const [attempts, setAttempts] = useState(0)
  const supabase = createClient() as any
  const MAX_ATTEMPTS = 24 // ~24 × 2.5sn ≈ 60sn

  useEffect(() => {
    if (status !== 'pending' || attempts >= MAX_ATTEMPTS) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch(`/api/paytr/status?oid=${encodeURIComponent(oid)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data.status === 'active' || data.status === 'failed') setStatus(data.status)
        else setAttempts(a => a + 1)
      } catch {
        if (!cancelled) setAttempts(a => a + 1)
      }
    }, 2500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [status, attempts, oid])

  if (status === 'active') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }} className="anim-up">
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>🎉</div>
        <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>Ödemen alındı! 🎉</h2>
        <p style={{ color: 'var(--text2)', fontSize: '15px', marginBottom: '2rem', lineHeight: 1.7 }}>
          Planın aktive edildi. Hemen teste başlayabilirsin.
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

  if (status === 'failed' || status === 'not_found') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }} className="anim-up">
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>❌</div>
        <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>Ödeme başarısız</h2>
        <p style={{ color: 'var(--text2)', fontSize: '15px', marginBottom: '2rem' }}>
          Ödeme işlemi tamamlanamadı. Tekrar deneyebilirsin.
        </p>
        <Link href="/checkout" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
          Tekrar dene
        </Link>
      </div>
    </main>
  )

  // pending — hâlâ bekliyoruz (veya MAX_ATTEMPTS'e ulaşıldı)
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }} className="anim-up">
        <div className="spinner" style={{ margin: '0 auto 1.5rem' }} />
        <h2 className="serif" style={{ fontSize: '24px', marginBottom: '0.75rem' }}>Ödemen işleniyor...</h2>
        <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          {attempts < MAX_ATTEMPTS
            ? 'PayTR ödemeni onaylıyor, bu birkaç saniye sürebilir. Bu sayfada kalabilirsin.'
            : 'Bu biraz uzun sürüyor ama ödemen kaybolmadı — onaylandığında hesabına otomatik yansıyacak ve bildirim alacaksın.'}
        </p>
        {attempts >= MAX_ATTEMPTS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '280px', margin: '0 auto' }}>
            <button className="btn btn-primary btn-lg" onClick={() => setAttempts(0)} style={{ justifyContent: 'center' }}>
              Tekrar kontrol et
            </button>
            <Link href="/dashboard" className="btn btn-lg" style={{ justifyContent: 'center' }}>
              Dashboard'a dön
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanKey>(() =>
    resolveBillingPlanKey(searchParams.get('plan')) ?? 'gold_yearly'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paytrToken, setPaytrToken] = useState('')
  const [discountRate, setDiscountRate] = useState(0)
  const supabase = createClient() as any
  const displayPlans = applyDiscount(discountRate)

  // Ödeme sonucu kontrol. 'processing': PayTR'ın iframe içinden yaptığı
  // tarayıcı yönlendirmesi (merchant_ok_url) — bu GÜVENİLİR bir onay DEĞİL,
  // sadece "ödeme muhtemelen tamamlandı" demek. Asıl aktivasyon PayTR'ın ayrı,
  // sunucu-sunucu bildirimiyle (bkz. app/api/paytr/callback/route.ts) olur,
  // bu yüzden aşağıdaki PaytrProcessingScreen bunu /api/paytr/status ile
  // pollayıp gerçek durumu bekliyor.
  const paymentStatus = searchParams.get('payment')
  const processingOid = searchParams.get('oid')

  useEffect(() => {
    // Satıcı üzerinden gelinmişse (kayıtta ?satici=KOD ile bağlanmış olabilir)
    // o satıcının o anki indirim oranını çek — girişli değilse veya
    // bağlı bir satıcı yoksa sessizce 0 döner, hata göstermez.
    async function loadDiscount() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const res = await fetch('/api/my-discount', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const d = await res.json()
          setDiscountRate(d.discount_rate || 0)
        }
      } catch { /* indirim opsiyonel, sessiz geç */ }
    }
    loadDiscount()
  }, [])

  // PayTR'ın iframe boyutlandırma script'ini bir kez yükle (iframe token
  // gelince <iframe> zaten DOM'da oluyor, iFrameResize onu bulup sarıyor).
  useEffect(() => {
    if (!paytrToken) return
    if (document.getElementById('paytr-iframe-resizer-script')) {
      // Zaten yüklü — sadece resize'ı tetikle.
      ;(window as any).iFrameResize?.({}, '#paytriframe')
      return
    }
    const script = document.createElement('script')
    script.id = 'paytr-iframe-resizer-script'
    script.src = 'https://www.paytr.com/js/iframeResizer.min.js'
    script.onload = () => { (window as any).iFrameResize?.({}, '#paytriframe') }
    document.body.appendChild(script)
  }, [paytrToken])

  async function startPayment() {
    setError(''); setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const next = `/checkout?plan=${selectedPlan}`
        router.push(`/login?next=${encodeURIComponent(next)}`)
        return
      }

      const res = await fetch('/api/paytr/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: selectedPlan }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setPaytrToken(data.token)
    } catch (e: any) {
      setError(e.message || 'Ödeme başlatılamadı.')
    } finally {
      setLoading(false)
    }
  }

  // PayTR'ın tarayıcı yönlendirmesi ("muhtemelen tamamlandı" ama henüz
  // doğrulanmadı) — bkz. PaytrProcessingScreen'in başındaki yorum.
  if (paymentStatus === 'processing' && processingOid) return <PaytrProcessingScreen oid={processingOid} />

  // Başarılı ödeme (ör. eski/doğrudan ?payment=success ile gelinirse)
  if (paymentStatus === 'success') return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center' }} className="anim-up">
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>🎉</div>
        <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>Ödemen alındı! 🎉</h2>
        <p style={{ color: 'var(--text2)', fontSize: '15px', marginBottom: '2rem', lineHeight: 1.7 }}>
          Planın aktive edildi. Hemen teste başlayabilirsin.
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

        {!paytrToken ? (
          <>
            {/* Plan seçimi */}
            <div className="anim-up" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Üyelik</div>
              <h1 className="serif" style={{ fontSize: '30px' }}>Plan seç</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '1.5rem' }} className="anim-up-1">
              {(Object.entries(displayPlans) as [string, PlanDisplay][]).map(([key, plan]) => (
                <button key={key} onClick={() => setSelectedPlan(key as BillingPlanKey)}
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
              <span>💳 PayTR güvencesi</span>
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
                : `₺${displayPlans[selectedPlan].price} — Ödemeye geç →`}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem', fontSize: '12px', color: 'var(--text3)' }}>
              PayTR ile öde — Mastercard, Visa, Troy
            </div>

            <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '0.75rem' }}>
              Ödemeye geçerek <a href="/terms" target="_blank" style={{ color: 'var(--text2)' }}>Kullanım Şartları</a>'nı ve{' '}
              <a href="/mesafeli-satis" target="_blank" style={{ color: 'var(--text2)' }}>Mesafeli Satış Sözleşmesi</a>'ni kabul etmiş olursun.
            </p>
          </>
        ) : (
          /* PayTR iframe ödeme formu */
          <div className="anim-up">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h2 className="serif" style={{ fontSize: '24px' }}>Ödeme bilgileri</h2>
              <p style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '4px' }}>
                {displayPlans[selectedPlan].name} — ₺{displayPlans[selectedPlan].price}
              </p>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <iframe
                src={`https://www.paytr.com/odeme/guvenli/${paytrToken}`}
                id="paytriframe"
                frameBorder={0}
                scrolling="no"
                style={{ width: '100%', minHeight: '600px', border: 'none' }}
              />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPaytrToken('')}
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
