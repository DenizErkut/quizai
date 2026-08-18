// app/api/admin/meb-health-scan/route.ts
//
// 18 Ağustos 2026 — Madde 6 (pratium-bekleyen-isler-uygulama-plani.md):
// "6. Sınıf Sosyal Bilgiler" playbook'unun (bkz. claude/content-quality-
// playbook.md) sistematik tarama scripti. Madde 8'in health check'i
// (lib/content-filters.ts, runHealthCheck) sadece YENİ yüklemelerde
// çalışıyor — bu route, DAHA ÖNCE (health check kurulmadan önce)
// yüklenmiş TÜM mevcut meb_resources'ı geriye dönük tarar ve en riskli
// kaynakları önceliklendiren bir liste üretir. Playbook'un pilot adımı
// ("en çok şikayet alan 2-3 ders" — bkz. Madde 2'deki error_reports ile
// birlikte) için nesnel bir girdi sağlar.
//
// Varsayılan olarak SADECE RAPORLAR, hiçbir şey yazmaz. `?apply=true`
// ile, henüz health_flag'i olmayan (eski) kaynaklara bulunan sinyalleri
// yazar — "önce gör, sonra sil" (Madde 5) ile aynı ruh: script kendi
// kendine sessizce veri değiştirmez, admin açıkça istemeden.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { runHealthCheck } from '@/lib/content-filters'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

// Tek seferde en fazla bu kadar kaynak taranır — sınırsız büyümeyi
// önlemek için (silent-cap DEĞİL: yanıtta total/scanned ayrı raporlanır,
// tabloda daha fazlası varsa açıkça belirtilir, bkz. workflow ilkesi
// "no silent caps").
const MAX_SCAN = 2000

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const apply = searchParams.get('apply') === 'true'
  const topN = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100)

  const { data: resources, count } = await adminDb
    .from('meb_resources')
    .select('id, title, subject, grade, unit, raw_text, health_flag', { count: 'exact' })
    .limit(MAX_SCAN)

  if (!resources) {
    return NextResponse.json({ error: 'Kaynaklar okunamadı.' }, { status: 500 })
  }

  const results = resources.map(r => {
    const health = runHealthCheck(r.raw_text || '')
    return {
      id: r.id,
      title: r.title,
      subject: r.subject,
      grade: r.grade,
      unit: r.unit,
      char_count: (r.raw_text || '').length,
      flags: health.flags,
      had_flag_before: !!r.health_flag,
    }
  })

  // En riskli önce: sinyal sayısı çoktan aza. Eşitlikte daha kısa içerik
  // (muhtemelen daha ciddi bir kesme/eksiklik sinyali) öne alınır.
  const risky = results
    .filter(r => r.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || a.char_count - b.char_count)

  // Ders bazlı özet — playbook'un "en riskli 2-3 dersi seç" pilot adımı için.
  const bySubject: Record<string, number> = {}
  for (const r of risky) {
    const key = r.subject || '(belirsiz)'
    bySubject[key] = (bySubject[key] || 0) + 1
  }

  let appliedCount = 0
  if (apply) {
    // Sadece DAHA ÖNCE health_flag'i OLMAYAN (eski, health check'ten önce
    // yüklenmiş) kaynaklara yaz — Madde 8'in yükleme-anı davranışını
    // ezmemek için (yeni kaynaklarda health_flag zaten güncel).
    const toUpdate = risky.filter(r => !r.had_flag_before)
    for (const r of toUpdate) {
      await adminDb.from('meb_resources').update({ health_flag: r.flags.join(',') }).eq('id', r.id)
      appliedCount++
    }
  }

  return NextResponse.json({
    totalInDb: count ?? resources.length,
    scanned: resources.length,
    truncated: (count ?? resources.length) > MAX_SCAN, // "no silent caps" — açıkça belirt
    riskyCount: risky.length,
    bySubject,
    top: risky.slice(0, topN),
    applied: apply,
    appliedCount,
  })
}
