'use client'
import { useState, type ReactNode } from 'react'

// Açılan pencerede alt alta iki bölüm: "verilen yanıt" ve "verilmesi gereken en olası yanıt".
// Başlığa tıklayınca ilgili bölüm ekranda açılır (ikisi birlikte de açık olabilir).
export default function AnswerSections({ sections }: { sections: Array<{ key: string; label: string; content: ReactNode }> }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {sections.map(section => {
        const expanded = !!open[section.key]
        return (
          <div key={section.key} style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
            <button type="button" aria-expanded={expanded} onClick={() => setOpen(prev => ({ ...prev, [section.key]: !prev[section.key] }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: expanded ? 'var(--accent-bg)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13.5, color: 'inherit' }}>
              <span style={{ flex: 1 }}>{section.label}</span>
              <span aria-hidden style={{ fontSize: 11, color: 'var(--text3)' }}>{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>{section.content}</div>}
          </div>
        )
      })}
    </div>
  )
}
