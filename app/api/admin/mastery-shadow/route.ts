import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function isAdmin() {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [summary, recent] = await Promise.all([
    adminDb.from('mastery_shadow_summary').select('*').order('eligible_sample_size', { ascending: false }),
    adminDb.from('mastery_shadow_measurements')
      .select('id,subject,topic,prior_event_count,days_since_practice,v1_predicted_mastery,v2_predicted_mastery,actual_score_pct,difficulty_adjustment,v1_absolute_error,v2_absolute_error,winning_model,is_eligible,evaluated_at')
      .order('evaluated_at', { ascending: false }).limit(50),
  ])
  const error = summary.error || recent.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ summary: summary.data || [], recent: recent.data || [] })
}
