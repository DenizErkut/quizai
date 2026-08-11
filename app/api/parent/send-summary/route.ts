// app/api/parent/send-summary/route.ts
// Veli kendi isteğiyle haftalık özet e-postası isteyebilir (manuel tetikleme).
// Otomatik/haftalık gönderim için bkz. app/api/cron/weekly-parent-summary —
// hesaplama ve HTML şablonu ikisi arasında lib/parent-summary.ts üzerinden
// paylaşılıyor (aynı mantığın iki yerde ayrı yazılıp sapmasını önlemek için).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getIdentityBySupabaseId, getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { computeParentWeeklySummary, buildParentSummaryEmailHtml, sendResendEmail } from '@/lib/parent-summary'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const parentIdentity = await getIdentityBySupabaseId(user.id)
  const parentName = parentIdentity?.full_name || 'Veli'
  const parentEmail = parentIdentity?.email || user.email
  if (!parentEmail) return NextResponse.json({ error: 'E-posta bulunamadı' }, { status: 400 })

  const { data: links } = await adminDb
    .from('parent_children').select('child_id')
    .eq('parent_id', user.id)
  if (!links?.length) return NextResponse.json({ error: 'Çocuk bulunamadı' }, { status: 400 })

  const childIdentities = await getIdentitiesBySupabaseIds(links.map((l: any) => l.child_id))
  const childNames: Record<string, string> = {}
  for (const [id, identity] of Object.entries(childIdentities)) {
    childNames[id] = (identity as any)?.full_name || 'Öğrenci'
  }

  const childSummaries = await computeParentWeeklySummary(adminDb, user.id, childNames)

  const emailHtml = buildParentSummaryEmailHtml(parentName, childSummaries)
  const sent = await sendResendEmail(
    parentEmail,
    `📊 Haftalık Özet — ${childSummaries.map(c => c.name).join(', ')}`,
    emailHtml
  )

  if (!sent) return NextResponse.json({ error: 'E-posta gönderilemedi' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
