import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import Anthropic from '@anthropic-ai/sdk'
import { cookies } from 'next/headers'
import { buildIntelligenceRoutePlan } from '@/lib/ai-gateway'
import { logAnthropicUsage } from '@/lib/ai-usage'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic()
export const runtime = 'nodejs'; export const maxDuration = 60

async function adminId() {
  const store = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: name => store.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true ? user.id : null
}

export async function GET() {
  if (!await adminId()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [catalog, contents] = await Promise.all([
    db.from('misconception_catalog').select('id,subject,topic,label,evidence_count')
      .eq('verification_status', 'verified').order('evidence_count', { ascending: false }).limit(300),
    db.from('misconception_micro_contents').select('*').order('updated_at', { ascending: false }).limit(300),
  ])
  const error = catalog.error || contents.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ misconceptions: catalog.data || [], contents: contents.data || [] })
}

export async function POST(req: NextRequest) {
  const userId = await adminId()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { misconceptionId } = await req.json()
  if (typeof misconceptionId !== 'string') return NextResponse.json({ error: 'Yanılgı seçimi gerekli.' }, { status: 400 })
  const { data: item } = await db.from('misconception_catalog').select('id,subject,topic,label,verification_status')
    .eq('id', misconceptionId).maybeSingle()
  if (!item || item.verification_status !== 'verified') return NextResponse.json({ error: 'Yalnızca doğrulanmış yanılgılar için içerik hazırlanabilir.' }, { status: 409 })
  const { data: existing } = await db.from('misconception_micro_contents').select('id,status')
    .eq('misconception_id', item.id).eq('language', 'tr').in('status', ['draft', 'approved']).maybeSingle()
  if (existing) return NextResponse.json({ error: `Bu yanılgı için zaten ${existing.status} içerik var.` }, { status: 409 })

  const requestId = crypto.randomUUID()
  const plan = buildIntelligenceRoutePlan({ task: 'learning_recommendation', userId, requestId,
    language: 'tr', requiresPremiumReasoning: true, containsSensitiveStudentData: false })
  if (plan.primary.provider !== 'anthropic') return NextResponse.json({ error: 'Güvenli pedagojik üretim yolu bulunamadı.' }, { status: 503 })
  const prompt = `Türkiye müfredatına uygun bir eğitim uzmanısın. Doğrulanmış kavram yanılgısı için kısa düzeltici mikro içerik hazırla.
Ders: ${item.subject}\nKonu: ${item.topic}\nYanılgı: ${item.label}
Öğrenciyi etiketleme veya küçümseme. Yaşa uygun, sade Türkçe kullan. Yanlış düşünceyi pekiştirme. Açıklama, uygulanabilir düzeltme adımı, tek somut örnek ve cevabı kısa bir kontrol sorusu üret.
SADECE JSON döndür: {"shortExplanation":"20-600 karakter","correctionStrategy":"20-800 karakter","workedExample":"20-1200 karakter","checkQuestion":{"question":"5-500 karakter","answer":"1-500 karakter"}}`
  const started = Date.now()
  try {
    const response = await anthropic.messages.create({ model: plan.primary.model, max_tokens: 1400,
      messages: [{ role: 'user', content: prompt }] })
    await logAnthropicUsage('misconception:micro-content-draft', plan.primary.model, response, {
      userId, requestId, durationMs: Date.now() - started,
      meta: { policyVersion: plan.policyVersion, reasonCode: plan.reasonCode },
    })
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI yanıtı ayrıştırılamadı.')
    const parsed = JSON.parse(match[0]) as { shortExplanation?: unknown; correctionStrategy?: unknown; workedExample?: unknown; checkQuestion?: { question?: unknown; answer?: unknown } }
    const shortExplanation = typeof parsed.shortExplanation === 'string' ? parsed.shortExplanation.trim().slice(0, 600) : ''
    const correctionStrategy = typeof parsed.correctionStrategy === 'string' ? parsed.correctionStrategy.trim().slice(0, 800) : ''
    const workedExample = typeof parsed.workedExample === 'string' ? parsed.workedExample.trim().slice(0, 1200) : ''
    const question = typeof parsed.checkQuestion?.question === 'string' ? parsed.checkQuestion.question.trim().slice(0, 500) : ''
    const answer = typeof parsed.checkQuestion?.answer === 'string' ? parsed.checkQuestion.answer.trim().slice(0, 500) : ''
    if (shortExplanation.length < 20 || correctionStrategy.length < 20 || workedExample.length < 20 || question.length < 5 || !answer) {
      throw new Error('AI içeriği kalite sözleşmesini karşılamadı.')
    }
    const { data, error } = await db.from('misconception_micro_contents').insert({
      misconception_id: item.id, language: 'tr', short_explanation: shortExplanation,
      correction_strategy: correctionStrategy, worked_example: workedExample,
      check_question: { question, answer }, source_kind: 'ai_draft', ai_provider: plan.primary.provider,
      ai_model: plan.primary.model, ai_policy_version: plan.policyVersion, ai_request_id: requestId,
      created_by: userId,
    }).select('id').single()
    if (error) throw error
    return NextResponse.json({ ok: true, id: data.id })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'İçerik hazırlanamadı.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await adminId()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  if (typeof body.id !== 'string' || !['approved', 'rejected'].includes(body.decision)) {
    return NextResponse.json({ error: 'Geçersiz inceleme isteği.' }, { status: 400 })
  }
  const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
  const update = {
    short_explanation: clean(body.shortExplanation, 600), correction_strategy: clean(body.correctionStrategy, 800),
    worked_example: clean(body.workedExample, 1200),
    check_question: { question: clean(body.question, 500), answer: clean(body.answer, 500) }, updated_at: new Date().toISOString(),
  }
  const { error: updateError } = await db.from('misconception_micro_contents').update(update).eq('id', body.id).eq('status', 'draft')
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
  const note = clean(body.note, 500)
  const { error } = await db.rpc('review_misconception_micro_content_v1', {
    p_content_id: body.id, p_decision: body.decision, p_note: note || null, p_reviewer_id: userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
