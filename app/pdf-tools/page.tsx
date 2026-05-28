'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Tool = 'to-word' | 'compress' | null

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PdfToolsPage() {
  const [selectedTool, setSelectedTool] = useState<Tool>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; reduction?: number; originalSize?: number; compressedSize?: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient() as any

  function handleFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setResult({ success: false, message: 'Yalnızca PDF dosyaları kabul edilir.' })
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setResult({ success: false, message: `Dosya çok büyük (${formatBytes(f.size)}). Maks. 20MB.` })
      return
    }
    setFile(f)
    setResult(null)
  }

  async function process() {
    if (!file || !selectedTool) return
    setLoading(true)
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('action', selectedTool)

      const res = await fetch('/api/pdf-tools', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.error === 'pdf_image_only') {
          setResult({ success: false, message: 'Bu PDF taranmış görsel içeriyor — metin çıkarılamadı. Önce OCR işlemi yapmanız gerekiyor.' })
        } else {
          setResult({ success: false, message: `${err.message || err.error || 'İşlem başarısız.'} ${err.detail ? `(${err.detail})` : ''}` })
        }
        return
      }

      // Dosyayı indir
      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') || ''
      const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/)
      const downloadName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : (selectedTool === 'to-word' ? file.name.replace('.pdf', '.docx') : file.name.replace('.pdf', '-kucuk.pdf'))

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      a.click()
      URL.revokeObjectURL(url)

      const originalSize = parseInt(res.headers.get('X-Original-Size') || '0')
      const compressedSize = parseInt(res.headers.get('X-Compressed-Size') || '0')
      const reduction = parseInt(res.headers.get('X-Reduction-Percent') || '0')

      setResult({
        success: true,
        message: selectedTool === 'to-word'
          ? `✅ "${downloadName}" başarıyla oluşturuldu ve indirildi!`
          : `✅ PDF küçültüldü ve indirildi! ${reduction > 0 ? `%${reduction} daha küçük (${formatBytes(originalSize)} → ${formatBytes(compressedSize)})` : 'Dosya zaten optimize edilmiş.'}`,
        reduction,
        originalSize,
        compressedSize,
      })
    } catch (e: any) {
      setResult({ success: false, message: e?.message || 'Bağlantı hatası.' })
    }
    setLoading(false)
  }

  const tools = [
    {
      key: 'to-word' as Tool,
      icon: '📄',
      title: 'PDF → Word',
      desc: 'PDF\'ini Word (.docx) dosyasına çevir. Ders notlarını düzenle, quiz için hazırla.',
      color: '#2563eb',
      bg: 'rgba(37,99,235,0.06)',
      border: 'rgba(37,99,235,0.2)',
      tips: ['Metin tabanlı PDF\'ler için idealdir', 'Taranan (görsel) PDF\'ler desteklenmez', 'Sonucu quiz sayfasına yükleyebilirsin'],
    },
    {
      key: 'compress' as Tool,
      icon: '🗜️',
      title: 'PDF Küçült',
      desc: 'Büyük PDF dosyalarını sıkıştır. Ders kitaplarını Pratium\'a kolayca yükle.',
      color: '#16a34a',
      bg: 'rgba(22,163,74,0.06)',
      border: 'rgba(22,163,74,0.2)',
      tips: ['Görsel ağırlıklı PDF\'lerde daha etkili', '20MB üstü dosyalar için önerilir', 'Kalite kaybı olmadan sıkıştırır'],
    },
  ]

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/quiz" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'inline-block', marginBottom: '12px' }}>← Teste dön</Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>
            🛠️ PDF Araçları
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Ders notlarını dönüştür, büyük PDF\'leri küçült.</p>
        </div>

        {/* Araç seçimi */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
          {tools.map(t => (
            <button key={t.key} onClick={() => { setSelectedTool(t.key); setFile(null); setResult(null) }}
              style={{ padding: '18px 16px', borderRadius: '16px', border: `2px solid ${selectedTool === t.key ? t.color : t.border}`, background: selectedTool === t.key ? t.bg : 'var(--bg)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', transition: 'all 0.15s', boxShadow: selectedTool === t.key ? `0 4px 20px ${t.bg}` : 'none' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{t.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: selectedTool === t.key ? t.color : 'var(--primary)', marginBottom: '4px' }}>{t.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {/* Seçili araç */}
        {selectedTool && (
          <div className="card anim-up">
            {/* İpuçları */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {tools.find(t => t.key === selectedTool)?.tips.map((tip, i) => (
                <span key={i} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                  💡 {tip}
                </span>
              ))}
            </div>

            {/* Dosya yükleme alanı */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : file ? 'var(--green)' : 'var(--border)'}`, borderRadius: '14px', padding: '2.5rem 1.5rem', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--accent-bg)' : file ? 'var(--green-bg)' : 'var(--bg2)', transition: 'all 0.2s', marginBottom: '1rem' }}>
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {file ? (
                <div>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--green)', marginBottom: '4px' }}>{file.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{formatBytes(file.size)} · Değiştirmek için tıkla</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '40px', marginBottom: '10px' }}>📁</div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>PDF dosyasını sürükle veya tıkla</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Maks. 20MB · Yalnızca .pdf</div>
                </div>
              )}
            </div>

            {/* İşlem butonu */}
            <button onClick={process} disabled={!file || loading}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', background: file && !loading ? (selectedTool === 'to-word' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'linear-gradient(135deg, #16a34a, #15803d)') : 'var(--bg2)', color: file && !loading ? '#fff' : 'var(--text4)', border: 'none', fontSize: '15px', fontWeight: 700, cursor: file && !loading ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.15s' }}>
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                  İşleniyor...
                </>
              ) : (
                selectedTool === 'to-word' ? '📄 Word\'e Dönüştür & İndir' : '🗜️ PDF\'i Küçült & İndir'
              )}
            </button>

            {/* Sonuç */}
            {result && (
              <div style={{ marginTop: '1rem', padding: '14px 16px', borderRadius: '12px', background: result.success ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${result.success ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
                <div style={{ fontSize: '13px', color: result.success ? 'var(--green)' : 'var(--red)', fontWeight: 600, lineHeight: 1.6 }}>
                  {result.message}
                </div>
                {result.success && selectedTool === 'to-word' && (
                  <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', fontSize: '12px', color: '#2563eb' }}>
                    💡 <strong>Sonraki adım:</strong> İndirilen .docx dosyasını{' '}
                    <Link href="/quiz" style={{ color: '#2563eb', fontWeight: 700 }}>Test sayfasında</Link>{' '}
                    yükleyerek otomatik quiz oluşturabilirsin!
                  </div>
                )}
                {!result.success && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>
                    Sorun devam ediyorsa{' '}
                    <a href="https://bigconvert.11zon.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      bigconvert.11zon.com
                    </a>
                    'u deneyin.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Alt bilgi */}
        {!selectedTool && (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem', background: 'linear-gradient(135deg, rgba(8,36,101,0.03), rgba(30,207,184,0.03))', border: '1.5px dashed var(--border)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🛠️</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', marginBottom: '6px' }}>Bir araç seçerek başla</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.6 }}>
              PDF'lerini dönüştür ve Pratium'da daha kolay çalış.
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
