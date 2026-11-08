'use client'
import Link from 'next/link'
import AusQuestionPool from '@/components/AusQuestionPool'

// Onaylı öğretmenler için AUS (açık uçlu soru) havuzu incelemesi.
export default function TeacherAusPoolPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
          <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: 13, textDecoration: 'none' }}>← Panel</Link>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🧩 AUS soruları</h1>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: '1rem' }}>Açık uçlu bölümünde üretilen ve kaydedilen sorular burada toplanır. Uygun olanları onaylayın, uygun olmayanları reddedin.</p>
        <AusQuestionPool />
      </div>
    </main>
  )
}
