import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('grade').eq('id', user.id).single()

  const { topics } = await req.json()
  const apiKey = process.env.YOUTUBE_API_KEY

  function gradeLabel(grade: string): string {
    if (!grade) return 'konu anlatımı'
    if (grade.includes('ilkokul')) return 'ilkokul konu anlatımı'
    if (grade.includes('ortaokul')) return 'ortaokul konu anlatımı'
    if (grade.includes('lise')) return 'lise konu anlatımı'
    return 'üniversite konu anlatımı'
  }

  const grade = profile?.grade || ''
  const gradeStr = gradeLabel(grade)
  const links: Record<string, any> = {}

  for (const topic of (topics || []).slice(0, 5)) {
    if (!apiKey) {
      links[topic] = {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' ' + gradeStr)}`,
        title: `${topic} — Arama`, channel: '', thumbnail: '',
      }
      continue
    }

    // Çok spesifik arama — konunun tam adıyla
    const searchQuery = `${topic} ${gradeStr} öğretmen ders`
    const encoded = encodeURIComponent(searchQuery)

    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet` +
        `&q=${encoded}` +
        `&type=video` +
        `&relevanceLanguage=tr` +
        `&regionCode=TR` +
        `&videoDuration=medium` +
        `&order=relevance` +  // viewCount değil relevance — konuya daha yakın
        `&maxResults=5` +
        `&safeSearch=strict` +
        `&key=${apiKey}`
      )

      if (!res.ok) throw new Error('YouTube API error')
      const data = await res.json()
      const items = data.items || []

      if (items.length === 0) {
        // Fallback — daha basit arama
        const res2 = await fetch(
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet&q=${encodeURIComponent(topic + ' konu anlatımı')}&type=video&relevanceLanguage=tr&maxResults=3&safeSearch=strict&key=${apiKey}`
        )
        const data2 = await res2.json()
        const items2 = data2.items || []
        if (items2.length > 0) {
          const v = items2[0]
          links[topic] = { url: `https://www.youtube.com/watch?v=${v.id.videoId}`, title: v.snippet.title, channel: v.snippet.channelTitle, thumbnail: v.snippet.thumbnails?.default?.url || '' }
        } else {
          links[topic] = { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`, title: '', channel: '', thumbnail: '' }
        }
        continue
      }

      // Eğitim kanallarını ve konu başlığını içeren videoları önceliklendir
      const eduKeywords = ['konu anlatım', 'öğretmen', 'ders', 'eğitim', 'matematik', 'fen', 'türkçe', 'fizik', 'kimya', 'biyoloji', 'tarih', 'coğrafya', 'akademi', 'sınıf']
      const topicLower = topic.toLowerCase()

      let best = items[0]
      let bestScore = 0

      for (const item of items) {
        const title = (item.snippet.title || '').toLowerCase()
        const channel = (item.snippet.channelTitle || '').toLowerCase()
        let score = 0

        // Konu başlığı videoda geçiyor mu?
        const topicWords = topicLower.split(' ').filter((w: string) => w.length > 2)
        topicWords.forEach((word: string) => {
          if (title.includes(word)) score += 3
        })

        // Eğitim anahtar kelimeleri
        eduKeywords.forEach(kw => {
          if (title.includes(kw) || channel.includes(kw)) score += 1
        })

        // Shorts değilse bonus
        if (!title.includes('#short') && !title.includes('shorts')) score += 2

        if (score > bestScore) { bestScore = score; best = item }
      }

      links[topic] = {
        url: `https://www.youtube.com/watch?v=${best.id.videoId}`,
        title: best.snippet.title,
        channel: best.snippet.channelTitle,
        thumbnail: best.snippet.thumbnails?.default?.url || '',
      }
    } catch (e) {
      console.error('YouTube error:', e)
      links[topic] = {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`,
        title: '', channel: '', thumbnail: '',
      }
    }
  }

  return NextResponse.json({ links })
}
