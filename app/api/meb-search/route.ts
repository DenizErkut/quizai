// app/api/meb-search/route.ts
// Quiz üretimi sırasında ilgili MEB chunk'larını semantic search ile getir
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } })
      }
    )
    const data = await res.json()
    return data?.embedding?.values || null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const sbAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await sbAuth.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })

  try {
    const { topic, grade, subject, unit, level, limit = 4 } = await req.json()

    // Embedding üret
    const embedding = await embedQuery(topic)

    let context = ''

    if (embedding) {
      // Semantic search
      const { data: chunks } = await adminDb.rpc('search_meb_chunks', {
        query_embedding: JSON.stringify(embedding),
        filter_grade: grade || null,
        filter_subject: subject || null,
        filter_unit: unit || null,
        match_count: limit,
      })

      if (chunks?.length) {
        context = chunks.map((c: any, i: number) =>
          `[MEB Kaynak ${i + 1} - ${c.subject}/${c.unit}]\n${c.content}`
        ).join('\n\n---\n\n')
        console.log(`[meb-search] semantic: ${chunks.length} chunks found for "${topic}"`)
      }
    }

    // Embedding yoksa veya sonuç bulunamadıysa — keyword search
    if (!context) {
      let query = adminDb
        .from('meb_chunks')
        .select('content, subject, unit')
        .limit(limit)

      if (level) query = query.eq('level', level)
      if (subject) query = query.eq('subject', subject)
      if (topic) query = query.ilike('content', `%${topic.split(' ')[0]}%`)

      const { data: chunks } = await query
      if (chunks?.length) {
        context = chunks.map((c: any, i: number) =>
          `[MEB Kaynak ${i + 1} - ${c.subject}/${c.unit}]\n${c.content}`
        ).join('\n\n---\n\n')
        console.log(`[meb-search] keyword: ${chunks.length} chunks found`)
      }
    }

    return NextResponse.json({ context, found: context.length > 0 })
  } catch (e: any) {
    console.error('[meb-search] error:', e.message)
    return NextResponse.json({ context: '', found: false })
  }
}
