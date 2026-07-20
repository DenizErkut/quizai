// app/api/cron/reconcile-identities/route.ts
// Vercel Cron: her gün 06:00 UTC'de çalışır (bkz. vercel.json)
//
// Supabase profiles ↔ TR-PG identities uyumsuzluğunu otomatik bulur ve
// düzeltir — "İsimsiz" kullanıcıları elle SQL yazarak avlamak yerine bu
// artık kendiliğinden, günlük olarak yapılır. Otomatik düzeltilemeyen
// (örn. auth.users'ta da bulunamayan) kayıtlar varsa admin(ler)e bildirim
// gönderilir.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcileIdentities } from '@/lib/identity/reconcile'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const result = await reconcileIdentities({ dryRun: false })

  // Otomatik düzeltilen ya da elle bakılması gerekenler varsa admin(ler)e
  // bildirim gönder — sessizce geçmesin.
  if (result.fixed > 0 || result.failed.length > 0) {
    const { data: admins } = await supabaseAdmin
      .from('profiles').select('id').eq('is_admin', true)

    if (admins?.length) {
      const parts: string[] = []
      if (result.fixed > 0) parts.push(`${result.fixed} kimlik otomatik dolduruldu`)
      if (result.failed.length > 0) parts.push(`${result.failed.length} kayıt elle kontrol gerektiriyor`)

      const notifRows = admins.map((a: any) => ({
        user_id: a.id,
        type: 'system',
        title: '🔧 Kimlik uzlaştırma raporu',
        body: parts.join(', ') + '.',
        read: false,
        data: { href: '/admin', report: result },
      }))
      await supabaseAdmin.from('notifications').insert(notifRows)
    }
  }

  console.log('[cron/reconcile-identities]', JSON.stringify(result))
  return NextResponse.json(result)
}
