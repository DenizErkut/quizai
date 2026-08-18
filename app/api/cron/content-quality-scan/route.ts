// app/api/cron/content-quality-scan/route.ts
// Vercel Cron — günlük çalışır (bkz. vercel.json). Sistematik içerik
// kalite örneklemesi (Faz sonrası öneri #4): son 24 saatte tamamlanmış
// quiz oturumlarından bir örneklem alır, GPT-4o (Claude'un ürettiğini
// bağımsız bir modelle) bilinen kural ihlallerine (görünmeyen metne
// atıf, ders kitabı künyesi, konu dışı kaçış, zincirli soru referansı,
// kelime seviyesi, cevap tutarsızlığı) karşı tarar. Bulunan sorunlar
// error_reports'a source='system_scan' olarak eklenir — öğretmenin
// "Hata Bildirimleri" panelinde, kullanıcı bildirimleriyle YAN YANA
// görünür, ayrı bir sistem gerekmez.
//
// Maliyet kontrolü: en fazla 15 oturum, oturum başına en fazla 6 soru
// (=en fazla 90 soru/gün) taranır — sonsuz büyüyen bir maliyet riski
// yaratmadan, gerçek bir örneklem sağlar.
//
// 18 Ağustos 2026 — Madde 9 (pratium-bekleyen-isler-uygulama-plani.md):
// İKİNCİ BİR FAZ eklendi. Yukarıdaki (mevcut) faz sadece ÜRETİLMİŞ
// soruları tarıyordu — meb_resources/exam_chunks'ı KAYNAK seviyesinde
// hiç taramıyordu. Yeni faz, lib/content-filters.ts'teki DETERMİNİSTİK
// (AI çağrısı GEREKTİRMEYEN, dolayısıyla maliyeti ihmal edilebilir)
// filtreleri kullanarak (a) son 24 saatte yüklenip health_flag almış
// meb_resources'ları ve (b) exam_chunks'tan rastgele bir örneklemi
// tarar. Örneklem oranı/maliyet tavanı YUKARIDAKİ (AI'lı) faz için
// DEĞİŞMEDİ — bu maddenin amacı kapsamı genişletmek, maliyeti katlamak
// değil.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanQuestionsForQualityIssues, QualityIssue } from '@/lib/content-quality-scan'
import { isNonContent, isKazanimListesi } from '@/lib/content-filters'

export const maxDuration = 120
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_SESSIONS = 15
const MAX_QUESTIONS_PER_SESSION = 6

