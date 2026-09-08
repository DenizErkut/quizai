// lib/verify-gemini.ts
// Gemini ile bağımsız soru kalite/doğruluk kontrolü. Bu, Claude'un ürettiği
// soruları farklı bir modelin (OpenAI'nin matematik odaklı kontrolüne ek
// olarak) genel olarak gözden geçirdiği üçüncü bağımsız katman.
//
// 6 Eylül 2026 — Deniz'in bulduğu ÖNEMLİ DÜZELTME: Bu dosyadaki eski yorum
// "GEMINI_API_KEY henüz Vercel'e eklenmediği sürece..." YANLIŞTI/BAYATTI.
// Deniz hem Vercel ortam değişkenlerini hem Google AI Studio'yu kontrol etti:
// ANAHTAR GERÇEKTEN TANIMLI (29 Mayıs'tan beri) — ama API'deki KREDİ/KOTA
// TÜKENMİŞ. Ben (Claude) bu eski yorum satırına güvenip "anahtar eksik"
// diye YANLIŞ teşhis koymuştum — kodun GERÇEK davranışını (aşağıdaki
// `if (!res.ok) return null` satırı) kontrol etmeden. Bu satır, API HERHANGİ
// BİR SEBEPLE hata döndüğünde (kota, geçersiz anahtar, ağ, vb.) `logGeminiUsage`
// çağrısına HİÇ ULAŞMADAN sessizce çıkıyordu — bu yüzden ai_usage_logs'ta
// SIFIR Gemini kaydı görmüştük, ama sebep "anahtar yok" değil "her çağrı
// başarısız oluyor" imiş. Artık başarısız çağrılar da (durum koduyla)
// loglanıyor — böylece "anahtar eksik" ile "anahtar var ama kota bitti"
// ayrımı log'dan görülebiliyor, dışarıdan elle doğrulamaya gerek kalmıyor.
import { logGeminiUsage } from '@/lib/ai-usage'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function verifyQuestionWithGemini(prompt: string): Promise<{ ok: boolean; reason?: string } | null> {
  if (!GEMINI_API_KEY) return null // Anahtar gerçekten yoksa — bu katman aktif değil

  try {
    const res = await fetch(
      // 6 Eylül 2026 — Deniz'in kredi yüklemesi sonrası eklediğimiz teşhis
      // logu (bkz. aşağıdaki catch) gerçek nedeni ortaya çıkardı: kredi/kota
      // sorunu DEĞİLMİŞ — 'gemini-2.0-flash' modeli Google tarafından
      // TAMAMEN KALDIRILMIŞ (404: "no longer available"). Model adı
      // 'gemini-3.6-flash' olarak güncellendi.
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + '\n\nRespond ONLY with valid JSON, no other text.' }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 250 },
        }),
        signal: AbortSignal.timeout(6000), // 6sn - yavas yanit tum dogrulamayi kilitlemesin
      }
    )
    if (!res.ok) {
      // Anahtar VAR ama API hata döndü (ör. 429 = kota/kredi tükendi, 400 =
      // geçersiz istek/anahtar). Soruyu reddetme (bu katman opsiyonel), ama
      // artık NEDENİ görünür kılıyoruz — aksi hâlde bu tamamen sessiz kalır
      // ve "Gemini aktif değil" ile "Gemini kotası bitti" birbirinden ayırt
      // edilemez (tam da bu karışıklığı yaşadık).
      // Ham sağlayıcı yanıtı loglanmaz: hata gövdesi prompt/model çıktısı veya
      // hassas ayrıntı içerebilir. Operasyon için durum kodu yeterlidir.
      console.warn(`[verify-gemini] API hata döndü, bu katman atlandı — status=${res.status}`)
      return null
    }

    const data = await res.json()
    logGeminiUsage('verify-questions:gemini', 'gemini-3.6-flash', data?.usageMetadata)
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch (e: any) {
    console.warn(`[verify-gemini] ağ/parse hatası, bu katman atlandı: ${e?.message || e}`)
    return null // Ağ/parse hatası — bu katmanı sessizce atla, üretimi bozma
  }
}
