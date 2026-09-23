// app/api/cron/question-bank-review-sweep/route.ts
// Vercel Cron — günlük çalışır (bkz. vercel.json).
//
// 23 Eylül 2026 — Pratium AI-ekonomisi/veri-mimarisi uyum raporu, Tema 3
// (agent kimlik/izin ayrımı): lib/question-bank.ts -> promoteQuestionsToBank
// artık AI üretimi soruları doğrudan 'approved' değil, 'candidate' olarak
// yazıyor (bkz. supabase/migrations/20260923090000_question_bank_shadow_
// review.sql). Bu cron, gölge süresini (varsayılan 48 saat) hiç rapor
// almadan dolduran candidate satırları approved'a yükselten RPC'yi
// tetikler. Öğretmen düzeltmesi veya öğrenci raporu sonrası
// awaiting_expert_review=true olan satırlara ASLA dokunmaz — onlar
// yalnızca app/api/admin/question-bank-review üzerinden bir insan
// kararıyla approved/rejected olabilir.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin.rpc('promote_shadow_reviewed_question_bank_candidates')
  if (error) {
    console.error('[cron/question-bank-review-sweep]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cron/question-bank-review-sweep] promoted=${data ?? 0}`)
  return NextResponse.json({ promoted: data ?? 0 })
}
