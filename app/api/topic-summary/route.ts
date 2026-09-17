import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 30
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { createClient } from '@/lib/supabase/server-create-client'
import { loadCanonicalObjectiveCandidates } from '@/lib/learning-objective-mapping'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
// generate-quiz'in kazanım eşleştirmesiyle aynı desen: RPC'nin okuduğu
// öğretim programı tabloları kullanıcı oturumuna değil, service role'e
// açık — objectiveDb bu yüzden ayrı bir client.
const objectiveDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Rate limiting — 20 istek/gün
  try {
    const rlDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const today = new Date().toISOString().split('T')[0]
    const { data: rl } = await rlDb.from('api_rate_limits').select('id, count').eq('user_id', user.id).eq('endpoint', 'topic-summary').eq('window_date', today).maybeSingle()
    if (rl) {
      if (rl.count >= 20) return NextResponse.json({ error: 'Günlük özet limiti aşıldı.', limit: 20 }, { status: 429 })
      await rlDb.from('api_rate_limits').update({ count: rl.count + 1 }).eq('id', rl.id)
    } else { await rlDb.from('api_rate_limits').insert({ user_id: user.id, endpoint: 'topic-summary', count: 1, window_date: today }) }
  } catch { /* devam et */ }

  const { topic, subject, grade, language = 'Türkçe' } = await req.json()
  if (!topic) return NextResponse.json({ error: 'Konu belirtilmedi.' }, { status: 400 })

  // 17 Eylül 2026 — Deniz'in isteği: "Konuya Hızlı Bak" o zamana kadar
  // sadece Claude'un kendi genel bilgisinden bir özet üretiyordu, MEB
  // müfredatının GERÇEK kazanımlarına hiç bakmıyordu — generate-quiz zaten
  // her soru için aynı kanonik kazanım tablosunu (loadCanonicalObjectiveCandidates)
  // kullanıyor, burada da aynı kaynağa bağlanıyoruz. subject/grade/topic
  // eşleşen bir kazanım kümesi varsa özet VE madde listesi BUNLARA
  // dayandırılıyor (uydurma önlenir); eşleşme yoksa (subject
  // gönderilmemişse, ya da bu konu için henüz kazanım işlenmemişse) eskisi
  // gibi genel bilgiye dayalı bir özete sessizce geri dönülüyor.
  const objectiveCandidates = subject
    ? await loadCanonicalObjectiveCandidates(objectiveDb, { subject, grade, topic }).catch(() => [])
    : []
  const curriculumGrounded = objectiveCandidates.length > 0
  const curriculumBlock = curriculumGrounded
    ? `\n\nBU KONUNUN MEB MÜFREDATINDAKİ DOĞRULANMIŞ KAZANIMLARI (sistem tarafından sağlandı — özeti ve keyPoints listesini BUNLARA dayandır, listede olmayan bir kazanım uydurma; kazanım sayısı 5'ten fazlaysa en önemlilerini seç, keyPoints'in her biri mümkünse ayrı bir kazanımı karşılasın):\n${objectiveCandidates.map(c => `- [${c.objectiveCode}] ${c.title}`).join('\n')}`
    : ''

  const prompt = `Sen bir öğretmensin. "${topic}" konusunu ${grade || 'ortaokul'} seviyesinde bir öğrenciye quiz öncesi hızlıca özetleyeceksin.

Dil: ${language}${curriculumBlock}

SADECE JSON döndür:
{
  "summary": "2-3 cümlelik genel özet",
  "keyPoints": ["Madde 1", "Madde 2", "Madde 3", "Madde 4", "Madde 5"],
  "keyTerms": [
    {"term": "Terim 1", "definition": "Kısa tanım"},
    {"term": "Terim 2", "definition": "Kısa tanım"},
    {"term": "Terim 3", "definition": "Kısa tanım"}
  ],
  "rememberThis": "Sınava girerken aklında tut: En önemli tek cümle"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: 'Sadece geçerli JSON döndür, markdown kullanma.',
      messages: [{ role: 'user', content: prompt }],
    })
    await logAnthropicUsage('topic-summary', 'claude-sonnet-4-5', response, { userId: user.id })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({ ...parsed, curriculumGrounded })
  } catch {
    return NextResponse.json({ error: 'Özet oluşturulamadı.' }, { status: 500 })
  }
}
