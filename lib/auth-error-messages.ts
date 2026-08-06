// lib/auth-error-messages.ts
// Supabase Auth, hata mesajlarını İngilizce döndürür (GoTrue sunucu
// tarafında sabit metinler). Bu fonksiyon en sık karşılaşılan mesajları
// Türkçeye çevirir. Eşleşme bulunamazsa orijinal mesaj aynen döner —
// tamamen bilinmeyen bir hatayı kullanıcıdan gizlemek, hatayı çözmesini
// zorlaştırır.
const KNOWN_ERRORS: { match: RegExp; tr: string }[] = [
  { match: /password is known to be weak and easy to guess/i,
    tr: 'Bu şifre daha önce veri sızıntılarında görülmüş, bilinen ve tahmin edilmesi kolay bir şifre. Lütfen farklı bir şifre seç.' },
  { match: /password should be at least (\d+) characters/i,
    tr: 'Şifre en az 6 karakter olmalı.' },
  { match: /user already registered|already been registered/i,
    tr: 'Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı dene ya da şifreni sıfırla.' },
  { match: /invalid login credentials/i,
    tr: 'E-posta veya şifre hatalı.' },
  { match: /email rate limit exceeded|rate limit/i,
    tr: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika bekleyip tekrar dene.' },
  { match: /signup requires a valid password/i,
    tr: 'Geçerli bir şifre girmelisin.' },
  { match: /unable to validate email address/i,
    tr: 'Geçerli bir e-posta adresi girmelisin.' },
  { match: /email not confirmed/i,
    tr: 'E-posta adresin henüz onaylanmamış. Gelen kutunu (ve spam klasörünü) kontrol et.' },
  { match: /token has expired or is invalid/i,
    tr: 'Bağlantının süresi dolmuş veya geçersiz. Lütfen işlemi baştan başlat.' },
  { match: /new password should be different from the old password/i,
    tr: 'Yeni şifre eski şifreyle aynı olamaz.' },
  { match: /for security purposes, you can only request this after/i,
    tr: 'Güvenlik nedeniyle bu işlemi kısa süre içinde tekrar isteyemezsin. Lütfen biraz bekle.' },
]

export function translateAuthError(message: string | null | undefined): string {
  if (!message) return 'Bilinmeyen bir hata oluştu.'
  for (const { match, tr } of KNOWN_ERRORS) {
    if (match.test(message)) return tr
  }
  return message
}
