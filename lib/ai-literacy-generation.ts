// lib/ai-literacy-generation.ts — AI Literacy Mode üretim mantığı.
//
// 23 Eylül 2026 — 21-22 Eylül haber analizinden (Sky News: gençlerin
// %47'si AI'a fact-checking için bir insandan daha fazla güveniyor;
// Education Week: Gemini'nin K-12'ye farklılaşmadan açılması okulları
// hazırlıksız yakaladı) doğan özellik. Claude'a KASITLI OLARAK hem doğru
// hem de gerçekçi-ama-hatalı bir cevap ürettiriyoruz — hatalı cevap
// aptalca/bariz değil, gerçek bir öğrencinin/AI'ın düşebileceği türden
// (hesaplama hatası, kavram yanılgısı, uydurma bilgi, eksik muhakeme).
// Öğrenci ikisini ayırt etmeye çalışır — amaç doğru cevabı ezberletmek
// değil, "AI her zaman haklı değildir" refleksini alıştırmak.
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
export const AI_LITERACY_MODEL = 'claude-sonnet-4-5'

export type FlawType = 'hesaplama_hatasi' | 'kavram_yanilgisi' | 'halusinasyon' | 'eksik_muhakeme'

export interface AILiteracyChallenge {
  question: string
  answerA: string
  answerB: string
  correctChoice: 'A' | 'B'
  flawType: FlawType
  flawExplanation: string
  correctReasoning: string
}

const FLAW_TYPES: FlawType[] = ['hesaplama_hatasi', 'kavram_yanilgisi', 'halusinasyon', 'eksik_muhakeme']

const FLAW_TYPE_PROMPTS: Record<FlawType, string> = {
  hesaplama_hatasi: 'Yanlış cevap bir HESAPLAMA HATASI içermeli — muhakeme/yöntem doğru görünmeli ama bir adımda (işlem sırası, işaret hatası, birim çevirme vb.) somut bir sayısal hata olmalı.',
  kavram_yanilgisi: 'Yanlış cevap yaygın bir KAVRAM YANILGISI içermeli — öğrencilerin bu konuda sıkça düştüğü, mantıklı GÖRÜNEN ama kavramsal olarak hatalı bir düşünce kalıbını yansıtmalı.',
  halusinasyon: 'Yanlış cevap bir HALÜSİNASYON (uydurma bilgi) içermeli — gerçek gibi sunulan ama var olmayan/yanlış bir tarih, isim, formül, terim veya gerçek uydurmalı; ifade tarzı kendinden emin ve inandırıcı olmalı.',
  eksik_muhakeme: 'Yanlış cevap EKSİK MUHAKEME içermeli — soruyu kısmen doğru ama önemli bir adımı/koşulu/istisnayı atlayarak yanlış sonuca varmalı.',
}

function pickFlawType(seed: string): FlawType {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return FLAW_TYPES[hash % FLAW_TYPES.length]
}

function extractJson(text: string): any {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('ai_literacy_no_json')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function generateAILiteracyChallenge(
  subject: string,
  topic: string,
  grade: string | undefined,
  userId: string
): Promise<AILiteracyChallenge> {
  // Hangi hata türünün kullanılacağını önceden (deterministik ama
  // konu+zamana göre değişen bir seed'le) seçiyoruz ve bunu prompt'a
  // açıkça yazıyoruz — modelin "hangi tür hata" ile "hangisi doğru"yu
  // aynı anda kendi kendine tutarlı üretmesini kolaylaştırıyor.
  const flawType = pickFlawType(`${subject}|${topic}|${Date.now()}`)
  const correctChoice: 'A' | 'B' = Math.random() < 0.5 ? 'A' : 'B'
  const wrongChoice = correctChoice === 'A' ? 'B' : 'A'

  const gradeCtx = grade ? `Sınıf seviyesi: ${grade}.` : ''
  const prompt = `Sen Pratium'un "AI Okuryazarlığı" modülü için içerik üreten bir eğitim asistanısın. Amaç öğrenciye AI çıktılarını sorgulamayı öğretmek.

Ders: ${subject}. Konu: ${topic}. ${gradeCtx}

Görev: Bu konuda MEB müfredatı seviyesinde, kendi içinde eksiksiz TEK bir soru üret. Soruya iki farklı "AI tarafından üretilmiş cevap" yaz:
- Cevap ${correctChoice}: TAMAMEN DOĞRU, net ve iyi gerekçelendirilmiş.
- Cevap ${wrongChoice}: YANLIŞ ama gerçekçi ve ilk bakışta ikna edici olmalı. ${FLAW_TYPE_PROMPTS[flawType]}

KURALLAR:
1. İki cevap da benzer uzunlukta ve benzer, kendinden emin bir üslupta yazılmalı — öğrenci sadece üsluptan hangisinin doğru olduğunu anlayamamalı.
2. Yanlış cevaptaki hata BARİZ/SAÇMA olmamalı — gerçek bir öğrencinin ya da bir AI'ın gerçekten düşebileceği türden, ince ama tespit edilebilir bir hata olmalı.
3. Soru MEB müfredatı dışına çıkmamalı, tartışmalı/siyasi/dini içerik barındırmamalı.
4. "flawExplanation": yanlış cevaptaki hatayı öğrenciye açıklayan, öğretici bir metin (2-3 cümle).
5. "correctReasoning": doğru cevabın neden doğru olduğunu özetleyen kısa bir metin (2-3 cümle).

Yalnızca şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{"question":"...","answerA":"...","answerB":"...","correctChoice":"${correctChoice}","flawExplanation":"...","correctReasoning":"..."}`

  const message = (await anthropic.messages.create({
    model: AI_LITERACY_MODEL,
    max_tokens: 900,
    messages: [{ role: 'user', content: prompt }],
  })) as any
  await logAnthropicUsage('ai-literacy-generate', AI_LITERACY_MODEL, message, { userId })

  const textBlock = message?.content?.find((b: any) => b.type === 'text')
  if (!textBlock?.text) throw new Error('ai_literacy_empty_response')
  const parsed = extractJson(textBlock.text)

  if (typeof parsed.question !== 'string' || typeof parsed.answerA !== 'string' || typeof parsed.answerB !== 'string') {
    throw new Error('ai_literacy_malformed_response')
  }
  // Modelin correctChoice alanını değiştirmiş olma ihtimaline karşı,
  // bizim önceden belirlediğimiz değeri esas alıyoruz (prompt'ta zaten
  // hangi harfin doğru olacağı açıkça verildi) — tutarsızlık riskini
  // modele bırakmıyoruz.
  return {
    question: parsed.question,
    answerA: parsed.answerA,
    answerB: parsed.answerB,
    correctChoice,
    flawType,
    flawExplanation: typeof parsed.flawExplanation === 'string' ? parsed.flawExplanation : 'Bu cevapta bir hata var.',
    correctReasoning: typeof parsed.correctReasoning === 'string' ? parsed.correctReasoning : 'Bu cevap doğru muhakemeyi yansıtıyor.',
  }
}
