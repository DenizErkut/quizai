import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { isPaidCoachPlan } from '@/lib/coach-access'

export const runtime = 'nodejs'
export const maxDuration = 60
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

// 23 Eylül 2026 (16. güncelleme) — Deniz'in bildirdiği hata: "ikonları da
// seslendiriyor, yapmasın." coach_messages.content, sohbet balonunda
// GÖRÜNTÜLENMEK için markdown (**kalın**, madde imleri, başlıklar) ve
// emoji/sembol (📊 ✅ ⚠️ ➡️ ▶ vb.) içeriyor — bunlar ekranda güzel duruyor
// ama TTS modeline OLDUĞU GİBİ gönderilince model onları harfi harfine
// seslendirmeye/tarif etmeye çalışıyordu. Çözüm: TTS'e giden metni ayrı
// bir "konuşma metnine" temizliyoruz — coach_messages.content'in kendisi
// (sohbet ekranındaki görünüm) HİÇ değişmiyor, sadece bu endpoint'ten
// OpenAI'ye giden kopya temizleniyor.
function sanitizeForSpeech(raw: string): string {
  return raw
    // Emoji + sembol/dingbat/ok/geometrik şekil blokları (📊 ✅ ⚠️ ➡️ ▶ ★ vb.)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    // Kod blokları / satır içi kod işaretleri
    .replace(/`{1,3}/g, '')
    // Markdown başlıkları ("## Başlık" → "Başlık")
    .replace(/^#{1,6}\s*/gm, '')
    // Madde imleri ve numaralı liste önekleri (satır başındaki "- ", "• ", "1. ")
    .replace(/^[ \t]*[-•*]\s+/gm, '')
    .replace(/^[ \t]*\d+\.\s+/gm, '')
    // Kalın/italik işaretleri — metni koru, sadece işaretleri kaldır
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Boşluk/satır sonu fazlalıklarını sadeleştir
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } }) as any
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: profile } = await admin.from('profiles').select('plan').eq('id', user.id).maybeSingle()
  if (!isPaidCoachPlan(profile?.plan)) return NextResponse.json({ error: 'Koç sesi ücretli planlara özeldir.' }, { status: 403 })
  const { messageId } = await req.json().catch(() => ({}))
  if (typeof messageId !== 'string') return NextResponse.json({ error: 'Mesaj gerekli.' }, { status: 400 })
  const { data: message } = await admin.from('coach_messages').select('content,role,conversation_id').eq('id', messageId).maybeSingle()
  if (!message || message.role !== 'assistant') return NextResponse.json({ error: 'Mesaj bulunamadı.' }, { status: 404 })
  const { data: conversation } = await admin.from('coach_conversations').select('user_id').eq('id', message.conversation_id).maybeSingle()
  if (conversation?.user_id !== user.id) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      // 23 Eylül 2026 (15. güncelleme) — Deniz'in isteği: "sesi daha insani
      // hale getirelim, yaşlı bir adamın sesi olsun ama dinç olsun."
      // 'cedar' sıcak ama belirgin bir yaş/karakter taşımıyordu (OpenAI'nin
      // "en yüksek kalite" için önerdiği nötr yeni nesil ses). 'onyx' —
      // düşük perdeli, hafif kalın/pürüzlü dokusuyla — tanıdık bir "olgun,
      // tecrübeli adam" izlenimi veren, uzun süredir kullanılan bir ses;
      // ama doğal temposu ölçülü/ağır kaçabiliyor, bu yüzden "dinç" tarafı
      // instructions'da ve speed'de vurgulanıyor (0.96 yerine 1.0 — yaşlı
      // ama YORGUN değil).
      voice: 'onyx',
      input: sanitizeForSpeech(String(message.content)).slice(0, 4096),
      // 16. güncelleme — Deniz'in isteği: "biraz daha insani ve hızlı
      // konuşabilir." Ölçülü/resmi bir anlatımdan gerçek bir insanın günlük
      // konuşma temposuna çekildi; speed de 1.0 → 1.08.
      instructions: 'Türkçe konuş. Yaşlı, tecrübeli bir eğitim koçusun — sesin derin ve olgun, hafif kalın bir dokuya sahip. Ama ASLA yorgun, ağır, durgun veya bitkin çıkma: dinç, canlı, enerji dolu bir tempoda konuş. Gerçek bir insanın günlük sohbet temposunda, doğal vurgularla ve akıcı konuş — yapay, resmi bir spiker tonu veya gereksiz duraklamalar OLMASIN. Sıcak ve berrak bir anlatım kullan, abartılı oyunculuk yapma.',
      response_format: 'mp3',
      speed: 1.08,
    }),
  })
  if (!response.ok) {
    console.error('[coach-speech] OpenAI error:', response.status, await response.text())
    return NextResponse.json({ error: 'Ses şu anda oluşturulamadı.' }, { status: 502 })
  }
  return new NextResponse(await response.arrayBuffer(), {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600', 'X-AI-Voice': 'true' },
  })
}
