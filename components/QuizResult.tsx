'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'

interface Question {
  q: string; opts: string[]; ans: number; exp: string
  svg?: string | null; qtype?: 'text' | 'svg'
}

interface Props {
  questions: Question[]
  answers: { userAns: number; correct: boolean }[]
  topic: string
  difficulty: string
  language: string
  onNewTest: () => void
  youtubeLinks?: Record<string, string>
}

const DIFFICULTIES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  kolay: { label: 'Kolay', color: '#16a34a', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.3)' },
  normal: { label: 'Normal', color: '#2563eb', bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.3)' },
  zor: { label: 'Zor', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  'cok zor': { label: 'Çok Zor', color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
}

export default function QuizResult({ questions, answers, topic, difficulty, language, onNewTest, youtubeLinks = {} }: Props) {
  const finalScore = answers.filter(a => a.correct).length
  const finalPct = Math.round((finalScore / questions.length) * 100)
  const wrongAnswers = questions.filter((_, i) => !answers[i]?.correct)
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal

  const msg = finalPct === 100 ? 'Mükemmel! Tüm sorular doğru.' :
    finalPct >= 80 ? 'Çok iyi! Konuya hakimsin.' :
    finalPct >= 60 ? 'Fena değil, pratik yaparsan harika olur.' :
    'Tekrar çalışmak isteyebilirsin.'

  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    // Font ayarı — Türkçe karakter desteği için latin encoding
    doc.setFont('helvetica')

    const margin = 20
    const pageW = 210
    const contentW = pageW - margin * 2
    let y = margin

    function cleanText(text: string): string {
      return text
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    }

    function addText(text: string, fontSize: number, bold = false, color = [0, 0, 0] as [number, number, number], indent = 0) {
      doc.setFontSize(fontSize)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(...color)
      const lines = doc.splitTextToSize(cleanText(text), contentW - indent)
      const lineH = fontSize * 0.4
      if (y + lines.length * lineH > 280) { doc.addPage(); y = margin }
      doc.text(lines, margin + indent, y)
      y += lines.length * lineH + 2
    }

    function addLine() {
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y, pageW - margin, y)
      y += 5
    }

    // ── HEADER ──
    doc.setFillColor(91, 76, 245)
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Pratium', margin, 16)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(cleanText(`Test: ${topic}`), margin, 22)
    doc.text(new Date().toLocaleDateString('tr-TR'), pageW - margin, 22, { align: 'right' })
    y = 38

    // ── BİLGİ ──
    addText(`Konu: ${topic}`, 12, true)
    addText(`Zorluk: ${diff.label} | Dil: ${language} | Soru sayisi: ${questions.length}`, 9, false, [100, 100, 100])
    y += 4

    // ── SORULAR ──
    addText('SORULAR', 13, true, [91, 76, 245])
    addLine()

    questions.forEach((q, i) => {
      if (y > 260) { doc.addPage(); y = margin }

      // Soru numarası ve metni
      doc.setFillColor(245, 245, 255)
      doc.roundedRect(margin, y, contentW, 8, 1, 1, 'F')
      addText(`Soru ${i + 1}`, 10, true, [91, 76, 245])
      y -= 2
      addText(q.q, 10, false, [20, 20, 20])
      y += 2

      // Şıklar — sadece harf ve metin, doğru cevap işaretlenmez
      const letters = ['A', 'B', 'C', 'D']
      q.opts.forEach((opt, oi) => {
        addText(`${letters[oi]}. ${opt}`, 9, false, [60, 60, 60], 4)
      })

      y += 4
      addLine()
    })

    doc.save(`Pratium_${cleanText(topic)}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  return (
    <div>
      {/* Skor kartı */}
      <div className="card anim-up" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="badge badge-purple">Test tamamlandı</div>
          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`, fontWeight: 600 }}>
            {diff.label}
          </span>
        </div>

        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div className="serif" style={{ fontSize: '64px', lineHeight: 1 }}>
            {finalScore}<span style={{ fontSize: '32px', color: 'var(--text2)' }}>/{questions.length}</span>
          </div>
          <div style={{ fontSize: '28px', color: finalPct >= 60 ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: '4px' }}>
            %{finalPct}
          </div>
          <div style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '0.75rem' }}>{msg}</div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onNewTest} style={{ flex: 1, justifyContent: 'center' }}>
            Yeni test
          </button>
          <Link href="/dashboard" className="btn" style={{ flex: 1, justifyContent: 'center' }}>
            Dashboard
          </Link>
          <button className="btn" onClick={exportPDF}
            style={{ flex: 1, justifyContent: 'center', gap: '6px', color: 'var(--accent)', borderColor: 'rgba(91,76,245,0.3)' }}>
            📄 PDF indir
          </button>
        </div>
      </div>

      {/* Yanlış cevaplar + YouTube */}
      {wrongAnswers.length > 0 && (
        <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--red)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ✗ Yanlış cevaplar · Kaynak önerileri
          </div>
          {questions.map((q, i) => {
            if (answers[i]?.correct) return null
            const ytLink = youtubeLinks[topic]
            return (
              <div key={i} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.15)', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Soru {i + 1}: {q.q}
                </div>
                <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--red)' }}>✗ Cevabın: {q.opts[answers[i]?.userAns]}</span>
                  {'  ·  '}
                  <span style={{ color: 'var(--green)' }}>✓ Doğru: {q.opts[q.ans]}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '8px' }}>
                  💡 {q.exp}
                </div>
                {ytLink && (
                  <a href={ytLink} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '5px 10px', borderRadius: '6px', background: '#ff0000', color: '#fff', textDecoration: 'none', fontWeight: 500 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-2.75 12.21 12.21 0 0 0-7.64 0A4.83 4.83 0 0 1 4.41 6.69C3.28 8.38 3 10.44 3 12s.28 3.62 1.41 5.31a4.83 4.83 0 0 1 3.77 2.75 12.21 12.21 0 0 0 7.64 0 4.83 4.83 0 0 1 3.77-2.75C20.72 15.62 21 13.56 21 12s-.28-3.62-1.41-5.31zM10 15.5v-7l6 3.5-6 3.5z"/>
                    </svg>
                    YouTube'da izle — {topic}
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tüm cevaplar özeti */}
      <div className="card anim-up-2">
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Cevap özeti
        </div>
        {questions.map((q, i) => (
          <div key={i} style={{ padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: answers[i]?.correct ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                {answers[i]?.correct ? '✓' : '✗'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>{q.q}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                  Doğru: {String.fromCharCode(65 + q.ans)}. {q.opts[q.ans]}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
