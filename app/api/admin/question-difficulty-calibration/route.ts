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
  const [labels, items] = await Promise.all([
    adminDb.from('question_difficulty_label_summary').select('*')
      .order('eligible_sample_size', { ascending: false }),
    adminDb.from('question_difficulty_item_summary').select('*')
      .eq('is_item_eligible', true).order('attempts', { ascending: false }).limit(50),
  ])
  const error = labels.error || items.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ labels: labels.data || [], items: items.data || [] })
}
