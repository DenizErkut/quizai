// app/api/admin/approve-teacher/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(req: NextRequest) {
  // Admin kontrolü
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Admin mi?
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  }

  const { teacher_id, action } = await req.json() // action: 'approve' | 'reject'
  if (!teacher_id || !action) {
    return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })
  }

  // Öğretmen bilgilerini çek
  const { data: teacher } = await supabaseAdmin
    .from('teachers')
    .select('id, user_id, name, email, school, approved')
    .eq('id', teacher_id)
    .single()

  if (!teacher) return NextResponse.json({ error: 'Öğretmen bulunamadı.' }, { status: 404 })

  if (action === 'approve') {
    // DB güncelle
    await supabaseAdmin.from('teachers').update({ approved: true }).eq('id', teacher_id)

    // In-app bildirim
    await supabaseAdmin.from('notifications').insert({
      user_id: teacher.user_id,
      type: 'system',
      title: '🎓 Öğretmen başvurunuz onaylandı!',
      body: 'Pratium Öğretmen Paneline erişebilirsiniz. Hemen sınıf oluşturabilir ve ödev atayabilirsiniz.',
      read: false,
      data: { href: '/teacher' },
    })

    // Email gönder
    await resend.emails.send({
      from: 'Pratium <info@pratium.com>',
      to: teacher.email,
      subject: '🎓 Öğretmen başvurunuz onaylandı — Pratium',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#082465,#1ECFB8);padding:32px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800">pratium</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Öğren. Test Et. Geliş.</p>
          </div>
          <div style="padding:32px">
            <h2 style="color:#082465;margin:0 0 12px;font-size:20px">Başvurunuz onaylandı! 🎉</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
              Merhaba <strong>${teacher.name}</strong>,
            </p>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px">
              Pratium Öğretmen Paneline erişiminiz aktive edildi. Artık sınıf oluşturabilir, ödev atayabilir ve öğrencilerinizin performansını takip edebilirsiniz.
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:24px">
              <div style="font-size:13px;color:#166534;line-height:1.8">
                ✅ Sınıf oluşturma<br>
                ✅ Ödev atama ve takip<br>
                ✅ Öğrenci performans analizi<br>
                ✅ AI destekli öğrenci raporu<br>
                ✅ Toplu bildirim gönderme
              </div>
            </div>
            <div style="text-align:center;margin:24px 0">
              <a href="https://pratium.com/teacher"
                 style="background:linear-gradient(135deg,#082465,#1ECFB8);color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
                🏫 Öğretmen Paneline Git
              </a>
            </div>
          </div>
          <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
            <p style="color:#94a3b8;font-size:12px;margin:0">— Pratium Ekibi &nbsp;|&nbsp; <a href="https://pratium.com" style="color:#1ECFB8;text-decoration:none">pratium.com</a></p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ success: true, action: 'approved' })
  }

  if (action === 'reject') {
    // DB'den sil
    await supabaseAdmin.from('teachers').delete().eq('id', teacher_id)

    // Red emaili gönder
    await resend.emails.send({
      from: 'Pratium <info@pratium.com>',
      to: teacher.email,
      subject: 'Öğretmen başvurunuz hakkında — Pratium',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#082465,#1ECFB8);padding:32px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800">pratium</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px">Öğren. Test Et. Geliş.</p>
          </div>
          <div style="padding:32px">
            <h2 style="color:#082465;margin:0 0 12px;font-size:20px">Başvurunuz değerlendirildi</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">
              Merhaba <strong>${teacher.name}</strong>,
            </p>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px">
              Maalesef öğretmen başvurunuz şu an için onaylanamadı. Daha fazla bilgi için <a href="mailto:info@pratium.com" style="color:#1ECFB8">info@pratium.com</a> adresinden bize ulaşabilirsiniz.
            </p>
          </div>
          <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
            <p style="color:#94a3b8;font-size:12px;margin:0">— Pratium Ekibi &nbsp;|&nbsp; <a href="https://pratium.com" style="color:#1ECFB8;text-decoration:none">pratium.com</a></p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ success: true, action: 'rejected' })
  }

  return NextResponse.json({ error: 'Geçersiz action.' }, { status: 400 })
}
