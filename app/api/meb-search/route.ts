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
      // Önce unit ile eşleştir (en güvenilir)
      if (unit) {
        const { data: unitChunks } = await adminDb
          .from('meb_chunks')
          .select('content, subject, unit, grade')
          .ilike('unit', `%${unit}%`)
          .eq(subject ? 'subject' : 'id', subject || '')
          .limit(limit)

        if (unitChunks?.length) {
          context = unitChunks.map((c: any, i: number) =>
            `[MEB Kaynak ${i + 1} - ${c.subject}/${c.unit}]\n${c.content}`
          ).join('\n\n---\n\n')
          console.log(`[meb-search] unit match: ${unitChunks.length} chunks for "${unit}"`)
        }
      }

      // Unit ile bulunamadıysa subject + grade ile ara
      if (!context && (subject || grade)) {
        let q = adminDb
          .from('meb_chunks')
          .select('content, subject, unit, grade')
          .limit(limit)
        if (subject) q = q.ilike('subject', `%${subject}%`)
        if (grade) q = q.eq('grade', grade)
        const { data: subjectChunks } = await q
        if (subjectChunks?.length) {
          context = subjectChunks.map((c: any, i: number) =>
            `[MEB Kaynak ${i + 1} - ${c.subject}/${c.unit}]\n${c.content}`
          ).join('\n\n---\n\n')
          console.log(`[meb-search] subject match: ${subjectChunks.length} chunks`)
        }
      }

      // Hiçbiri yoksa topic kelimeleriyle ara
      if (!context && topic) {
        const words = topic.split(' ').filter((w: string) => w.length > 2)
        const searchWord = words[words.length - 1] || topic // Son anlamlı kelime
        const { data: topicChunks } = await adminDb
          .from('meb_chunks')
          .select('content, subject, unit')
          .ilike('content', `%${searchWord}%`)
          .limit(limit)
        if (topicChunks?.length) {
          context = topicChunks.map((c: any, i: number) =>
            `[MEB Kaynak ${i + 1} - ${c.subject}/${c.unit}]\n${c.content}`
          ).join('\n\n---\n\n')
          console.log(`[meb-search] topic keyword: ${topicChunks.length} chunks for "${searchWord}"`)
        }
      }
    }

    // Sınav kitapçığı chunk'larını da ekle
    if (subject || topic) {
      let examQ = adminDb
        .from('exam_chunks')
        .select('content, subject, exam_type, year')
        .limit(3)

      if (subject) examQ = examQ.ilike('subject', `%${subject}%`)
      else if (topic) {
        const words = topic.split(' ').filter((w: string) => w.length > 3)
        if (words.length > 0) examQ = examQ.ilike('content', `%${words[0]}%`)
      }

      const { data: examChunks } = await examQ
      if (examChunks?.length) {
        const examContext = examChunks.map((c: any, i: number) =>
          `[Sınav Sorusu ${i + 1} - ${c.subject || ''} ${c.exam_type || ''} ${c.year || ''}]\n${c.content}`
        ).join('\n\n---\n\n')
        context = context ? context + '\n\n' + examContext : examContext
        console.log(`[meb-search] exam chunks: ${examChunks.length} found`)
      }
    }

    return NextResponse.json({ context, found: context.length > 0 })
  } catch (e: any) {
    console.error('[meb-search] error:', e.message)
    return NextResponse.json({ context: '', found: false })
  }
}
