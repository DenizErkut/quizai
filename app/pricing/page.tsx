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
}

export default function PricingPage() {
  const router = useRouter()
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [referralCount, setReferralCount] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient() as any
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { count }] = await Promise.all([
        supabase.from('profiles').select('plan, plan_expires_at, referral_code, monthly_test_count').eq('id', user.id).single(),
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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

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
          <button className={`btn btn-sm ${billing === 'monthly' ? 'btn-primary' : ''}`}
            onClick={() => setBilling('monthly')}>Aylık</button>
          <button className={`btn btn-sm ${billing === 'yearly' ? 'btn-primary' : ''}`}
            onClick={() => setBilling('yearly')}>
            Yıllık
            <span style={{ fontSize: '10px', background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: '99px', marginLeft: '4px', fontWeight: 600 }}>%37 indirim</span>
          </button>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '2.5rem' }} className="anim-up-2">

          {/* Free */}
          <div className="card" style={{ position: 'relative' }}>
            {profile?.plan === 'free' && <div className="badge badge-purple" style={{ marginBottom: '1rem' }}>Mevcut planın</div>}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Ücretsiz</div>
            <div style={{ fontSize: '36px', fontWeight: 500, marginBottom: '0.25rem' }}>₺0</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>Sonsuza kadar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
              {['Ayda 10 test', '5-15 soru/test', 'Türkçe + İngilizce', 'Temel dashboard', 'Davet ile premium kazan'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓</span>{f}
                </div>
              ))}
            </div>
            <Link href="/register" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              Ücretsiz başla
            </Link>
          </div>

          {/* Premium */}
          <div className="card" style={{ border: '2px solid var(--accent)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '4px 14px', borderRadius: '99px', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              En popüler
            </div>

            {profile?.plan === 'premium' && <div className="badge badge-green" style={{ marginBottom: '1rem' }}>Mevcut planın ★</div>}

            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Premium</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '36px', fontWeight: 500 }}>₺{billing === 'monthly' ? '79' : '50'}</span>
              <span style={{ fontSize: '13px', color: 'var(--text2)' }}>/ay</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>
              {billing === 'yearly' ? 'Yıllık ₺599 · ₺948 yerine' : 'Aylık ödeme'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
              {['Sınırsız test', '5-20 soru/test', '6 dil desteği', 'PDF/Ses dosyası yükleme', 'Görsel & grafik sorular', 'Detaylı analiz', 'Öncelikli destek'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓</span>{f}
                </div>
              ))}
            </div>

            {profile?.plan === 'premium' ? (
              <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--green-bg)', border: '1px solid rgba(22,163,74,0.2)', fontSize: '13px', color: 'var(--green)', textAlign: 'center' }}>
                ✓ Premium aktif
                {profile.plan_expires_at && (
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>
                    {new Date(profile.plan_expires_at).toLocaleDateString('tr-TR')} kadar
                  </div>
                )}
              </div>
            ) : (
              <Link href={`/checkout?plan=${billing}`} className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
                Premium'a geç →
              </Link>
            )}
          </div>
        </div>

        {/* Referral */}
        {profile && (
          <div className="card anim-up-3" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '4px' }}>🎁 Arkadaşlarını davet et</h2>
                <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
                  Her 10 kişiyi davet ettiğinde <strong>1 yıl ücretsiz premium</strong> kazanırsın.
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
                {referralCount} kişi davet ettin — {10 - (referralCount % 10)} kişi daha davet et, 1 yıl premium kazan!
              </p>
            )}
          </div>
        )}

        {/* Kullanım */}
        {profile?.plan === 'free' && (
          <div className="card-sm anim-up-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Bu ay kullandığın testler</div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>{profile.monthly_test_count}/10 test</div>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 500, color: profile.monthly_test_count >= 8 ? 'var(--red)' : 'var(--text)' }}>
              {10 - profile.monthly_test_count} kaldı
            </div>
          </div>
        )}

        {/* SSS */}
        <div className="card anim-up-4" style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Sık sorulan sorular</div>
          {[
            { q: 'Ödeme güvenli mi?', a: 'Evet. Tüm ödemeler iyzico altyapısıyla SSL koruması altında işlenir. Kart bilgileriniz sitemizde saklanmaz.' },
            { q: 'İptal edebilir miyim?', a: 'Evet, istediğin zaman iptal edebilirsin. Premium süren dolana kadar özelliklerden yararlanmaya devam edersin.' },
            { q: 'Davet ile premium nasıl çalışır?', a: 'Davet linkini paylaş, 10 kişi kayıt olursa 1 yıl ücretsiz premium kazanırsın. Her 10 davette tekrar kazanırsın.' },
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
