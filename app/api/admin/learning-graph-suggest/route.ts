// app/api/admin/learning-graph-suggest/route.ts
//
// 18 Ağustos 2026 — Madde 3 (pratium-bekleyen-isler-uygulama-plani.md):
// lib/learning-graph.ts'in bugüne kadar SADECE Kesirler/Ondalık Sayılar
// ile sınırlı olan topic_prerequisites tablosunu, diğer ders/sınıflara da
// yarı-otomatik olarak genişletmek için AI destekli taslak üretici.
//
// Bilinçli tasarım kararı: AI, curriculum.topics dizisinde ZATEN LİSTELİ
// olan konular DIŞINDA hiçbir konu/ön koşul önermeye izin verilmiyor
// (prompt içinde açıkça kısıtlanıyor + yanıt sonrası kod tarafında da
// filtreleniyor) — halüsinasyonla var olmayan bir "kazanım" icat edip
// topic_prerequisites_draft'a yazmasını engellemek için. Ayrıca hiçbir
// satır doğrudan gerçek topic_prerequisites tablosuna YAZILMIYOR — bu
// route sadece 'pending' taslak üretir, onay app/api/admin/learning-
// graph-drafts/route.ts üzerinden ayrı bir admin adımıdır.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic()

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

export const maxDuration = 60
export const runtime = 'nodejs'

function buildPrompt(subject: string, grade: number, level: string, topics: string[]): string {
  const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join('\n')
  return `Sen bir Türkiye MEB müfredatı eğitim programı uzmanısın. Aşağıda "${level}" seviyesi, ${grade}. sınıf, "${subject}" dersine ait, müfredatta SIRAYLA verilmiş konu listesi var:

${topicList}

Görev: Bu konular arasında, bir konuyu iyi öğrenebilmek için ÖNCE hangi başka bir konunun (aynı listeden) sağlam öğrenilmiş olması gerektiğini belirle. SADECE yukarıdaki listede YAZILI konuları kullan — listede olmayan hiçbir konu/kazanım adı UYDURMA.

Kurallar:
- Her ilişki sadece gerçekten güçlü bir bağımlılık varsa önerilsin (örn: "Kesirlerde İşlemler" için "Kesir Kavramı" gerçek bir ön koşuldur; sırf müfredatta önce geldiği için ön koşul sayma).
- confidence alanı: "high" (çok net bağımlılık), "medium" (makul ama kesin değil), "low" (zayıf/spekülatif) olarak dürüstçe işaretle.
- Bir konunun birden fazla ön koşulu olabilir, hiç ön koşulu olmayan konular da olabilir (özellikle ünitenin ilk konusu).
- rationale alanını kısa (1 cümle), Türkçe ve öğretmenin anlayacağı şekilde yaz.
- En fazla 15 ilişki öner (en güvendiklerini seç, listeyi doldurmak için zayıf ilişkiler uydurma).

SADECE şu JSON formatında yanıt ver, başka hiçbir metin ekleme:
{"relations":[{"topic":"...","prerequisite_topic":"...","confidence":"high|medium|low","rationale":"..."}]}`
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { curriculumId } = await req.json()
    if (!curriculumId) return NextResponse.json({ error: 'curriculumId gerekli.' }, { status: 400 })

    const { data: curriculum, error: cErr } = await adminDb
      .from('curriculum')
      .select('id, level, grade, subject, topics')
      .eq('id', curriculumId)
      .single()

    if (cErr || !curriculum) return NextResponse.json({ error: 'Müfredat kaydı bulunamadı.' }, { status: 404 })

    const topics: string[] = Array.isArray(curriculum.topics) ? curriculum.topics : []
    if (topics.length < 2) {
      return NextResponse.json({ error: 'Bu müfredat kaydında ön koşul önerisi için yeterli konu yok (en az 2 konu gerekli).' }, { status: 400 })
    }

    const prompt = buildPrompt(curriculum.subject, curriculum.grade, curriculum.level, topics)
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'AI yanıtı ayrıştırılamadı.' }, { status: 500 })

    let parsed: { relations?: any[] }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: 'AI yanıtı geçerli JSON değil.' }, { status: 500 })
    }

    const topicSet = new Set(topics)
    const validRelations = (parsed.relations || []).filter((r: any) =>
      r && typeof r.topic === 'string' && typeof r.prerequisite_topic === 'string' &&
      topicSet.has(r.topic) && topicSet.has(r.prerequisite_topic) &&
      r.topic !== r.prerequisite_topic
    )

    const droppedCount = (parsed.relations?.length || 0) - validRelations.length

    if (validRelations.length === 0) {
      return NextResponse.json({
        success: true, inserted: 0, dropped: droppedCount,
        message: 'AI hiçbir geçerli ön koşul ilişkisi önermedi (ya da tüm öneriler listede olmayan konular içerdiği için elendi).',
      })
    }

    const rows = validRelations.map((r: any) => ({
      subject: curriculum.subject,
      grade: curriculum.grade,
      level: curriculum.level,
      topic: r.topic,
      prerequisite_topic: r.prerequisite_topic,
      confidence: ['low', 'medium', 'high'].includes(r.confidence) ? r.confidence : 'medium',
      rationale: typeof r.rationale === 'string' ? r.rationale.slice(0, 500) : null,
      status: 'pending',
    }))

    const { data: inserted, error: insErr } = await adminDb
      .from('topic_prerequisites_draft')
      .insert(rows)
      .select('id')

    if (insErr) return NextResponse.json({ error: `Taslak kayıt hatası: ${insErr.message}` }, { status: 500 })

    return NextResponse.json({
      success: true,
      inserted: inserted?.length || 0,
      dropped: droppedCount, // "no silent caps": listede olmayan/uydurma önerilerin sayısı açıkça raporlanır
    })
  } catch (e: any) {
    console.error('[learning-graph-suggest]', e)
    return NextResponse.json({ error: e?.message || 'Bilinmeyen hata' }, { status: 500 })
  }
}
