'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface ReferralUser {
  id: string
  name: string
  grade: string
  created_at: string
}

interface Profile {
  name: string
  plan: string
  plan_expires_at: string | null
  referral_code: string
  monthly_test_count: number
}

export default function ReferralPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [referrals, setReferrals] = useState<ReferralUser[]>([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, { data: refs }] = await Promise.all([
        supabase.from('profiles')
          .select('name, plan, plan_expires_at, referral_code, monthly_test_count')
          .eq('id', user.id).single(),
        supabase.from('referrals')
          .select('referred_id, created_at, profiles!referrals_referred_id_fkey(name, grade)')
          .eq('referrer_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      setProfile(p)
      setReferrals((refs || []).map((r: any) => ({
        id: r.referred_id,
        name: r.profiles?.name || 'Kullanıcı',
        grade: r.profiles?.grade || '',
        created_at: r.created_at,
      })))
      setLoading(false)
    }
    load()
  }, [])

  function copyLink() {
    if (!profile?.referral_code) return
    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${profile.referral_code}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function shareWhatsApp() {
    const link = `${window.location.origin}/register?ref=${profile?.referral_code}`
    const text = `QuizAI'yi denedin mi? Sınıfına ve konuna özel AI destekli testler! Davet linkimle ücretsiz kayıt ol: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function shareTwitter() {
    const link = `${window.location.origin}/register?ref=${profile?.referral_code}`
    const text = `AI destekli soru bankası @QuizAI ile öğrenmek çok kolay! Davet linkimle kayıt ol:`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`, '_blank')
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  const totalReferrals = referrals.length
  const currentProgress = totalReferrals % 10
  const completedCycles = Math.floor(totalReferrals / 10)
  const nextMilestone = (completedCycles + 1) * 10
  const progressPct = (currentProgress / 10) * 100
  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://quizai-coral.vercel.app'}/register?ref=${profile?.referral_code}`

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        {/* Header */}
        <div className="anim-up" style={{ marginBottom: '2rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Davet Programı</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>
            Arkadaşlarını davet et
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.6 }}>
            Her 10 kişiyi davet ettiğinde <strong>1 yıl ücretsiz premium</strong> kazanırsın.
            Premium üyeliğin birikiyor — ne kadar çok davet, o kadar çok premium!
          </p>
        </div>

        {/* İlerleme */}
        <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' }}>İlerleme</div>
              <div className="serif" style={{ fontSize: '36px', lineHeight: 1 }}>
                {currentProgress}
                <span style={{ fontSize: '18px', color: 'var(--text2)' }}>/10</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                {10 - currentProgress} kişi daha → 1 yıl premium
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {completedCycles > 0 && (
                <div className="badge badge-green" style={{ marginBottom: '8px', display: 'block' }}>
                  {completedCycles} yıl kazanıldı! 🎉
                </div>
              )}
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                Toplam {totalReferrals} davet
              </div>
              {profile?.plan === 'premium' && profile.plan_expires_at && (
                <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '4px' }}>
                  Premium: {new Date(profile.plan_expires_at).toLocaleDateString('tr-TR')} kadar
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--text3)' }}>
              <span>{currentProgress} davet</span>
              <span>{nextMilestone} davette 1 yıl premium</span>
            </div>
          </div>

          {/* Milestone'lar */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[10, 20, 30, 50].map(milestone => (
              <div key={milestone} style={{
                flex: 1, padding: '8px', borderRadius: '8px', textAlign: 'center',
                background: totalReferrals >= milestone ? 'var(--green-bg)' : 'var(--bg2)',
                border: `1px solid ${totalReferrals >= milestone ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: '14px', marginBottom: '2px' }}>
                  {totalReferrals >= milestone ? '✅' : '🎯'}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: totalReferrals >= milestone ? 'var(--green)' : 'var(--text3)' }}>
                  {milestone} davet
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                  {milestone / 10} yıl
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Davet linki */}
        <div className="card anim-up-2" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Davet linkin
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input className="input" readOnly value={referralLink} style={{ fontSize: '12px', flex: 1 }} />
            <button className="btn btn-sm" onClick={copyLink} style={{ flexShrink: 0, minWidth: '90px' }}>
              {copied ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
          </div>

          {/* Paylaşım butonları */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={shareWhatsApp}
              style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(37,211,102,0.08)', color: '#128C7E', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </button>
            <button onClick={shareTwitter}
              style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid rgba(29,161,242,0.3)', background: 'rgba(29,161,242,0.08)', color: '#1DA1F2', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              X (Twitter)
            </button>
          </div>
        </div>

        {/* Nasıl çalışır */}
        <div className="card anim-up-3" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Nasıl çalışır?
          </div>
          {[
            { icon: '🔗', title: 'Linki paylaş', desc: 'Davet linkini kopyala, WhatsApp, Instagram veya doğrudan arkadaşına gönder.' },
            { icon: '👤', title: 'Arkadaşın kayıt olsun', desc: 'Linkten giren her kullanıcı senin davetinden kayıt olmuş sayılır.' },
            { icon: '🎁', title: 'Her 10 davette ödül', desc: '10 kişi kayıt olduğunda 1 yıl ücretsiz premium otomatik eklenir. 20 davette 2 yıl, 30 davette 3 yıl!' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontSize: '24px', flexShrink: 0 }}>{step.icon}</div>
              <div>
                <div style={{ fontWeight: 500, marginBottom: '3px' }}>{step.title}</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Davet listesi */}
        {referrals.length > 0 && (
          <div className="card anim-up-4">
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
              Davet ettiğin kişiler ({referrals.length})
            </div>
            {referrals.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 600, fontSize: '12px' }}>
                    {r.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{r.grade}</div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  {new Date(r.created_at).toLocaleDateString('tr-TR')}
                </div>
              </div>
            ))}
          </div>
        )}

        {referrals.length === 0 && (
          <div className="card anim-up-4" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '0.75rem' }}>👋</div>
            <div style={{ fontWeight: 500, marginBottom: '6px' }}>Henüz kimseyi davet etmedin</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1.25rem' }}>
              Davet linkini paylaşmaya başla!
            </div>
            <button className="btn btn-primary btn-sm" onClick={copyLink}>
              Linki kopyala
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
