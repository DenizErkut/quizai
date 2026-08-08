// lib/pending-registration.ts
//
// E-posta onayı ZORUNLU olduğunda, signUp() çağrısı hemen bir session
// döndürmez — kullanıcı e-postadaki linke tıklayana kadar kimlik (TR-PG)
// ve profiles kaydı oluşturulamaz (create-identity, Bearer token gerektirir).
//
// Bu yüzden kayıt formunda toplanan veriyi (ad, yaş, sınıf, okul, KVKK
// rızaları...) signUp() ile TR-PG kaydı arasındaki bekleme süresinde
// tarayıcıda geçici olarak saklıyoruz. Kullanıcı e-postayı onaylayıp
// /auth/complete-profile sayfasına döndüğünde bu veri okunur, TR-PG'ye
// yazılır ve hemen silinir.
//
// NOT — KVKK: Burada saklanan alanlar (ad, yaş, okul vb.) TARAYICIDA,
// yalnızca onay bekleme süresince durur; sunucuya/Supabase'e YAZILMAZ.
// Kalıcı kimlik kaydı yalnızca TR-PG'de (create-identity route) oluşur.
//
// localStorage (sessionStorage değil) kullanıyoruz çünkü kullanıcı çoğu
// zaman onay linkine e-posta uygulamasından YENİ bir sekmede tıklar —
// sessionStorage o sekmede boş olurdu. localStorage aynı tarayıcıdaki
// tüm sekmelerde paylaşılır. Farklı cihaz/tarayıcıdan onaylanırsa (veri
// bulunamazsa) complete-profile sayfası kullanıcıya kısa bir "profili
// tamamla" formu gösterir — veri kaybı yerine zarif bozulma (graceful
// degradation).

const KEY = 'pratium_pending_registration_v1'
const TTL_MS = 48 * 60 * 60 * 1000 // 48 saat — onay linki genelde 24s geçerli, pay bırakıldı

export type PendingRole = 'student' | 'teacher' | 'parent'

export interface PendingRegistration {
  role: PendingRole
  email: string
  fullName: string
  age?: number
  grade?: string
  department?: string
  studentSchool?: string
  classNumber?: string
  institutionCode?: string
  parentEmail?: string
  phone?: string
  sellerId?: string
  kvkkAydinlatma: boolean
  kvkkAcikRiza: boolean
  veliOnayi: boolean
  ref?: string
  next?: string
  savedAt: number
}

export function savePendingRegistration(data: Omit<PendingRegistration, 'savedAt'>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch {
    // localStorage kapalı/dolu olabilir (gizli sekme vb.) — sessizce yut,
    // complete-profile fallback formu devreye girer
  }
}

export function loadPendingRegistration(): PendingRegistration | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: PendingRegistration = JSON.parse(raw)
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearPendingRegistration() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // yoksay
  }
}
