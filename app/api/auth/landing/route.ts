// Girişten sonra kullanıcının rolüne göre varış sayfasını belirler.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, supabaseAdmin } from '@/lib/auth-middleware'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth.error) return auth.error
  const uid = auth.user.id
  const [{ data: iu }, { data: teacher }, { data: profile }, { count: kids }] = await Promise.all([
    supabaseAdmin.from('institution_users').select('institution_id').eq('user_id', uid).eq('role', 'admin').limit(1).maybeSingle(),
    supabaseAdmin.from('teachers').select('approved').eq('user_id', uid).maybeSingle(),
    supabaseAdmin.from('profiles').select('role,is_admin').eq('id', uid).maybeSingle(),
    supabaseAdmin.from('parent_children').select('id', { count: 'exact', head: true }).eq('parent_id', uid),
  ])
  let path = '/home'
  let note: string | null = null
  if (iu) path = '/institution'
  else if (teacher?.approved === true) path = '/teacher'
  else if (teacher && teacher.approved !== true) { path = '/home'; note = 'teacher_pending' }
  else if (profile?.role === 'parent' || (kids ?? 0) > 0) path = '/parent'
  return NextResponse.json({ path, note })
}
