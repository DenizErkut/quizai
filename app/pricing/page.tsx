'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  plan: string
  plan_expires_at: string | null
  referral_code: string
  monthly_test_count: number
  daily_test_count: number
  daily_test_date: string | null
}

export default function PricingPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [referralCount, setReferralCount] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { count }] = await Promise.all([
        supabase.from('profiles').select('plan, plan_expires_at, referral_code, monthly_test_count, daily_test_count, daily_test_date').eq('id', user.id).single(),
        supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', user.id),
      ])
      setProfile(p)
      setReferralCount(count || 0)
    }
    load()
  }, [])

  function copyReferral() {
    if (!profile?.referral_code) return
    const link = `${window.location.origin}/register?ref=${profile.referral_code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const nextMilestone = Math.ceil((referralCount + 1) / 10) * 10
  const progressPct = (referralCount % 10) / 10 * 100
  const today = new Date().toISOString().split('T')[0]
  const dailyUsed = profile?.daily_test_date === today ? (profile?.daily_test_count || 0) : 0

  const PLANS = [
    {
      id: 'free',
      label: 'Freemium',
      price: '₺0',
      sub: 'Sonsuza kadar',
      color: '#64748b',
      accent: false,
      features: [
        'Ayda 10 test',
        'Test başına 5 soru',
        'Sadece müfredat konuları',
        'Temel soru tipleri',
        'Temel arşiv & dashboard',
        'Davet ile premium kazan',
      ],
      cta: 'Ücretsiz başla',
      ctaHref: '/register',
    },
    {
      id: 'premium',
      label: 'Premium',
      price: '₺600',
      sub: 'yıllık',
      color: '#2563eb',
      accent: true,
      badge: 'En popüler',
      features: [
        'Ayda 300 test',
        'Test başına 20 soru',
        'Tüm konular (müfredat dışı dahil)',
        'Tüm Maarif Modeli soru tipleri',
        'PDF/ses dosyası yükle',
        'Görsel & grafik sorular',
        'Detaylı analiz (10 test sonrası)',
        'Sınıf sistemi — birden fazla sınıf',
        'Öncelikli destek',
      ],
      cta: 'Premium\'a geç →',
      ctaHref: '/checkout?plan=premium',
    },
    {
      id: 'unlimited',
      label: 'Unlimited',
      price: '₺6.000',
      sub: 'yıllık',
      color: '#0d9488',
      accent: false,
      features: [
        'Sınırsız aylık test',
        'Test başına 20 soru',
        'Tüm konular — kısıtsız',
        'Tüm Maarif Modeli soru tipleri',
        'PDF/ses/görüntü yükle',
        'Gelişmiş analiz & raporlar',
        'Sınıf sistemi — sınırsız sınıf',
        '12× birebir koç görüşmesi',
        'Öncelikli & telefon desteği',
      ],
      cta: 'Unlimited\'a geç →',
      ctaHref: '/checkout?plan=unlimited',
    },
  ]

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="anim-up">
          <div className="badge badge-purple" style={{ marginBottom: '1rem' }}>Planlar</div>
          <h1 className="serif" style={{ fontSize: '38px', lineHeight: 1.15, marginBottom: '0.75rem' }}>
            Öğrenmek için doğru plan
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '16px' }}>
            Ücretsiz başla, ihtiyacın artınca yükselt.
          </p>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px,100%), 1fr))', gap: '14px', marginBottom: '2.5rem' }} className="anim-up-1">
          {PLANS.map(p => {
            const isCurrent = profile?.plan === p.id
            return (
              <div key={p.id} className="card" style={{ position: 'relative', border: p.accent ? `2px solid ${p.color}` : undefined, display: 'flex', flexDirection: 'column' }}>
                {p.badge && (
                  <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: p.color, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 12px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                    {p.badge}
                  </div>
                )}
                {isCurrent && (
                  <div className="badge badge-green" style={{ marginBottom: '0.75rem', display: 'inline-flex', alignSelf: 'flex-start' }}>Mevcut planın ✓</div>
                )}
                <div style={{ fontSize: '12px', fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{p.label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, marginBottom: '2px' }}>{p.price}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1.25rem' }}>{p.sub}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem', flex: 1 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '13px' }}>
                      <span style={{ color: p.color, fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>✓</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                {isCurrent ? (
                  <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--green-bg)', border: '1px solid rgba(22,163,74,0.2)', fontSize: '12px', color: 'var(--green)', textAlign: 'center' }}>
                    ✓ Aktif
                    {profile?.plan_expires_at && (
                      <div style={{ fontSize: '10px', marginTop: '2px' }}>
                        {new Date(profile.plan_expires_at).toLocaleDateString('tr-TR')} kadar
                      </div>
                    )}
                  </div>
                ) : p.id === 'free' ? (
                  <Link href={p.ctaHref} className="btn" style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>{p.cta}</Link>
                ) : (
                  <Link href={p.ctaHref} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', display: 'flex', background: p.color, borderColor: p.color }}>{p.cta}</Link>
                )}
              </div>
            )
          })}
        </div>

        {/* Kullanım durumu */}
        {profile && (
          <div className="card-sm anim-up-2" style={{ marginBottom: '1.5rem', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '2px' }}>Bu ay</div>
              <div style={{ fontWeight: 600 }}>{profile.monthly_test_count} test çözüldü</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '2px' }}>Bugün</div>
              <div style={{ fontWeight: 600 }}>{dailyUsed} test · {
                profile.plan === 'unlimited' ? 'Sınırsız' :
                profile.plan === 'premium' ? `${Math.max(0, 25 - dailyUsed)} kaldı` :
                `${Math.max(0, 10 - dailyUsed)} kaldı`
              }</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '2px' }}>Plan</div>
              <div style={{ fontWeight: 600, textTransform: 'capitalize', color: profile.plan === 'unlimited' ? '#0d9488' : profile.plan === 'premium' ? '#2563eb' : 'var(--text)' }}>
                {profile.plan === 'free' ? 'Freemium' : profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)}
              </div>
            </div>
          </div>
        )}

        {/* Referral */}
        {profile && (
          <div className="card anim-up-3" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', gap: '12px', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '4px' }}>🎁 Arkadaşlarını davet et</h2>
                <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
                  Her 10 kişiyi davet ettiğinde <strong>1 yıl ücretsiz Premium</strong> kazanırsın.
                </p>
              </div>
              <div className="badge badge-purple">{referralCount} / {nextMilestone} davet</div>
            </div>
            <div className="progress-bar" style={{ marginBottom: '1rem' }}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input className="input" readOnly
                value={profile.referral_code ? `${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${profile.referral_code}` : ''}
                style={{ flex: 1, fontSize: '12px' }} />
              <button className="btn btn-sm" onClick={copyReferral} style={{ flexShrink: 0 }}>
                {copied ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
            </div>
            {referralCount > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--green)', marginTop: '8px' }}>
                {referralCount} kişi davet ettin — {10 - (referralCount % 10)} kişi daha, 1 yıl Premium kazan!
              </p>
            )}
          </div>
        )}

        {/* SSS */}
        <div className="card anim-up-4">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Sık sorulan sorular</div>
          {[
            { q: 'Ödeme güvenli mi?', a: 'Evet. Tüm ödemeler iyzico altyapısıyla SSL koruması altında işlenir. Kart bilgileriniz sitemizde saklanmaz.' },
            { q: 'İptal edebilir miyim?', a: 'Evet, istediğin zaman iptal edebilirsin. Premium veya Unlimited süren dolana kadar özelliklerden yararlanmaya devam edersin.' },
            { q: 'Birden fazla sınıfa katılabilir miyim?', a: 'Evet! Matematik, Türkçe, Fen gibi farklı dersler için öğretmenlerinden farklı davet kodları alarak birden fazla sınıfa aynı anda üye olabilirsin.' },
            { q: 'Analiz için kaç test çözmem gerekiyor?', a: 'Analiz ve gelişim planı için en az 10 test çözmen gerekiyor. Daha fazla test çözdükçe analiz daha isabetli olur.' },
            { q: 'Unlimited\'daki koç görüşmesi nedir?', a: 'Yılda 12 kez birebir eğitim koçuyla online görüşme yapabilirsin. Çalışma planın, zayıf konuların ve hedefin üzerine kişisel rehberlik alırsın.' },
            { q: 'Davet ile premium nasıl çalışır?', a: 'Davet linkini paylaş, 10 kişi kayıt olursa 1 yıl ücretsiz Premium kazanırsın. Her 10 davette tekrar kazanırsın.' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>{item.q}</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{item.a}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
