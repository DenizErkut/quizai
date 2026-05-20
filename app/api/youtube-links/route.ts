import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const { topics } = await req.json()
  const apiKey = process.env.YOUTUBE_API_KEY

  if (!apiKey) {
    // API key yoksa arama URL döndür
    const links: Record<string, string> = {}
    for (const topic of topics) {
      links[topic] = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`
    }
    return NextResponse.json({ links, mode: 'search' })
  }

  const links: Record<string, string> = {}

  for (const topic of topics.slice(0, 5)) {
    try {
      const query = encodeURIComponent(`${topic} konu anlatımı lise ortaokul`)
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&videoDuration=short&maxResults=1&relevanceLanguage=tr&key=${apiKey}`
      )
      const data = await res.json()
      const videoId = data.items?.[0]?.id?.videoId
      if (videoId) {
        links[topic] = `https://www.youtube.com/watch?v=${videoId}`
      } else {
        links[topic] = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`
      }
    } catch {
      links[topic] = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`
    }
  }

  return NextResponse.json({ links, mode: 'direct' })
}
