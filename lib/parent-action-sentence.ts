// lib/parent-action-sentence.ts
// Faz 5 (Parent Agent) — roadmap karşılaştırma raporunun kalan açık
// maddesi: "veli özetine AI-üretimli aksiyon önerisi ekle". Hem haftalık
// özet (lib/parent-summary.ts) hem anlık risk uyarısı (lib/parent-risk-
// alert.ts) bu tek fonksiyonu kullanır — aynı promptun iki yerde ayrı
// yazılıp sapmasını önlemek için.
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function defaultSentence(topic: string): string {
  return `Bu hafta "${topic}" konusuna birlikte biraz zaman ayırmanız faydalı olabilir.`
}

// Kısa, sıcak, somut bir aksiyon cümlesi üretir. Ucuz/hızlı tutulsun diye
// Haiku ve düşük max_tokens kullanılıyor — bu bir kritik akademik içerik
// değil, kısa bir öneri cümlesi, hata olursa şablonlu bir cümleye düşer.
export async function generateActionSentence(
  childName: string,
  topic: string,
  masteryScore: number,
  forgettingRisk: string
): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `${childName} adlı öğrencinin "${topic}" konusundaki mastery skoru ${masteryScore}/100 (${forgettingRisk === 'yüksek' ? 'uzun süredir tekrar edilmemiş' : 'yakın zamanda çalışılmış'}). Veliye, bu hafta bu konuya nasıl destek olabileceğine dair TEK CÜMLELİK, sıcak ve somut bir öneri yaz. Sadece cümleyi yaz, başka açıklama ekleme, tırnak işareti kullanma.`,
      }],
    }) as any
    const text = msg.content?.[0]?.text?.trim()
    return text || defaultSentence(topic)
  } catch {
    return defaultSentence(topic)
  }
}
