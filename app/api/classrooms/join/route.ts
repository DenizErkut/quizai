import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const limit = await checkRateLimit(user.id, { endpoint: 'classroom-join', limit: 20 })
  if (!limit.allowed) return rateLimitExceeded(limit)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'Geçerli bir davet kodu gir.' }, { status: 400 })
  }

  const code = body.code.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Geçerli bir davet kodu gir.' }, { status: 400 })
  }

  const { data: classroom, error: classroomError } = await db
    .from('classrooms')
    .select('id, name, subject, teachers(user_id, school)')
    .eq('invite_code', code)
    .maybeSingle()

  if (classroomError || !classroom) {
    if (classroomError) console.error('[classrooms/join] code lookup failed:', classroomError.message)
    return NextResponse.json({ error: 'Bu koda ait sınıf bulunamadı.' }, { status: 404 })
  }

  const { data: existing, error: membershipError } = await db
    .from('classroom_students')
    .select('classroom_id')
    .eq('classroom_id', classroom.id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (membershipError) {
    console.error('[classrooms/join] membership check failed:', membershipError.message)
    return NextResponse.json({ error: 'Sınıf üyeliği kontrol edilemedi.' }, { status: 500 })
  }

  if (existing) return NextResponse.json({ classroom, alreadyJoined: true })

  const { error: insertError } = await db.from('classroom_students').insert({
    classroom_id: classroom.id,
    student_id: user.id,
  })

  if (insertError?.code === '23505') {
    return NextResponse.json({ classroom, alreadyJoined: true })
  }
  if (insertError) {
    console.error('[classrooms/join] membership insert failed:', insertError.message)
    return NextResponse.json({ error: 'Sınıfa katılım tamamlanamadı.' }, { status: 500 })
  }

  return NextResponse.json({ classroom, alreadyJoined: false }, { status: 201 })
}
