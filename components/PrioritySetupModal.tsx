'use client'
// components/PrioritySetupModal.tsx
//
// 19 Eylül 2026 — Deniz'in isteği: sabit "10 soruluk genel test" yerine
// düşük sürtünmeli, ama daha isabetli bir başlangıç. Bu modal OnboardingModal
// (tanıtım turu) bittikten hemen sonra, öğrencinin ilk konu seçiminden ÖNCE
// gösteriliyor (bkz. app/quiz/page.tsx). ~15 saniyelik, tamamen chip-tabanlı
// (yazı yok), her zaman "Atla"lanabilir bir akış:
//   1) Hedef sınav (LGS/TYT-AYT/KPSS/Sadece pratik) — tek seçim
//   2) En fazla 2 öncelik ders (sınıfa göre lib/subject-map-grade.ts'ten)
//   3) Seçilen her ders için Zayıf/Orta/İyi öz-değerlendirme
//
// Bu veri profiles.target_exam / profiles.priority_subjects'e yazılıyor ve
// SADECE bir "tohum" olarak kullanılıyor: app/api/generate-quiz/route.ts,
// bu derste henüz gerçek mastery kanıtı yokken başlangıç zorluğunu buradan
// seçiyor (bkz. lib/onboarding-priorities.ts) — var olan adaptif/tanılayıcı
// motorun (lib/adaptive-difficulty.ts, lib/diagnostic-question-strategy.ts)
// YERİNE değil, ONUN başlangıç noktasını iyileştirmek için. Yani öğrenci bu
// ekranı atlarsa ya da yanlış öz-değerlendirirse hiçbir şey bozulmaz —
// sistem eskisi gibi nötr "normal" zorlukla başlar ve birkaç soruda kendini
// gerçek cevaplara göre kalibre eder.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSubjectsForGrade } from '@/lib/subject-map-grade'
import type { SelfReportLevel } from '@/lib/onboarding-priorities'

interface PrioritySetupModalProps {
  grade: string
  onComplete: () => void
}

const EXAM_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'LGS', label: 'LGS', icon: '📘' },
  { value: 'TYT_AYT', label: 'TYT / AYT', icon: '🎯' },
  { value: 'KPSS', label: 'KPSS', icon: '📚' },
  { value: 'yok', label: 'Sadece pratik yapıyorum', icon: '✨' },
]

const SELF_REPORT_OPTIONS: { value: SelfReportLevel; label: string }[] = [
  { value: 'zayif', label: 'Zayıf' },
  { value: 'orta', label: 'Orta' },
  { value: 'iyi', label: 'İyi' },
]

const MAX_PRIORITY_SUBJECTS = 2

