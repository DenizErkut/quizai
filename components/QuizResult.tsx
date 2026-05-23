'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Question {
  q: string; opts: string[]; ans: number; exp: string
  svg?: string | null; qtype?: 'text' | 'svg'
}

interface YouTubeLink {
  url: string; title: string; channel: string; thumbnail: string
}

interface Props {
  questions: Question[]
  answers: { userAns: number; correct: boolean }[]
  topic: string
  difficulty: string
  language: string
  onNewTest: () => void
  onRetryWrong?: (wrongQuestions: Question[]) => void
  youtubeLinks?: Record<string, YouTubeLink | string>
}

const DIFFICULTIES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  kolay: { label: 'Kolay', color: '#16a34a', bg: 'rgba(22,163,74,0.08)', border: 'rgba(22,163,74,0.3)' },
  normal: { label: 'Normal', color: '#2563eb', bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.3)' },
  zor: { label: 'Zor', color: '#d97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)' },
  'cok zor': { label: 'Çok Zor', color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)' },
}

const SOCIAL_LINKS = [
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/pratiumai?igsh=MWV5ZHV1cDB2b2Fsbw==',
    color: '#E1306C',
    bg: 'rgba(225,48,108,0.08)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    name: 'TikTok',
    url: 'https://www.tiktok.com/@pratiumai',
    color: '#000000',
    bg: 'rgba(0,0,0,0.06)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.78a4.85 4.85 0 01-1.01-.09z"/>
      </svg>
    ),
  },
  {
    name: 'WhatsApp',
    url: 'https://whatsapp.com/channel/0029VbCTl0U002T5jhDZBS2V',
    color: '#25D366',
    bg: 'rgba(37,211,102,0.08)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
  },
]

