'use client'

import { useState } from 'react'

interface Issue { code: string; severity: 'error' | 'warning'; message: string }
interface Report { generatedAt: string; nodeCount: number; verifiedEdgeCount: number; errorCount: number; warningCount: number; issues: Issue[] }

export default function LearningGraphQuality() {
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-graph-quality')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Graf kalite raporu oluşturulamadı.')
      setReport(data)
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🩺 Learning Graph Kalite Denetimi</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>
      Döngü, kopuk düğüm, mükerrer kayıt ve yanlış ders/sınıf geçişlerini salt okunur olarak denetler.
    </div>
    <button className="btn btn-sm" disabled={busy} onClick={run}>{busy ? 'Denetleniyor…' : 'Kalite denetimini çalıştır'}</button>
    {message && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{message}</div>}
    {report && <div style={{ marginTop: 10, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <strong>{report.nodeCount} düğüm</strong><strong>{report.verifiedEdgeCount} doğrulanmış bağlantı</strong>
        <strong style={{ color: report.errorCount ? '#dc2626' : '#16a34a' }}>{report.errorCount} hata</strong>
        <strong style={{ color: report.warningCount ? '#d97706' : '#16a34a' }}>{report.warningCount} uyarı</strong>
      </div>
      {report.issues.length === 0
        ? <div style={{ color: '#16a34a', marginTop: 8 }}>✓ Graph bütünlük kontrolü temiz.</div>
        : <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>{report.issues.slice(0, 100).map((issue, index) =>
          <div key={`${issue.code}-${index}`} style={{ color: issue.severity === 'error' ? '#dc2626' : '#d97706' }}>
            {issue.severity === 'error' ? '✕' : '⚠'} {issue.message}
          </div>)}
          {report.issues.length > 100 && <div>İlk 100 sorun gösteriliyor; toplam {report.issues.length}.</div>}
        </div>}
    </div>}
  </div>
}
