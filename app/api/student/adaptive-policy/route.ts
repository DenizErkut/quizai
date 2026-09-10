import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAdaptiveLearningPolicy } from '@/lib/adaptive-learning'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const topic = req.nextUrl.searchParams.get('topic')?.trim() || ''
  const subject = req.nextUrl.searchParams.get('subject')?.trim() || undefined
  if (!topic || topic.length > 200) return NextResponse.json({ error: 'Geçerli konu gerekli.' }, { status: 400 })

  const policy = await resolveAdaptiveLearningPolicy(db, user.id, topic, subject).catch(() => null)
  if (!policy) return NextResponse.json({ active: false, focus: 'standard', reasonCode: 'POLICY_UNAVAILABLE' })
  return NextResponse.json({
    active: policy.focus !== 'standard',
    focus: policy.focus,
    reasonCode: policy.reasonCode,
    version: policy.version,
  })
}
