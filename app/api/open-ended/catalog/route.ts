import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { gradeKeyFromProfile, loadOpenEndedCatalog } from '@/lib/open-ended-practice-catalog'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const { data: profile, error } = await db.from('profiles').select('grade').eq('id', user.id).maybeSingle()
  if (error || !profile) return NextResponse.json({ error: 'Öğrenci sınıfı alınamadı.' }, { status: 404 })
  const grade = gradeKeyFromProfile(profile.grade)
  try {
    const subjects = (await loadOpenEndedCatalog(db, grade)).filter(item => item.isActive && item.topics.length > 0)
    return NextResponse.json({ grade, subjects })
  } catch {
    return NextResponse.json({ error: 'Ders ve konu listesi alınamadı.' }, { status: 500 })
  }
}