// Madde 9 — kaynak-seviyesi tarama tavanları (AI çağrısı yok, sadece
// deterministik filtre fonksiyonları — bu yüzden çok daha yüksek bir
// örneklem uygun maliyetle mümkün, ama yine de sınırsız değil).
const MAX_MEB_RESOURCES_SCAN = 50
const MAX_EXAM_CHUNKS_POOL = 300
const MAX_EXAM_CHUNKS_SAMPLE = 40

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Son 24 saatte tamamlanmış oturumlardan rastgele bir örneklem.
    // Not: PostgREST'te native RANDOM() ORDER BY yok — yeterince büyük
    // bir havuzdan (limit 200) çekip JS tarafında karıştırıyoruz.
    const { data: pool } = await supabaseAdmin
      .from('quiz_sessions')
      .select('id, topic, grade, questions, created_at')
      .eq('completed', true)
      .gte('created_at', since)
      .not('questions', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!pool || pool.length === 0) {
      return NextResponse.json({ scanned: 0, flagged: 0, note: 'Son 24 saatte taranacak oturum yok.' })
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const sample = shuffled.slice(0, MAX_SESSIONS)

    let totalScanned = 0
    let totalFlagged = 0
    const flaggedSummary: string[] = []

    for (const session of sample) {
      const questions = Array.isArray(session.questions) ? session.questions : []
      if (!questions.length) continue

      const forScan = questions.slice(0, MAX_QUESTIONS_PER_SESSION).map((q: any, i: number) => ({
        index: i, q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, type: q.type,
      }))
      totalScanned += forScan.length

      let issues: QualityIssue[] = []
      try {
        issues = await scanQuestionsForQualityIssues(session.topic || '', session.grade || '', forScan)
      } catch (e) {
        console.warn(`[content-quality-scan] Oturum ${session.id} taranamadı:`, e)
        continue
      }

      for (const issue of issues) {
        const q = questions[issue.questionIndex]
        if (!q) continue
        await supabaseAdmin.from('error_reports').insert({
          user_id: null,
          question_text: q.q,
          correct_answer: q.exp || null,
          user_answer: null,
          topic: session.topic,
          status: 'pending',
          source: 'system_scan',
          issue_type: issue.issueType,
          admin_note: `[${issue.severity === 'high' ? '🔴 Yüksek' : '🟡 Orta'}] ${issue.reason}`,
        })
        totalFlagged++
        flaggedSummary.push(`${session.topic}: ${issue.issueType}`)
      }

      // API'yi art arda çok hızlı çağırmamak için küçük bir bekleme
      await new Promise(r => setTimeout(r, 300))
    }

    // ─── Madde 9: kaynak-seviyesi tarama (deterministik, AI çağrısı yok) ───
    let sourceFlagged = 0
    const sourceFlagSummary: string[] = []

    // (a) Son 24 saatte yüklenip Madde 8'in health check'inden bir sinyal
    // almış meb_resources — cron burada health check'i YENİDEN HESAPLAMIYOR,
    // sadece yükleme anında zaten hesaplanmış health_flag'i error_reports'a
    // taşıyarak admin'in "Hata Bildirimleri" panelinde tek yerden görmesini
    // sağlıyor (önceden bu bilgi sadece MEB sekmesindeki rozette kalıyordu).
    const { data: flaggedMebResources } = await supabaseAdmin
      .from('meb_resources')
      .select('id, title, subject, grade, unit, health_flag')
      .gte('created_at', since)
      .not('health_flag', 'is', null)
      .limit(MAX_MEB_RESOURCES_SCAN)

    for (const r of flaggedMebResources || []) {
      await supabaseAdmin.from('error_reports').insert({
        user_id: null,
        question_text: `[Kaynak sağlık kontrolü] ${r.title}`,
        correct_answer: null,
        user_answer: null,
        topic: r.subject || r.unit || '',
        status: 'pending',
        source: 'system_scan',
        issue_type: 'source_health_flag',
        admin_note: `MEB Kaynak ID: ${r.id} (${r.grade || ''}) — sinyaller: ${r.health_flag}. Yükleme sırasında Madde 8 sağlık kontrolü tarafından işaretlendi.`,
      })
      sourceFlagged++
      sourceFlagSummary.push(`${r.title}: ${r.health_flag}`)
    }

    // (b) exam_chunks'tan rastgele bir örneklem — isNonContent/
    // isKazanimListesi filtreleriyle taranır. hasOcrLetterSplitNoise
    // BİLEREK burada YOK — 18 Ağustos 2026'da (aynı gün ikinci kontrol)
    // gerçek exam_chunks verisine karşı dry-run ile doğrulanınca kimya
    // formülü/DNA dizisi/çoktan seçmeli şık gibi GERÇEK içeriği yanlış
    // işaretlediği görüldü (detay: lib/content-filters.ts). exam_chunks'ta
    // bir created_at kolonu güvenilir şekilde kullanılamadığı
    // için (quiz_sessions'taki "son 24 saat" mantığının aksine) her
    // çalıştırmada TÜM tablodan rastgele bir örneklem alınır — zamanla
    // tüm tabloyu kademeli olarak kapsar.
    const { data: examPool } = await supabaseAdmin
      .from('exam_chunks')
      .select('id, content, exam_resource_id, exam_type, subject, year')
      .limit(MAX_EXAM_CHUNKS_POOL)

    if (examPool?.length) {
      const shuffledExam = [...examPool].sort(() => Math.random() - 0.5).slice(0, MAX_EXAM_CHUNKS_SAMPLE)
      for (const c of shuffledExam) {
        const content = c.content || ''
        const flags: string[] = []
        if (isNonContent(content)) flags.push('front_matter_or_toc')
        if (isKazanimListesi(content)) flags.push('kazanim_listesi_only')
        if (flags.length === 0) continue

        await supabaseAdmin.from('error_reports').insert({
          user_id: null,
          question_text: `[Sınav kitapçığı kalite taraması] chunk id ${c.id}`,
          correct_answer: null,
          user_answer: null,
          topic: c.subject || c.exam_type || '',
          status: 'pending',
          source: 'system_scan',
          issue_type: 'exam_chunk_quality',
          admin_note: `exam_chunks.id: ${c.id} (exam_resource_id: ${c.exam_resource_id}) — sinyaller: ${flags.join(', ')}.`,
        })
        sourceFlagged++
        sourceFlagSummary.push(`exam_chunk ${c.id}: ${flags.join(', ')}`)
      }
    }

    // Sorun bulunduysa admin(ler)e bildirim bırak
    if (totalFlagged > 0 || sourceFlagged > 0) {
      const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true)
      for (const admin of admins || []) {
        await supabaseAdmin.from('notifications').insert({
          user_id: admin.id,
          type: 'content_quality_scan',
          title: '🔍 Otomatik içerik taraması sorun buldu',
          body: `Günlük tarama ${totalScanned} üretilmiş soru + ${(flaggedMebResources?.length || 0) + (examPool?.length ? Math.min(MAX_EXAM_CHUNKS_SAMPLE, examPool.length) : 0)} kaynak/chunk içinden ${totalFlagged + sourceFlagged} tanesinde olası kalite sorunu buldu. Hata Bildirimleri panelinden inceleyebilirsin.`,
          read: false,
          data: { href: '/admin' },
        })
      }
    }

    return NextResponse.json({
      scanned: totalScanned,
      sessionsChecked: sample.length,
      flagged: totalFlagged,
      summary: flaggedSummary,
      sourceScan: {
        mebResourcesChecked: flaggedMebResources?.length || 0,
        examChunksChecked: examPool?.length ? Math.min(MAX_EXAM_CHUNKS_SAMPLE, examPool.length) : 0,
        flagged: sourceFlagged,
        summary: sourceFlagSummary,
      },
    })
  } catch (e: any) {
    console.error('[content-quality-scan] Hata:', e)
    return NextResponse.json({ error: e.message || 'Tarama başarısız.' }, { status: 500 })
  }
}