export default function PrioritySetupModal({ grade, onComplete }: PrioritySetupModalProps) {
  const [step, setStep] = useState<'exam' | 'subjects'>('exam')
  const [leaving, setLeaving] = useState(false)
  const [targetExam, setTargetExam] = useState<string | null>(null)
  const [selfReports, setSelfReports] = useState<Record<string, SelfReportLevel>>({})
  const [saving, setSaving] = useState(false)
  const supabase = createClient() as any

  const subjects = Object.keys(getSubjectsForGrade(grade))
  const selectedSubjects = Object.keys(selfReports)

  function toggleSubject(subject: string) {
    setSelfReports(current => {
      if (current[subject]) {
        const next = { ...current }
        delete next[subject]
        return next
      }
      if (Object.keys(current).length >= MAX_PRIORITY_SUBJECTS) return current
      return { ...current, [subject]: 'orta' }
    })
  }

  function setSelfReport(subject: string, level: SelfReportLevel) {
    setSelfReports(current => ({ ...current, [subject]: level }))
  }

  async function persist(examValue: string | null, subjectsValue: Record<string, SelfReportLevel>) {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const priority_subjects = Object.entries(subjectsValue).map(([subject, self_report]) => ({ subject, self_report }))
        await supabase.from('profiles').update({
          target_exam: examValue,
          priority_subjects: priority_subjects.length > 0 ? priority_subjects : null,
        }).eq('id', user.id)
      }
    } catch {}
    setSaving(false)
    onComplete()
  }

  function goToSubjects() {
    setLeaving(true)
    setTimeout(() => { setStep('subjects'); setLeaving(false) }, 200)
  }

  function skipAll() { void persist(null, {}) }
  function finish() { void persist(targetExam, selfReports) }

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
        width: '100%', maxWidth: '440px',
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(8,36,101,0.3)',
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'scale(0.97)' : 'scale(1)',
        transition: 'opacity 0.2s, transform 0.2s',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #1ECFB8 100%)',
          padding: '2rem 1.5rem 2.5rem',
          textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ fontSize: '48px', marginBottom: '10px', position: 'relative' }}>{step === 'exam' ? '🎯' : '📊'}</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '6px', position: 'relative' }}>
            {step === 'exam' ? 'Hedefin ne?' : 'Nereden başlayalım?'}
          </h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', position: 'relative' }}>
            {step === 'exam' ? 'Sana en uygun yaklaşımı seçelim — 15 saniye sürer' : 'En fazla 2 ders seç, sana özel başlayalım'}
          </p>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px', position: 'relative' }}>
            {['exam', 'subjects'].map(s => (
              <div key={s} style={{
                width: step === s ? 24 : 8, height: 8, borderRadius: '99px',
                background: step === s || (s === 'exam' && step === 'subjects') ? '#fff' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        </div>

        <div style={{ padding: '1.75rem 1.5rem' }}>
          {step === 'exam' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {EXAM_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => setTargetExam(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px',
                    borderRadius: '14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    border: `1.5px solid ${targetExam === opt.value ? '#7c3aed' : 'var(--border)'}`,
                    background: targetExam === opt.value ? 'rgba(124,58,237,0.08)' : 'var(--bg2)',
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: '22px' }}>{opt.icon}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'subjects' && (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: selectedSubjects.length > 0 ? '1rem' : 0 }}>
                {subjects.map(subject => {
                  const active = !!selfReports[subject]
                  const disabled = !active && selectedSubjects.length >= MAX_PRIORITY_SUBJECTS
                  return (
                    <button key={subject}
                      onClick={() => !disabled && toggleSubject(subject)}
                      disabled={disabled}
                      style={{
                        padding: '9px 14px', borderRadius: '99px', fontSize: '12.5px', fontWeight: 600,
                        cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--font-sans)',
                        border: `1.5px solid ${active ? '#7c3aed' : 'var(--border)'}`,
                        background: active ? 'rgba(124,58,237,0.1)' : 'var(--bg2)',
                        color: active ? '#7c3aed' : disabled ? 'var(--text3)' : 'var(--text2)',
                        opacity: disabled ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}>
                      {subject}
                    </button>
                  )
                })}
              </div>

              {selectedSubjects.map(subject => (
                <div key={subject} style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--primary)', marginBottom: '7px' }}>{subject}'de kendini nasıl görüyorsun?</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {SELF_REPORT_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => setSelfReport(subject, opt.value)}
                        style={{
                          flex: 1, padding: '7px', borderRadius: '9px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          border: `1.5px solid ${selfReports[subject] === opt.value ? '#7c3aed' : 'var(--border)'}`,
                          background: selfReports[subject] === opt.value ? '#7c3aed' : 'var(--bg)',
                          color: selfReports[subject] === opt.value ? '#fff' : 'var(--text2)',
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
            <button onClick={skipAll} disabled={saving}
              style={{ flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              Atla
            </button>
            {step === 'exam' ? (
              <button onClick={goToSubjects} disabled={!targetExam}
                style={{
                  flex: 2, padding: '11px', borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #1ECFB8 100%)',
                  color: '#fff', fontSize: '13px', fontWeight: 700, cursor: targetExam ? 'pointer' : 'default',
                  fontFamily: 'var(--font-sans)', opacity: targetExam ? 1 : 0.5,
                }}>
                Devam →
              </button>
            ) : (
              <button onClick={finish} disabled={saving}
                style={{
                  flex: 2, padding: '11px', borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #1ECFB8 100%)',
                  color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>
                {saving ? 'Kaydediliyor…' : '🚀 Hazırım'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
