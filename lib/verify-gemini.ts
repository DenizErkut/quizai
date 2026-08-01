// lib/verify-gemini.ts
// Gemini ile bağımsız soru kalite/doğruluk kontrolü. Bu, Claude'un ürettiği
// soruları farklı bir modelin (OpenAI'nin matematik odaklı kontrolüne ek
// olarak) genel olarak gözden geçirdiği üçüncü bağımsız katman.
//
// GEMINI_API_KEY henüz Vercel'e eklenmediği sürece bu fonksiyon sessizce
// null döner (üretim akışını KIRMAZ) — anahtar eklenince otomatik aktif olur.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function verifyQuestionWithGemini(prompt: string): Promise<{ ok: boolean; reason?: string } | null> {
  if (!GEMINI_API_KEY) return null // Anahtar yok — bu katman henüz aktif değil

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
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
    if (!res.ok) return null // Gemini hatası — soruyu reddetme, sadece bu katmanı atla

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null // Ağ/parse hatası — bu katmanı sessizce atla, üretimi bozma
  }
}
