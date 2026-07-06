// app/api/reading/tts/route.ts
// Verilen metni OpenAI TTS ile sesli okur, mp3 olarak döner.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  // Günlük üst sınır — maliyeti kontrol altında tutmak için (bir kitap ~yüzlerce parça olabilir)
  const rl = await checkRateLimit(user.id, { endpoint: 'reading-tts', limit: 600 })
  if (!rl.allowed) return rateLimitExceeded(rl)

  try {
    const { text, voice } = await req.json()
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Okunacak metin gerekli.' }, { status: 400 })
    }

    const input = text.slice(0, 4000) // OpenAI TTS tek istek karakter sınırı

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: voice || 'nova',
        input,
        response_format: 'mp3',
        speed: 1.0,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[reading/tts] OpenAI hatasi:', errText)
      return NextResponse.json({ error: 'Ses üretilemedi.' }, { status: 502 })
    }

    const audioBuffer = await res.arrayBuffer()
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=86400',
        'X-RateLimit-Remaining': rl.remaining.toString(),
      },
    })
  } catch (e: any) {
    console.error('[reading/tts]', e)
    return NextResponse.json({ error: e?.message || 'Ses üretilemedi.' }, { status: 500 })
  }
}
