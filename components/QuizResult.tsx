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
    doc.rect(0, 0, pageW, 36, 'F')
    // Pratium logo — base64 embedded
    const logoDataUrl = 'data:image/png;base64,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'
    doc.addImage(logoDataUrl, 'PNG', margin, 4, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.text(cleanText(`Test: ${topic}`), margin + 34, 16)
    doc.text(new Date().toLocaleDateString('tr-TR'), pageW - margin, 16, { align: 'right' })
    doc.text(new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), margin + 34, 24)
    y = 46

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
