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
  // Bir hesap aynı anda hem onaylı öğretmen hem veli (ve kurum yöneticisi) olabilir.
  const roles: string[] = []
  if (iu) roles.push('institution')
  if (teacher?.approved === true) roles.push('teacher')
  if (profile?.role === 'parent' || (kids ?? 0) > 0) roles.push('parent')
  const paths: Record<string, string> = { institution: '/institution', teacher: '/teacher', parent: '/parent' }
  const note = teacher && teacher.approved !== true ? 'teacher_pending' : null
  const path = roles.length ? paths[roles[0]] : '/home'
  return NextResponse.json({ path, roles, note })
}
