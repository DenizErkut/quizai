// An automatically cropped figure is attached to a question only after a vision
// check: it must be the figure this question refers to, readable, and must not
// show the answer. Anything else stays a candidate for the manual picker.
import Anthropic from '@anthropic-ai/sdk'

export type FigureVerdict = { ok: boolean; reason: string }

export async function verifyFigure(
  client: Anthropic,
  figure: { data: Buffer; mime: 'image/png' | 'image/jpeg' },
  question: { q?: unknown; opts?: unknown },
): Promise<FigureVerdict> {
  const options = Array.isArray(question.opts) ? question.opts.map((option, i) => `${String.fromCharCode(65 + i)}) ${String(option)}`).join('\n') : ''
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: figure.mime, data: figure.data.toString('base64') } },
        { type: 'text', text: `Bu görsel bir soru kitapçığı PDF'inden otomatik kırpıldı. Soru:\n${String(question.q)}\n${options}\n\nYalnız JSON döndür: {"relevant":true|false,"readable":true|false,"reveals_answer":true|false,"reason":"kısa gerekçe"}\n- relevant: görsel bu sorunun atıf yaptığı şekil/grafik/tablo/harita mı?\n- readable: tam, kesilmemiş ve okunaklı mı?\n- reveals_answer: görselin içinde bu sorunun doğru cevabı (ör. "Cevap: B" satırı) yazıyor mu?` },
      ] }],
    }, { timeout: 25000, maxRetries: 1 })
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const ok = parsed.relevant === true && parsed.readable === true && parsed.reveals_answer === false
    return { ok, reason: String(parsed.reason || '').slice(0, 200) }
  } catch {
    return { ok: false, reason: 'Görsel otomatik doğrulanamadı.' }
  }
}