export default function QuizResult({ questions, answers, topic, difficulty, language, onNewTest, onRetryWrong, youtubeLinks = {} }: Props) {
  const [reportedIdx, setReportedIdx] = useState<Set<number>>(new Set())
  const [reportingIdx, setReportingIdx] = useState<number | null>(null)
  const supabase = createClient() as any

  const finalScore = answers.filter(a => a.correct).length
  const finalPct = Math.round((finalScore / questions.length) * 100)
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normal
  const wrongQuestions = questions.filter((_, i) => !answers[i]?.correct)

  const msg = finalPct === 100 ? 'Mükemmel! Tüm sorular doğru.' :
    finalPct >= 80 ? 'Çok iyi! Konuya hakimsin.' :
    finalPct >= 60 ? 'Fena değil, pratik yaparsan harika olur.' :
    'Tekrar çalışmak isteyebilirsin.'

  function shareResult() {
    const text = `Pratium'da "${topic}" konusunda ${finalPct}% başarı elde ettim! 🎯 Sen de dene: https://pratium.com`
    if (navigator.share) {
      navigator.share({ title: 'Pratium Test Sonucu', text, url: 'https://pratium.com' }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text)
      alert('Sonuç panoya kopyalandı!')
    }
  }

  async function reportError(idx: number) {
    if (reportedIdx.has(idx)) return
    setReportingIdx(idx)
    const q = questions[idx]
    const a = answers[idx]
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('error_reports').insert({
        user_id: user?.id || null,
        question_text: q.q,
        correct_answer: q.opts[q.ans],
        user_answer: q.opts[a?.userAns],
        topic,
        status: 'pending',
      })
      setReportedIdx(prev => new Set([...prev, idx]))
    } catch (e) {
      console.error('Report error:', e)
    } finally {
      setReportingIdx(null)
    }
  }

  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica')
    const margin = 20, pageW = 210, contentW = pageW - margin * 2
    let y = margin

    function cleanText(text: string): string {
      return text
        .replace(/ğ/g,'g').replace(/Ğ/g,'G').replace(/ü/g,'u').replace(/Ü/g,'U')
        .replace(/ş/g,'s').replace(/Ş/g,'S').replace(/ı/g,'i').replace(/İ/g,'I')
        .replace(/ö/g,'o').replace(/Ö/g,'O').replace(/ç/g,'c').replace(/Ç/g,'C')
    }

    function addText(text: string, fontSize: number, bold = false, color = [0,0,0] as [number,number,number], indent = 0) {
      doc.setFontSize(fontSize); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...color)
      const lines = doc.splitTextToSize(cleanText(text), contentW - indent)
      const lineH = fontSize * 0.4
      if (y + lines.length * lineH > 280) { doc.addPage(); y = margin }
      doc.text(lines, margin + indent, y)
      y += lines.length * lineH + 2
    }

    function addLine() {
      doc.setDrawColor(220, 220, 220); doc.line(margin, y, pageW - margin, y); y += 5
    }

    // Logo fetch
    try {
      const logoRes = await fetch('/pratium-logo.png')
      const logoBlob = await logoRes.blob()
      const logoB64 = await new Promise<string>(res => {
        const fr = new FileReader(); fr.onload = () => res((fr.result as string).split(',')[1]); fr.readAsDataURL(logoBlob)
      })
      doc.setFillColor(91, 76, 245); doc.rect(0, 0, pageW, 36, 'F')
      doc.addImage('data:image/png;base64,' + logoB64, 'PNG', margin, 4, 30, 30)
      doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(255,255,255)
      doc.text(cleanText(`Test: ${topic}`), margin + 34, 16)
      doc.text(new Date().toLocaleDateString('tr-TR'), pageW - margin, 16, { align: 'right' })
      y = 46
    } catch {
      y = margin
    }

    addText(`Konu: ${topic}`, 12, true)
    addText(`Zorluk: ${diff.label} | Dil: ${language} | Soru sayisi: ${questions.length}`, 9, false, [100,100,100])
    y += 4
    addText('SORULAR', 13, true, [91, 76, 245])
    addLine()

    questions.forEach((q, i) => {
      if (y > 260) { doc.addPage(); y = margin }
      doc.setFillColor(245, 245, 255); doc.roundedRect(margin, y, contentW, 8, 1, 1, 'F')
      addText(`Soru ${i + 1}`, 10, true, [91, 76, 245])
      y -= 2; addText(q.q, 10, false, [20,20,20]); y += 2
      const letters = ['A','B','C','D']
      q.opts.forEach((opt, oi) => {
        addText(`${letters[oi]}. ${opt}`, 9, false, [60,60,60], 4)
      })
      y += 4; addLine()
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
          <div style={{ fontSize: '28px', color: finalPct >= 60 ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: '4px' }}>%{finalPct}</div>
          <div style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '0.75rem' }}>{msg}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onNewTest} style={{ flex: 1, justifyContent: 'center' }}>⚡ Yeni test</button>
          {wrongQuestions.length > 0 && onRetryWrong && (
            <button className="btn" onClick={() => onRetryWrong(wrongQuestions)}
              style={{ flex: 1, justifyContent: 'center', color: 'var(--red)', borderColor: 'rgba(220,38,38,0.3)', background: 'var(--red-bg)' }}>
              🔁 Yanlışları tekrar çöz ({wrongQuestions.length})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <button className="btn" onClick={shareResult}
            style={{ flex: 1, justifyContent: 'center', color: 'var(--accent)', borderColor: 'rgba(0,149,200,0.3)' }}>
            🔗 Sonucu paylaş
          </button>
          <Link href="/dashboard" className="btn" style={{ flex: 1, justifyContent: 'center' }}>Dashboard</Link>
          <button className="btn" onClick={exportPDF} style={{ justifyContent: 'center', color: 'var(--text2)' }}>
            📄 PDF
          </button>
        </div>
      </div>

      {/* Sosyal medya */}
      <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px', fontWeight: 500 }}>
          Pratium'u takip et — günlük ipuçları ve haberler için
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SOCIAL_LINKS.map(s => (
            <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', background: s.bg, color: s.color, textDecoration: 'none', fontSize: '13px', fontWeight: 500, border: `1px solid ${s.color}22` }}>
              {s.icon}
              {s.name}
            </a>
          ))}
        </div>
      </div>

      {/* Yanlış cevaplar + YouTube */}
      {questions.some((_, i) => !answers[i]?.correct) && (
        <div className="card anim-up-2" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--red)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ✗ Yanlış cevaplar · Kaynak önerileri
          </div>
          {questions.map((q, i) => {
            if (answers[i]?.correct) return null
            const ytLink = youtubeLinks[topic]
            const yt = ytLink ? (typeof ytLink === 'string' ? { url: ytLink, title: topic, channel: '', thumbnail: '' } : ytLink) : null
            return (
              <div key={i} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.15)', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Soru {i + 1}: {q.q}</div>
                <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--red)' }}>✗ Cevabın: {q.opts[answers[i]?.userAns]}</span>
                  {'  ·  '}
                  <span style={{ color: 'var(--green)' }}>✓ Doğru: {q.opts[q.ans]}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '8px' }}>💡 {q.exp}</div>
                {yt && (
                  <a href={yt.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: '#ff0000', textDecoration: 'none', color: '#fff', marginBottom: '8px' }}>
                    {yt.thumbnail && <img src={yt.thumbnail} alt="" style={{ width: 44, height: 33, objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>▶ {yt.title || `${topic} — Konu Anlatımı`}</div>
                      {yt.channel && <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>{yt.channel}</div>}
                    </div>
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tüm cevaplar + hata bildir */}
      <div className="card anim-up-3">
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
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>
                  Doğru: {String.fromCharCode(65 + q.ans)}. {q.opts[q.ans]}
                </div>
                {/* HATA BİLDİR butonu */}
                {reportedIdx.has(i) ? (
                  <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500 }}>
                    ✓ Bildirim gönderildi, teşekkürler!
                  </div>
                ) : (
                  <button
                    onClick={() => reportError(i)}
                    disabled={reportingIdx === i}
                    style={{
                      fontSize: '11px', padding: '3px 10px', borderRadius: '6px', cursor: 'pointer',
                      background: 'none', border: '1px solid rgba(220,38,38,0.25)',
                      color: 'var(--red)', fontFamily: 'var(--font-sans)',
                      opacity: reportingIdx === i ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {reportingIdx === i ? '⏳ Gönderiliyor...' : '⚠ Hata bildir'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
