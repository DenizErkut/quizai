'use client'
import { Suspense } from 'react'
import LiveContent from './LiveContent'

export default function LivePage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #082465, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid rgba(255,255,255,0.2)', borderTop: '4px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </main>
    }>
      <LiveContent />
    </Suspense>
  )
}
