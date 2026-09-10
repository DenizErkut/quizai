'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Evidence = 'low_mastery' | 'low_retention' | 'long_inactivity' | 'declining_trend' | 'learning_stuck'

type LearningRisk = {
  subject: string
  topic: string
  score: number
  level: 'high' | 'medium'
  evidence: Evidence[]
  predicted_success_pct: number
  learning_stuck: boolean
}

const EVIDENCE_LABELS: Record<Evidence, string> = {
  low_mastery: 'Bu konuda temel eksikler görünüyor.',
  low_retention: 'Bilgilerin kalıcılığı düşüyor.',
  long_inactivity: 'Bu konu uzun süredir tekrar edilmedi.',
  declining_trend: 'Son performansın düşüş eğiliminde.',
  learning_stuck: 'Tekrara rağmen ilerleme sınırlı; farklı bir çalışma biçimi yararlı olabilir.',
}

export default function LearningRiskCard() {
  const [risk, setRisk] = useState<LearningRisk | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const response = await fetch('/api/student/learning-risk', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) return
      const data = await response.json() as { risks?: LearningRisk[] }
      setRisk(data.risks?.[0] ?? null)
    }
    void load()
  }, [])

  if (!risk) return null

  const href = `/quiz?subject=${encodeURIComponent(risk.subject)}&topic=${encodeURIComponent(risk.topic)}`
  const reason = risk.evidence.map(item => EVIDENCE_LABELS[item]).filter(Boolean).slice(0, 2).join(' ')

  return (
    <section style={{ marginBottom: '1rem', padding: '16px', borderRadius: '16px', background: risk.level === 'high' ? '#fff3ef' : '#fff9e9', border: `1px solid ${risk.level === 'high' ? '#f0cfc5' : '#eadcae'}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#a54d39', textTransform: 'uppercase' }}>
        {risk.level === 'high' ? 'Yüksek öncelik' : 'Tekrar önerisi'}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#4f332c', marginTop: 5 }}>Unutmadan tekrar et: {risk.topic}</div>
      <div style={{ fontSize: 12, color: '#725a52', marginTop: 5 }}>{reason || 'Kısa bir tekrar bu konuyu güçlendirmene yardımcı olur.'}</div>
      <div style={{ fontSize: 11, color: '#725a52', marginTop: 5 }}>Bir sonraki çalışmada beklenen başarı: %{risk.predicted_success_pct}</div>
      <Link href={href} style={{ display: 'inline-block', marginTop: 12, borderRadius: 10, padding: '8px 12px', background: '#d9533f', color: '#fff', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>
        Bu konuyu çalış →
      </Link>
    </section>
  )
}
