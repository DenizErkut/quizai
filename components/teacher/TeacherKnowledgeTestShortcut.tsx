'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function TeacherKnowledgeTestShortcut() {
  const pathname = usePathname()
  if (pathname === '/teacher/ai-training') return null

  return (
    <div style={{ background: '#173f52', padding: '10px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>Öğretmen bilgi testine hazır mısınız?</span>
      <Link href="/teacher/ai-training" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '40px', padding: '8px 18px', borderRadius: '10px', background: '#fff', color: '#173f52', fontSize: '14px', fontWeight: 800, textDecoration: 'none', boxShadow: '0 3px 10px rgba(0,0,0,0.15)' }}>
        🎓 Öğretmen Bilgi Testi →
      </Link>
    </div>
  )
}
