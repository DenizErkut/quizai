import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await anon.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const event = String(body.event || '')
  if (!['session_started', 'session_ended', 'turn_completed', 'recognition_error'].includes(event)) {
    return NextResponse.json({ error: 'Geçersiz olay.' }, { status: 400 })
  }
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // Ham ses veya konuşma metni kaydedilmez; yalnızca deneyim ölçümleri tutulur.
  await admin.from('agent_decision_audit').insert({
    actor_id: user.id,
    agent_name: 'voice-tutor-v1',
    policy_version: 'voice-privacy-v1',
    input_summary: { event, topic: String(body.topic || '').slice(0, 160) },
    decision_summary: {
      turn_count: Number.isFinite(Number(body.turnCount)) ? Number(body.turnCount) : null,
      recognition_ms: Number.isFinite(Number(body.recognitionMs)) ? Number(body.recognitionMs) : null,
      error_code: typeof body.errorCode === 'string' ? body.errorCode.slice(0, 80) : null,
    },
  })
  return NextResponse.json({ ok: true })
}
