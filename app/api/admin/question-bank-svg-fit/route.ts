import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fitSvgText } from '@/lib/svg-text-fit'

export const runtime = 'nodejs'
export const maxDuration = 300

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

const PAGE = 100

// Soru havuzunda daha önce kaydedilmiş SVG'lerdeki taşan yazıları sığdırır (yeni görsellerde bu otomatik yapılıyor).
// apply=false: yalnızca kaç kaydın değişeceğini sayar; apply=true: günceller.
export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { apply?: boolean }
  const apply = body.apply === true
  let scanned = 0
  let changed = 0
  let updated = 0
  const failed: string[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminDb.from('question_bank').select('id, question')
      .not('question->>svg', 'is', null).order('id').range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message, scanned, changed, updated }, { status: 500 })
    const rows = (data || []) as Array<{ id: string; question: Record<string, unknown> }>
    if (!rows.length) break
    for (const row of rows) {
      const svg = row.question?.svg
      if (typeof svg !== 'string' || !svg.includes('<svg')) continue
      scanned++
      const fitted = fitSvgText(svg)
      if (fitted === svg) continue
      changed++
      if (!apply) continue
      const { error: updateError } = await adminDb.from('question_bank')
        .update({ question: { ...row.question, svg: fitted } }).eq('id', row.id)
      if (updateError) failed.push(row.id); else updated++
    }
    if (rows.length < PAGE) break
  }
  return NextResponse.json({ apply, scanned, changed, updated, failed })
}
