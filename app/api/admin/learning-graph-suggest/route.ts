// app/api/admin/learning-graph-suggest/route.ts
//
// AI proposes only relations between existing canonical graph nodes. Normalized
// candidates enter the expert-package workflow; this route never publishes an edge.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { buildIntelligenceRoutePlan } from '@/lib/ai-gateway'
import { logAnthropicUsage } from '@/lib/ai-usage'

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

interface SuggestedRelation { topic?: unknown; prerequisite_topic?: unknown; confidence?: unknown; rationale?: unknown }

function key(value: unknown) {
  return typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() : ''
}

function gradeKey(value: unknown) {
  return key(value).replace(/sinif/g, 'sınıf').replace(/(\d+)\s*\.\s*sınıf/g, '$1. sınıf').replace(/^(\d+)$/, '$1. sınıf')
}

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

    const { data: version } = await adminDb.from('curriculum_versions')
      .select('id,code').eq('status', 'active').maybeSingle()
    if (!version) return NextResponse.json({ error: 'Aktif müfredat sürümü bulunamadı.' }, { status: 409 })

    const { data: graphNodes, error: nodeError } = await adminDb.from('learning_graph_nodes')
      .select('id,label,subject,grade,node_type').eq('is_active', true).in('node_type', ['topic', 'learning_objective'])
      .eq('subject', curriculum.subject)
    if (nodeError) return NextResponse.json({ error: nodeError.message }, { status: 500 })
    const allowedTopicKeys = new Set(topics.map(key))
    const canonicalNodes = (graphNodes || []).filter(node =>
      gradeKey(node.grade) === gradeKey(curriculum.grade) && allowedTopicKeys.has(key(node.label)))
    const nodeByLabel = new Map(canonicalNodes.map(node => [key(node.label), node]))
    if (nodeByLabel.size < 2) return NextResponse.json({ error: 'Seçilen konular için en az iki kanonik graph düğümü gerekli.' }, { status: 409 })

    const prompt = buildPrompt(curriculum.subject, curriculum.grade, curriculum.level, topics)
    const requestId = crypto.randomUUID()
    const routePlan = buildIntelligenceRoutePlan({ task: 'learning_recommendation', userId: user.id,
      requestId, language: 'tr', requiresPremiumReasoning: true, containsSensitiveStudentData: false })
    if (routePlan.primary.provider !== 'anthropic') {
      return NextResponse.json({ error: 'Pedagojik öneri için güvenli uzman model yolu bulunamadı.' }, { status: 503 })
    }
    const startedAt = Date.now()
    const res = await anthropic.messages.create({
      model: routePlan.primary.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    await logAnthropicUsage('learning-graph:suggest', routePlan.primary.model, res, {
      userId: user.id, requestId, durationMs: Date.now() - startedAt,
      meta: { policyVersion: routePlan.policyVersion, reasonCode: routePlan.reasonCode },
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'AI yanıtı ayrıştırılamadı.' }, { status: 500 })

    let parsed: { relations?: SuggestedRelation[] }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: 'AI yanıtı geçerli JSON değil.' }, { status: 500 })
    }

    const seen = new Set<string>()
    const validRelations = (parsed.relations || []).flatMap(relation => {
      if (typeof relation.topic !== 'string' || typeof relation.prerequisite_topic !== 'string') return []
      const target = nodeByLabel.get(key(relation.topic)); const source = nodeByLabel.get(key(relation.prerequisite_topic))
      const relationKey = `${source?.id}:${target?.id}`
      if (!source || !target || source.id === target.id || seen.has(relationKey)) return []
      seen.add(relationKey)
      const confidence = relation.confidence === 'high' ? 0.9 : relation.confidence === 'low' ? 0.4 : 0.65
      return [{ source_node_id: source.id, target_node_id: target.id, confidence,
        rationale: typeof relation.rationale === 'string' && relation.rationale.trim()
          ? relation.rationale.trim().slice(0, 500) : 'AI önerisi; uzman pedagojik doğrulaması gerekli.' }]
    })

    const droppedCount = (parsed.relations?.length || 0) - validRelations.length

    if (validRelations.length === 0) {
      return NextResponse.json({
        success: true, inserted: 0, dropped: droppedCount,
        message: 'AI hiçbir geçerli ön koşul ilişkisi önermedi (ya da tüm öneriler listede olmayan konular içerdiği için elendi).',
      })
    }

    const { data: packageId, error: packageError } = await adminDb.rpc('create_learning_graph_prerequisite_package_v1', {
      p_name: `AI ön koşul önerileri · ${curriculum.subject} · ${curriculum.grade}. sınıf`,
      p_subject: curriculum.subject, p_grade: `${curriculum.grade}. sınıf`,
      p_curriculum_version_id: version.id,
      p_source_reference: `AI öneri isteği ${requestId}`,
      p_created_by: user.id, p_items: validRelations,
    })
    if (packageError) return NextResponse.json({ error: `Paket kayıt hatası: ${packageError.message}` }, { status: 500 })
    const { error: provenanceError } = await adminDb.from('learning_graph_prerequisite_packages').update({
      source_kind: 'ai_suggestion', ai_provider: routePlan.primary.provider,
      ai_model: routePlan.primary.model, ai_policy_version: routePlan.policyVersion,
      ai_request_id: requestId, proposed_count: parsed.relations?.length || 0, dropped_count: droppedCount,
    }).eq('id', packageId)
    if (provenanceError) {
      await adminDb.from('learning_graph_prerequisite_packages').delete().eq('id', packageId)
      return NextResponse.json({ error: `AI kaynak kaydı oluşturulamadı: ${provenanceError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      inserted: validRelations.length,
      dropped: droppedCount, // "no silent caps": listede olmayan/uydurma önerilerin sayısı açıkça raporlanır
      packageId,
      reviewFlow: 'expert_package',
    })
  } catch (e: unknown) {
    console.error('[learning-graph-suggest]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Bilinmeyen hata' }, { status: 500 })
  }
}
