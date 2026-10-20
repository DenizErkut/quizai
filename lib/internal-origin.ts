// Sunucunun kendi API'lerine yaptığı dahili fetch'ler kullanıcının Bearer belirtecini taşır. `Host` başlığı
// sahte olabileceğinden (kendi barındırma) hedef kök yalnızca izinli ana bilgisayarlardan biriyse kullanılır.
const ALLOWED = [/^pratium\.com$/, /^www\.pratium\.com$/, /^pratium\.com\.tr$/, /^www\.pratium\.com\.tr$/, /^[a-z0-9-]+\.vercel\.app$/, /^localhost$/, /^127\.0\.0\.1$/]

export function internalOrigin(requestOrigin: string, fallback = process.env.NEXT_PUBLIC_APP_URL || 'https://pratium.com'): string {
  try {
    const url = new URL(requestOrigin)
    if ((url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') && ALLOWED.some(pattern => pattern.test(url.hostname))) return url.origin
  } catch { /* geçersiz kök */ }
  return fallback.replace(/\/$/, '')
}
