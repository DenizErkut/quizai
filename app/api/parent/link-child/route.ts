import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, supabaseAdmin } from '@/lib/auth-middleware'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { findStudentByNationalId, getIdentityBySupabaseId } from '@/lib/identity/client'
import { validateTcKimlikNo, normalizeTcKimlikNo } from '@/lib/tc-kimlik'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error
  const { data: parent } = await supabaseAdmin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  // Veli paneline zaten bağlı çocuğu olan hesaplar da (rolü 'parent' olmasa bile) çocuk ekleyebilir.
  const { count: existingKids } = await supabaseAdmin.from('parent_children').select('id', { count: 'exact', head: true }).eq('parent_id', auth.user.id)
  if (parent?.role !== 'parent' && (existingKids ?? 0) === 0) return NextResponse.json({ error: 'Veli hesabı gerekli.' }, { status: 403 })
  const limit = await checkRateLimit(auth.user.id, { endpoint: 'parent-link-child', limit: 10 })
  if (!limit.allowed) return rateLimitExceeded(limit)
  const body = await req.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code.trim().toLowerCase() : ''
  const tc = normalizeTcKimlikNo(body?.nationalId)
  let child: { id: string; role: string } | null = null
  if (tc) {
    // T.C. ile bağlama: öğrenciye onay isteği gider; öğrenci onaylayınca takip başlar.
    // Hesap sorgulamasını önlemek için eşleşme olsun olmasın aynı yanıt döner.
    if (!validateTcKimlikNo(tc)) return NextResponse.json({ error: 'Geçerli bir T.C. Kimlik No girin.' }, { status: 400 })
    const childId = await findStudentByNationalId(tc)
    if (childId && childId !== auth.user.id) {
      const { data: linked } = await supabaseAdmin.from('parent_children').select('id').eq('parent_id', auth.user.id).eq('child_id', childId).maybeSingle()
      if (linked) return NextResponse.json({ error: 'Bu çocuk zaten listenizde.' }, { status: 409 })
      const { data: existingReq } = await supabaseAdmin.from('parent_link_requests').select('id,status').eq('parent_id', auth.user.id).eq('child_id', childId).maybeSingle()
      if (!existingReq || existingReq.status !== 'pending') {
        const { error: reqErr } = existingReq
          ? await supabaseAdmin.from('parent_link_requests').update({ status: 'pending', decided_at: null, created_at: new Date().toISOString() }).eq('id', existingReq.id)
          : await supabaseAdmin.from('parent_link_requests').insert({ parent_id: auth.user.id, child_id: childId })
        if (!reqErr) {
          const parentName = (await getIdentityBySupabaseId(auth.user.id))?.full_name || 'Bir veli'
          await supabaseAdmin.from('notifications').insert({
            user_id: childId, type: 'system', read: false,
            title: '👨‍👩‍👧 Veli takip isteği',
            body: `${parentName} seni veli olarak takip etmek istiyor. Ana sayfadan onaylayabilir veya reddedebilirsin.`,
            data: { href: '/home' },
          })
        }
      }
    }
    return NextResponse.json({ success: true, pending: true })
  } else {
    if (!/^[a-z0-9]{4,32}$/.test(code)) return NextResponse.json({ error: 'Geçerli bir T.C. Kimlik No veya davet kodu gerekli.' }, { status: 400 })
    const { data } = await supabaseAdmin.from('profiles').select('id,role').eq('parent_code', code).maybeSingle()
    child = data
  }
  if (!child || child.id === auth.user.id || child.role !== 'student') return NextResponse.json({ error: 'Kod bulunamadı veya öğrenci hesabına ait değil.' }, { status: 404 })
  const { data: existing } = await supabaseAdmin.from('parent_children').select('id').eq('parent_id', auth.user.id).eq('child_id', child.id).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Bu çocuk zaten listenizde.' }, { status: 409 })
  const { error } = await supabaseAdmin.from('parent_children').insert({ parent_id: auth.user.id, child_id: child.id })
  if (error) return NextResponse.json({ error: 'Çocuk bağlantısı kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
