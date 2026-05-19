'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function PricingPage() {
  const router = useRouter()
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly')
  const [profile, setProfile] = useState<{ plan: string; plan_expires_at: string | null; referral_code: string; monthly_test_count: number } | null>(null)
  const [referralCount, setReferralCount] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase
        .from('profiles')
        .select('plan, plan_expires_at, referral_code, monthly_test_count')
        .eq('id', user.id)
        .single()
      setProfile(p)
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', user.id)
      setReferralCount(count || 0)
    }
    load()
  }, [])

  const referralLink = profile
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${profile.referral_code}`
    : ''

  function copyReferral() {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const nextMilestone = Math.ceil((referralCount + 1) / 10) * 10
  const progressPct = (referralCount % 10) / 10 * 100

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3rem' }}>
          <Link href="/" className="serif" style={{ fontSize: '20px', textDecoration: 'none', color: 'var(--text)' }}>
            Quiz<span style={{ color: 'var(--accent)' }}>AI</span>
          </Link>
          <Link href="/quiz" className="btn btn-sm">← Testlere dön</Link>
        </nav>

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

        {/* Billing toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '2rem' }} className="anim-up-1">
          <button
            className={`btn btn-sm ${billing === 'monthly' ? 'btn-primary' : ''}`}
            onClick={() => setBilling('monthly')}
          >Aylık</button>
          <button
            className={`btn btn-sm ${billing === 'yearly' ? 'btn-primary' : ''}`}
            onClick={() => setBilling('yearly')}
          >
            Yıllık
            <span style={{
              fontSize: '10px', background: '#dcfce7', color: '#16a34a',
              padding: '2px 6px', borderRadius: '99px', marginLeft: '4px', fontWeight: 600,
            }}>%37 indirim</span>
          </button>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '2.5rem' }} className="anim-up-2">

          {/* Free plan */}
          <div className="card" style={{ position: 'relative' }}>
            {profile?.plan === 'free' && (
              <div className="badge badge-purple" style={{ marginBottom: '1rem' }}>Mevcut planın</div>
            )}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Ücretsiz
            </div>
            <div style={{ fontSize: '36px', fontWeight: 500, marginBottom: '0.25rem' }}>₺0</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>Sonsuza kadar</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                'Ayda 10 test',
                '5-15 soru/test',
                'Türkçe + İngilizce',
                'Temel dashboard',
                'Davet ile premium kazan',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>

            <Link href="/register" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              Ücretsiz başla
            </Link>
          </div>

          {/* Premium plan */}
          <div className="card" style={{ border: '2px solid var(--accent)', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700,
              padding: '4px 14px', borderRadius: '99px', letterSpacing: '0.05em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>En popüler</div>

            {profile?.plan === 'premium' && (
              <div className="badge badge-green" style={{ marginBottom: '1rem' }}>Mevcut planın</div>
            )}

            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Premium
            </div>
            <div style={{ fontSize: '36px', fontWeight: 500, marginBottom: '0.25rem' }}>
              ₺{billing === 'monthly' ? '79' : '50'}
              <span style={{ fontSize: '14px', color: 'var(--text2)', fontWeight: 400 }}>/ay</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>
              {billing === 'yearly' ? 'Yıllık ₺599 (₺949 yerine)' : 'Aylık ödeme'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                'Sınırsız test',
                '5-20 soru/test',
                '5 dil desteği',
                'Detaylı analiz & istatistik',
                'Zayıf konu tespiti',
                'PDF rapor (yakında)',
                'Öncelikli destek',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓</span>
                  {f}
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => router.push('/checkout?plan=' + billing)}
            >
              Premium'a geç →
            </button>
          </div>
        </div>

        {/* Referral section */}
        {profile && (
          <div className="card anim-up-3" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '4px' }}>
                  Arkadaşlarını davet et, premium kazan
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
                  Her 10 kişiyi davet ettiğinde 1 yıl ücretsiz premium kazanırsın.
                </p>
              </div>
              <div className="badge badge-purple" style={{ flexShrink: 0 }}>
                {referralCount} / {nextMilestone} davet
              </div>
            </div>

            {/* Progress */}
            <div className="progress-bar" style={{ marginBottom: '1rem' }}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                readOnly
                value={referralLink}
                style={{ flex: 1, fontSize: '13px', cursor: 'text' }}
              />
              <button className="btn btn-sm" onClick={copyReferral} style={{ flexShrink: 0 }}>
                {copied ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
            </div>

            {referralCount > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--green)', marginTop: '8px' }}>
                {referralCount} kişi davet ettin — {10 - (referralCount % 10)} kişi daha davet et, 1 yıl premium kazan!
              </p>
            )}
          </div>
        )}

        {/* Current usage */}
        {profile?.plan === 'free' && (
          <div className="card-sm anim-up-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Bu ay kullandığın testler</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                {profile.monthly_test_count}/10 test kullanıldı
              </div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 500, color: profile.monthly_test_count >= 8 ? 'var(--red)' : 'var(--text)' }}>
              {10 - profile.monthly_test_count} kaldı
            </div>
          </div>
        )}

        {profile?.plan === 'premium' && profile.plan_expires_at && (
          <div className="card-sm anim-up-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Premium üyeliğin</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                {new Date(profile.plan_expires_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihine kadar aktif
              </div>
            </div>
            <div className="badge badge-green">Aktif</div>
          </div>
        )}
      </div>
    </main>
  )
}
