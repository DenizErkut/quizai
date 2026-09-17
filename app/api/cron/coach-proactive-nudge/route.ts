// app/api/cron/coach-proactive-nudge/route.ts
// Pratium Koç, Faz D: proaktiflik.
//
// 17 Eylül 2026 — Faz B/E'de kurulan koç sohbeti tamamen REAKTİF'ti:
// öğrenci /koc'a kendi girmeden hiçbir şey olmuyordu. Bu cron, mevcut
// weekly-plan-refresh ve disengagement-check'in izlediği aynı deseni
// (aday havuzunu tara, sinyale göre üret, notifications'a yaz)
// kullanarak koçun kendiliğinden "söyleyecek bir şeyi" olduğunda
// öğrenciye ulaşmasını sağlıyor:
//   - Disengagement sinyali varsa: kısa, yargılamayan bir "seni özledik"
//     mesajı + somut bir geri-dönüş adımı.
//   - Değilse ama sistemin önceliklendirdiği bir çalışma önerisi (goals)
//     varsa: o öneriyi vurgulayan bir mesaj.
//   - İkisi de yoksa: HİÇBİR ŞEY üretilmiyor — Faz A'nın "sadece gerçek
//     veriye dayan" kuralı burada da geçerli, uydurma bir "harika
//     gidiyorsun" mesajı yazılmıyor.
//
// Aynı mesaj hem coach_messages'a (öğrenci /koc'u bir dahaki açışında
// zaten orada bulur — GET /api/coach/chat'in "hiç mesaj yoksa proaktif
// açılış üret" mantığı burada devreye girmez, çünkü mesaj zaten var) hem
// notifications'a (type: coach_nudge, action_url: /koc) yazılır.
// Kullanıcı başına en fazla MIN_DAYS_BETWEEN_NUDGES günde bir tetiklenir;
// notification_preferences.coach_nudge=false ile tamamen kapatılabilir.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { buildCoachContext, formatCoachContextForPrompt, CoachContext } from '@/lib/coach-context'
import { logAnthropicUsage } from '@/lib/ai-usage'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120
export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const NUDGE_MODEL = 'claude-sonnet-4-5'
const MIN_DAYS_BETWEEN_NUDGES = 4

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type NudgeReason = 'disengagement' | 'recommendation'

function decideNudgeReason(ctx: CoachContext): NudgeReason | null {
  if (ctx.disengagement.isDisengaging) return 'disengagement'
  if (ctx.goals.length > 0) return 'recommendation'
  return null
}

function nudgeTitle(reason: NudgeReason): string {
  return reason === 'disengagement' ? '👋 Pratium Koç seni bekliyor' : '✦ Pratium Koç\'tan bir öneri'
}

async function generateNudgeBody(ctx: CoachContext, reason: NudgeReason, userId: string): Promise<string | null> {
  const instruction = reason === 'disengagement'
    ? 'Öğrenci bir süredir aktif değil. Onu yargılamadan, sıcak bir dille geri çağıran ve somut TEK bir ilk adım öneren, en fazla 2 cümlelik bir mesaj yaz. Bu bir bildirimde görünecek, kısa tut.'
    : 'Sistemin hesapladığı en öncelikli çalışma önerisini vurgulayan, motive edici, en fazla 2 cümlelik bir mesaj yaz. Bu bir bildirimde görünecek, kısa tut.'
  try {
    const message = await anthropic.messages.create({
      model: NUDGE_MODEL,
      max_tokens: 200,
      system: `Sen Pratium'un yapay zeka destekli kişisel öğrenme koçusun. Adın "Pratium Koç".

ÖĞRENCİ VERİSİ (gerçek, sistem tarafından hesaplandı):
${formatCoachContextForPrompt(ctx)}

KESİN KURAL: yukarıdaki veri bloğunda yer almayan hiçbir istatistik, başarı veya konu adı uydurma. Sıcak, samimi, asla yargılayıcı olma. Sadece mesaj metnini yaz, başka açıklama ekleme, tırnak işareti kullanma. Türkçe yaz.`,
      messages: [{ role: 'user', content: instruction }],
    }) as any
    await logAnthropicUsage('coach-proactive-nudge', NUDGE_MODEL, message, { userId })
    const text = message.content?.[0]?.text?.trim()
    return text || null
  } catch (e) {
    console.error('[coach-proactive-nudge] generation error:', userId, e)
    return null
  }
}

