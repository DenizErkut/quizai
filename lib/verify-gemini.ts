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
export type GeminiQuestionSetReview = { ok: boolean; reason?: string; issueIndexes?: number[] } | null

export async function verifyQuestionWithGemini(prompt: string): Promise<{ ok: boolean; reason?: string; difficultyMatches?: boolean; objectiveMatches?: boolean } | null> {
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

/** Final, whole-test coherence and correctness pass after per-question checks. */
export async function verifyQuestionSetWithGemini(args: {
  questions: Array<Record<string, unknown>>
  topic: string
  grade: string
  language: string
}): Promise<GeminiQuestionSetReview> {
  if (!GEMINI_API_KEY || args.questions.length === 0) return null
  const questionText = args.questions.map((question, index) => {
    const options = Array.isArray(question.opts) ? question.opts.map(String).join(' | ') : ''
    const answer = typeof question.ans === 'number' && Array.isArray(question.opts)
      ? String(question.opts[question.ans] ?? question.ans)
      : String(question.ans ?? '')
    return `Q${index + 1} [${String(question.difficulty || 'unknown')}]: ${String(question.q || '')}\nOptions: ${options}\nClaimed answer: ${answer}\nExplanation: ${String(question.exp || '').slice(0, 500)}\nOutcome: ${String(question.learningObjectiveTitle || question.learningObjectiveRef || '')}`
  }).join('\n\n')
  const prompt = `You are the final independent reviewer for a complete K-12 quiz. Review all questions together for factual/answer correctness, ambiguity, accidental duplicates, consistent grade level, and whether each item assesses the requested topic. Do not reject merely for stylistic preference. Flag only clear, material issues that would mislead a student.\nTopic: ${args.topic}\nGrade: ${args.grade}\nLanguage: ${args.language}\n\n${questionText.slice(0, 30000)}\n\nReturn ONLY JSON: {"ok":true,"reason":"brief summary","issueIndexes":[]} or {"ok":false,"reason":"brief material issue","issueIndexes":[1]}. Indexes are 1-based.`
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(12000),
      },
    )
    if (!response.ok) {
      console.warn(`[verify-gemini] set review unavailable; status=${response.status}`)
      return null
    }
    const data = await response.json()
    logGeminiUsage('verify-questions:gemini-set', 'gemini-3.6-flash', data?.usageMetadata)
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/gi, '').trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (typeof parsed?.ok !== 'boolean') return null
    return {
      ok: parsed.ok,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : undefined,
      issueIndexes: Array.isArray(parsed.issueIndexes)
        ? parsed.issueIndexes.filter((value: unknown) => Number.isInteger(value) && Number(value) > 0).slice(0, 20)
        : [],
    }
  } catch (error) {
    console.warn('[verify-gemini] set review failed:', error instanceof Error ? error.message : 'unknown')
    return null
  }
}
