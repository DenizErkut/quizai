// Yönetici yüklediği örnek (ör. MEB ortak sınav senaryoları PDF'i) dosyasından senaryo + soru + rubrik ayıklar.
// Yapay zeka yeni içerik UYDURMAZ; dosyadaki senaryoları olduğu gibi yapılandırır. Sonuç kaydedilmez, yönetici taslak olarak kaydeder.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { extractPdfText } from '@/lib/pdf-extract'
import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { stripForeignScripts } from '@/lib/open-ended-grading'
import { normalizeRubricTo100 } from '@/lib/open-ended-scenarios'

export const runtime = 'nodejs'
export const maxDuration = 300

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic()
const MAX_TEXT = 60000

type RawItem = { title?: unknown; scenario?: unknown; question?: unknown; rubric?: unknown }

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const { data: prof } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!prof?.is_admin) return NextResponse.json({ error: 'Yönetici yetkisi gerekli.' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'PDF dosyası gerekli.' }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Dosya 15 MB sınırını aşıyor.' }, { status: 413 })
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return NextResponse.json({ error: 'Yalnızca PDF yüklenebilir.' }, { status: 415 })
  const text = (await extractPdfText(Buffer.from(await file.arrayBuffer()))).text
  if (text.length < 100) return NextResponse.json({ error: 'PDF içinden yeterli metin okunamadı (taranmış görsel olabilir).' }, { status: 422 })

  const prompt = `Aşağıda ortak yazılı/sınav örnekleri içeren bir dosyanın metni var. İçindeki SENARYO tabanlı açık uçlu soruları OLDUĞU GİBİ ayıkla; yeni soru UYDURMA.
Her biri için: title (kısa başlık), scenario (öğrencinin okuyacağı durum/bağlam metni; tablo varsa satırları " | " ile yaz), question (senaryoya dayanan soru, alt maddeleriyle), rubric (cevap anahtarı/puanlama bölümünden ölçütler: {"criterion","maxPoints","description"}; anahtar yoksa soru ve alt madde puanlarından makul ölçütler kur). Puanlar sorunun kendi puanıdır; sistem sonra toplamı 100'e ölçekler.
Kapak, yönerge ve genel notları soru sayma.
SADECE şu JSON'u döndür: {"items":[{"title":"","scenario":"","question":"","rubric":[{"criterion":"","maxPoints":5,"description":""}]}]}

DOSYA METNİ:
"""
${text.slice(0, MAX_TEXT).replace(/"""/g, "'''")}
"""`
  try {
    const response = await anthropic.messages.create({ model: CLAUDE_SONNET, ...SONNET_PARAMS, max_tokens: sonnetTokens(12000), messages: [{ role: 'user', content: prompt }] })
    await logAnthropicUsage('open-ended-scenario-parse', CLAUDE_SONNET, response, { userId: user.id })
    const json = responseText(response).match(/\{[\s\S]*\}/)?.[0]
    if (!json) return NextResponse.json({ error: 'Yapay zeka yanıtı okunamadı, tekrar deneyin.' }, { status: 502 })
    const raw = ((JSON.parse(json) as { items?: RawItem[] }).items || []).slice(0, 30)
    const items = raw.map(r => {
      const rubric = (Array.isArray(r.rubric) ? r.rubric as Array<Record<string, unknown>> : []).slice(0, 10).map(c => ({
        criterion: stripForeignScripts(String(c.criterion || '').slice(0, 300)),
        maxPoints: Math.max(1, Math.round(Number(c.maxPoints) || 1)),
        description: stripForeignScripts(String(c.description || '').slice(0, 800)),
      })).filter(c => c.criterion)
      return {
        title: stripForeignScripts(String(r.title || '').slice(0, 200)),
        scenario: stripForeignScripts(String(r.scenario || '').slice(0, 4000)),
        question: stripForeignScripts(String(r.question || '').slice(0, 2000)),
        rubric: normalizeRubricTo100(rubric),
      }
    }).filter(i => i.scenario.length >= 10 && i.question.length >= 5 && i.rubric.length > 0)
    return NextResponse.json({ items, truncated: text.length > MAX_TEXT })
  } catch (error) {
    console.error('[open-ended-scenario-parse]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Dosya yapılandırılamadı, tekrar deneyin.' }, { status: 500 })
  }
}