async function getOrCreateConversationAdmin(userId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('coach_conversations')
    .select('id')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: created, error } = await supabaseAdmin
    .from('coach_conversations')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error || !created) throw new Error('coach_conversation_create_failed')
  return created.id as string
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  // Aday havuzu: weekly-plan-refresh ile aynı — en az 1 tamamlanmış quiz'i
  // olan kullanıcılar (hiç veri yoksa hesaplanacak/söylenecek bir şey yok).
  const { data: activeSessions } = await supabaseAdmin
    .from('quiz_sessions')
    .select('user_id')
    .eq('completed', true)
  const candidateIds = [...new Set((activeSessions ?? []).map((r: any) => r.user_id))]
  if (!candidateIds.length) {
    return NextResponse.json({ ok: true, checked: 0, eligible: 0, nudged: 0, skippedNoSignal: 0, failed: 0 })
  }

  // Tercihinden kapatmış olanları çıkar.
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('user_id, coach_nudge')
    .in('user_id', candidateIds)
  const optedOut = new Set((prefs ?? []).filter((p: any) => p.coach_nudge === false).map((p: any) => p.user_id))

  // Son MIN_DAYS_BETWEEN_NUDGES gün içinde zaten nudge almış olanları çıkar
  // — aynı kullanıcıyı gün aşırı rahatsız etmemek için.
  const since = new Date(Date.now() - MIN_DAYS_BETWEEN_NUDGES * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentNudges } = await supabaseAdmin
    .from('notifications')
    .select('user_id')
    .eq('type', 'coach_nudge')
    .in('user_id', candidateIds)
    .gte('created_at', since)
  const recentlyNudged = new Set((recentNudges ?? []).map((r: any) => r.user_id))

  const eligible = candidateIds.filter(uid => !optedOut.has(uid) && !recentlyNudged.has(uid))
  if (!eligible.length) {
    return NextResponse.json({ ok: true, checked: candidateIds.length, eligible: 0, nudged: 0, skippedNoSignal: 0, failed: 0 })
  }

  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, grade, language').in('id', eligible)
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const identities = await getIdentitiesBySupabaseIds(eligible)

  let nudged = 0, skippedNoSignal = 0, failed = 0
  for (const uid of eligible) {
    try {
      const prof = profileMap.get(uid)
      const identity = (identities as any)[uid]
      const ctx = await buildCoachContext(supabaseAdmin, uid, {
        displayName: identity?.full_name ?? 'Öğrenci',
        grade: prof?.grade,
        language: prof?.language,
      })

      const reason = decideNudgeReason(ctx)
      if (!reason) { skippedNoSignal++; continue }

      const body = await generateNudgeBody(ctx, reason, uid)
      if (!body) { failed++; continue }

      const conversationId = await getOrCreateConversationAdmin(uid)
      await supabaseAdmin.from('coach_messages').insert({ conversation_id: conversationId, role: 'assistant', content: body })
      await supabaseAdmin.from('coach_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)
      await supabaseAdmin.from('notifications').insert({
        user_id: uid,
        type: 'coach_nudge',
        title: nudgeTitle(reason),
        body,
        read: false,
        action_url: '/koc',
      })
      nudged++
    } catch (e: any) {
      console.error('[coach-proactive-nudge] user hatasi:', uid, e.message)
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidateIds.length,
    eligible: eligible.length,
    nudged,
    skippedNoSignal,
    failed,
  })
}
