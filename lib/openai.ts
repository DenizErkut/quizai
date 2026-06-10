// lib/openai.ts — OpenAI yardımcı fonksiyonları

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

async function callOpenAI(messages: {role: string, content: any}[], options: {
  model?: string
  max_tokens?: number
  temperature?: number
  json?: boolean
} = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o-mini',
      max_tokens: options.max_tokens || 1000,
      temperature: options.temperature ?? 0.3,
      response_format: options.json ? { type: 'json_object' } : undefined,
      messages,
    })
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// 1. Yedek model — Claude hata verirse GPT-4o devreye girer
export async function generateQuizFallback(prompt: string, count: number): Promise<string> {
  return callOpenAI([
    { role: 'system', content: 'You are an expert quiz generator. Return only valid JSON.' },
    { role: 'user', content: prompt }
  ], { model: 'gpt-4o-mini', max_tokens: 4000, json: true })
}

// 2. Görsel soru açıklama — GPT-4o Vision ile SVG/resim analizi
export async function explainVisualQuestion(imageBase64: string, question: string, lang: string): Promise<string> {
  return callOpenAI([
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
      { type: 'text', text: `Bu görseli ${lang} dilinde analiz et ve şu soruya cevap ver: ${question}. Kısa ve net açıkla (2-3 cümle).` }
    ]}
  ], { model: 'gpt-4o', max_tokens: 500 })
}

// 3. Matematik doğrulama — GPT-4o ile çapraz kontrol
export async function verifyMathWithOpenAI(question: string, answer: string, lang: string): Promise<{correct: boolean, explanation: string}> {
  const result = await callOpenAI([
    { role: 'system', content: `You are a math verification assistant. Return JSON: {"correct": boolean, "explanation": "string"}` },
    { role: 'user', content: `Soru: ${question}\nVerilen cevap: ${answer}\nBu cevap doğru mu? Dil: ${lang}` }
  ], { model: 'gpt-4o-mini', max_tokens: 300, json: true })
  try { return JSON.parse(result) } catch { return { correct: false, explanation: result } }
}

export { callOpenAI }
