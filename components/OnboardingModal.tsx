'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface OnboardingModalProps {
  userName: string
  grade: string
  onComplete: () => void
}

const STEPS = [
  {
    id: 1,
    icon: '👋',
    title: 'Pratium\'a Hoş Geldin!',
    color: '#082465',
    gradient: 'linear-gradient(135deg, #082465 0%, #1ECFB8 100%)',
  },
  {
    id: 2,
    icon: '⚡',
    title: 'Hızlı Test Çöz',
    color: '#1ECFB8',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #1ECFB8 100%)',
  },
  {
    id: 3,
    icon: '📊',
    title: 'Gelişimini Takip Et',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #1ECFB8 100%)',
  },
]

export default function OnboardingModal({ userName, grade, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1)
  const [leaving, setLeaving] = useState(false)
  const router = useRouter()
  const supabase = createClient() as any

  const firstName = userName?.split(' ')[0] || 'öğrenci'

  async function completeOnboarding() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id)
      }
    } catch {}
    onComplete()
  }

  function next() {
    if (step < 3) {
      setLeaving(true)
      setTimeout(() => { setStep(s => s + 1); setLeaving(false) }, 200)
    } else {
      completeOnboarding()
    }
  }

  function skip() { completeOnboarding() }

  const currentStep = STEPS[step - 1]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(8,36,101,0.7)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}>
      <div style={{
        background: 'var(--bg)',
        borderRadius: '24px',
        width: '100%', maxWidth: '420px',
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(8,36,101,0.3)',
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'scale(0.97)' : 'scale(1)',
        transition: 'opacity 0.2s, transform 0.2s',
      }}>

        {/* Header gradient */}
        <div style={{
          background: currentStep.gradient,
          padding: '2rem 1.5rem 2.5rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Dekoratif daireler */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ fontSize: '56px', marginBottom: '12px', position: 'relative' }}>{currentStep.icon}</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '6px', position: 'relative' }}>
            {step === 1 ? `Merhaba, ${firstName}!` : currentStep.title}
          </h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', position: 'relative' }}>
            {step === 1 && grade ? grade : ''}
          </p>

          {/* Adım göstergesi */}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px', position: 'relative' }}>
            {STEPS.map(s => (
              <div key={s.id} style={{
                width: step === s.id ? 24 : 8, height: 8, borderRadius: '99px',
                background: step >= s.id ? '#fff' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        </div>

        {/* İçerik */}
        <div style={{ padding: '1.75rem 1.5rem' }}>

          {step === 1 && (
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--primary)', marginBottom: '1rem', textAlign: 'center' }}>
                Pratium nasıl çalışır?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { icon: '⚡', title: 'Konu seç', desc: 'MEB müfredatından ders ve konu seç' },
                  { icon: '🤖', title: 'AI test üretir', desc: 'Yapay zeka sana özel sorular hazırlar' },
                  { icon: '📊', title: 'Gelişimini gör', desc: 'Zayıf konularını analiz et, ilerlemeyi takip et' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(8,36,101,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>{item.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--primary)', marginBottom: '1rem', textAlign: 'center' }}>
                İlk testini nasıl oluşturursun?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { num: '1', text: '"Ders seç" bölümünden dersine tıkla', color: '#082465' },
                  { num: '2', text: 'Açılan listeden bir konu seç', color: '#0ea5e9' },
                  { num: '3', text: '"Test oluştur" butonuna bas', color: '#1ECFB8' },
                  { num: '4', text: '5-10 saniye bekle, sorular hazır!', color: '#7c3aed' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>{item.num}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>{item.text}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'rgba(30,207,184,0.08)', border: '1px solid rgba(30,207,184,0.2)', fontSize: '12px', color: '#0f766e', textAlign: 'center' }}>
                💡 İstersen PDF veya ses dosyası yükleyerek de test oluşturabilirsin
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--primary)', marginBottom: '1rem', textAlign: 'center' }}>
                Seni neler bekliyor?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { icon: '🔥', title: 'Streak', desc: 'Her gün test çöz, serisini koru' },
                  { icon: '🏆', title: 'Sıralama', desc: 'Arkadaşlarınla yarış' },
                  { icon: '📈', title: 'Analiz', desc: 'Zayıf konularını tespit et' },
                  { icon: '🎯', title: 'Rozet', desc: 'Başarılarını koleksiyon yap' },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '12px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>{item.icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)', marginBottom: '2px' }}>{item.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(8,36,101,0.06), rgba(30,207,184,0.06))', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>🎉</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>İlk testini çöz, rozetini kazan!</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Hoş geldin rozeti seni bekliyor</div>
              </div>
            </div>
          )}

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
            <button
              onClick={skip}
              style={{ flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              Atla
            </button>
            <button
              onClick={next}
              style={{
                flex: 2, padding: '11px', borderRadius: '12px', border: 'none',
                background: currentStep.gradient,
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                boxShadow: '0 4px 16px rgba(8,36,101,0.2)',
              }}>
              {step === 3 ? '🚀 İlk Testimi Çöz' : 'Devam →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
