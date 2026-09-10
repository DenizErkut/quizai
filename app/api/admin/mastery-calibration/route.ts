import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
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

  const [summaryResult, recentResult] = await Promise.all([
    adminDb.from('mastery_calibration_summary').select('*')
      .order('subject').order('calibration_bin'),
    adminDb.from('mastery_calibration_measurements')
      .select('id,subject,topic,predicted_mastery,prediction_confidence,prior_event_count,actual_score_pct,signed_error,absolute_error,is_eligible,algorithm_version,evaluated_at')
      .order('evaluated_at', { ascending: false }).limit(50),
  ])
  const error = summaryResult.error || recentResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ summary: summaryResult.data || [], recent: recentResult.data || [] })
}

