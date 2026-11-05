'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { useT } from '@/lib/i18n/I18nProvider'

// Kayıt tamamlanmadan giriş yapan öğrenciye (kimlik kaydı ve sınıf yok) "profilinizi tamamlayınız" uyarısı gösterir;
// "Tamam" profil düzenleme sayfasına götürür. Tipik neden: e-posta onay bağlantısı başka bir tarayıcıda açıldığı için
// kayıt formundaki veri bulunamadı. Uyarı tarayıcı oturumu başına bir kez çıkar; zorlayıcı yönlendirme yoktur.
const EXEMPT_PREFIXES = ['/auth', '/login', '/register', '/profile', '/privacy', '/kvkk', '/cookie-policy', '/terms', '/api']
const SEEN_KEY = 'pratium_profile_prompt_seen'

export default function IdentityGuard() {
  const { loading, identityMissing } = useUser()
  const { t } = useT()
  const pathname = usePathname() || ''
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const exempt = pathname === '/' || EXEMPT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
  useEffect(() => {
    if (loading || !identityMissing || exempt) return
    let seen = false
    try { seen = sessionStorage.getItem(SEEN_KEY) === '1' } catch { /* gizli sekme */ }
    if (seen) return
    const timer = window.setTimeout(() => setOpen(true), 0)
    return () => window.clearTimeout(timer)
  }, [loading, identityMissing, exempt])

  if (!open) return null
  function confirm() {
    try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* gizli sekme */ }
    setOpen(false)
    router.push('/profile/edit')
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="profile-prompt-title" style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(10,20,16,.55)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
        <h2 id="profile-prompt-title" style={{ fontSize: 19, fontWeight: 800, marginBottom: 8, color: 'var(--primary)' }}>{t('Lütfen profilinizi tamamlayınız')}</h2>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>{t('Kaydınız tamamlanmamış görünüyor. Ad soyad, sınıf, konum ve T.C. Kimlik No bilgilerinizi profil sayfasından girmeniz gerekiyor.')}</p>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={confirm}>{t('Tamam')}</button>
      </div>
    </div>
  )
}
