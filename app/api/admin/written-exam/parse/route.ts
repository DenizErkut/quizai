// Yönetici yüklediği yazılı soru dosyasını (öğrenci sayfaları + öğretmen cevap anahtarı) yapılandırır.
// Yapay zeka soru ÜRETMEZ: metindeki soruları, puanları ve cevap anahtarını olduğu gibi ayıklar ve anahtardan rubrik çıkarır.
// Sonuç kaydedilmez; yönetici inceleyip düzenledikten sonra kaydeder.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { extractPdfText } from '@/lib/pdf-extract'
import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { normalizeParsedQuestions } from '@/lib/written-exam'
import { stripForeignScripts } from '@/lib/open-ended-grading'

export const runtime = 'nodejs'
export const maxDuration = 300

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic()
const MAX_TEXT = 60000

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 }) }
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!data?.is_admin) return { error: NextResponse.json({ error: 'Yönetici yetkisi gerekli.' }, { status: 403 }) }
  return { user }
}

function buildPrompt(text: string) {
  return `Aşağıda bir yazılı sınav hazırlık dosyasının metni var: öğrenci soru sayfaları ve (varsa) öğretmen cevap anahtarı/puanlama bölümü.
GÖREVİN soru ÜRETMEK DEĞİL; dosyadaki soruları, puanları ve cevap anahtarını OLDUĞU GİBİ yapılandırmak. Metinde olmayan soru, puan veya cevap ekleme, mevcut soruları değiştirme.

Her soru için şunları çıkar:
- title: sorunun başlığı (ör. "Gözlem kartlarını gruplandırma")
- objectiveCode: öğrenme çıktısı/kazanım kodu (ör. "FB.6.1.1."); yoksa ""
- scenario: soruya ait ortak bağlam, tablo veya verilerin metni (öğrencinin soruyu çözmek için okuması gereken kısım). Tabloları her satır ayrı satır olacak biçimde, hücreleri " | " ile ayırarak yaz (ilk satır başlık; ör. "Kart | Gezegen | Halka"). Satırları boş satırla ayırma. Yoksa ""
- question: alt maddeleriyle (a, b, c...) tam soru metni ve her alt maddenin puanı. scenario'da olan metni tekrar etme.
- maxPoints: sorunun toplam puanı (tam sayı)
- rubric: cevap anahtarından türetilmiş ölçütler. Her ölçüt tek bir puanlanabilir beklentidir: {"criterion": "a) kısa ad", "maxPoints": tam sayı, "description": "beklenen doğru yanıt ve puan dağılımı; kabul edilen eş değer yanıtlar"}. Ölçüt puanlarının TOPLAMI maxPoints'e EŞİT olmalı. Anahtarda alt madde puanları varsa onlara uy; "yön ve doğrultu ayrı ölçüt", "tutarlı hata tekrar cezalandırılmaz" gibi değerlendirme notlarını ilgili ölçütün description'ına işle.
- answerKey: o sorunun cevap anahtarı metni (öğretmen bölümünden, olduğu gibi)

Cevap anahtarı yoksa rubriği soru metnindeki alt madde puanlarından kur ve description'a "Cevap anahtarı yüklenmedi; yönetici doldurmalı" yaz.
Dosyadaki genel bilgi/uygulama notlarını ve kapak sayfasını soru sayma.

SADECE şu JSON'u döndür:
{"questions":[{"title":"","objectiveCode":"","scenario":"","question":"","maxPoints":8,"rubric":[{"criterion":"","maxPoints":4,"description":""}],"answerKey":""}]}

DOSYA METNİ:
"""
${text.replace(/"""/g, "'''")}
"""`
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Dosya veya metin gerekli.' }, { status: 400 })
  const file = form.get('file')
  let text = typeof form.get('text') === 'string' ? String(form.get('text')).trim() : ''
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Dosya 15 MB sınırını aşıyor.' }, { status: 413 })
    const bytes = Buffer.from(await file.arrayBuffer())
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') text = (await extractPdfText(bytes)).text
    else if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/')) text = bytes.toString('utf8')
    else return NextResponse.json({ error: 'Yalnızca PDF veya metin dosyası yüklenebilir.' }, { status: 415 })
  }
  if (text.length < 100) return NextResponse.json({ error: 'Dosyadan yeterli metin okunamadı.' }, { status: 422 })
  const truncated = text.length > MAX_TEXT
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_SONNET, ...SONNET_PARAMS, max_tokens: sonnetTokens(12000),
      messages: [{ role: 'user', content: buildPrompt(text.slice(0, MAX_TEXT)) }],
    })
    await logAnthropicUsage('written-exam-parse', CLAUDE_SONNET, response, { userId: access.user.id })
    const raw = responseText(response)
    const json = raw.match(/\{[\s\S]*\}/)?.[0]
    if (!json) return NextResponse.json({ error: 'Yapay zeka yanıtı okunamadı, tekrar deneyin.' }, { status: 502 })
    const parsed = normalizeParsedQuestions((JSON.parse(json) as { questions?: unknown }).questions)
    const questions = parsed.questions.map(q => ({
      ...q,
      title: stripForeignScripts(q.title), scenario: stripForeignScripts(q.scenario), question: stripForeignScripts(q.question),
      answerKey: stripForeignScripts(q.answerKey),
      rubric: q.rubric.map(r => ({ ...r, criterion: stripForeignScripts(r.criterion), description: stripForeignScripts(r.description) })),
    }))
    const warnings = truncated ? [...parsed.warnings, `Dosya çok uzun olduğu için ilk ${MAX_TEXT} karakter okundu; sonraki sorular eksik olabilir.`] : parsed.warnings
    return NextResponse.json({ questions, warnings, characters: text.length })
  } catch (error) {
    console.error('[written-exam-parse]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Dosya yapılandırılamadı, tekrar deneyin.' }, { status: 500 })
  }
}
