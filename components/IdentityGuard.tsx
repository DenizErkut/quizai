'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'

// Kayıt tamamlanmadan giriş yapan öğrenciyi (kimlik kaydı ve sınıf yok) profil tamamlama formuna yönlendirir.
// Tipik neden: e-posta onay bağlantısı başka bir tarayıcıda/uygulamada açıldığı için forma yazılan veri bulunamadı
// ve kullanıcı formu doldurmadan doğrudan giriş yaptı.
const EXEMPT_PREFIXES = ['/auth', '/login', '/register', '/privacy', '/kvkk', '/cookie-policy', '/terms', '/api']

export default function IdentityGuard() {
  const { loading, identityMissing } = useUser()
  const pathname = usePathname() || ''
  const router = useRouter()
  useEffect(() => {
    if (loading || !identityMissing) return
    if (pathname === '/' || EXEMPT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))) return
    router.replace('/auth/complete-profile')
  }, [loading, identityMissing, pathname, router])
  return null
}
