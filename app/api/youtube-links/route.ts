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

  // Kullanıcının sınıfını al — sınıfa göre arama terimini özelleştir
  const { data: profile } = await supabase
    .from('profiles')
    .select('grade')
    .eq('id', user.id)
    .single()

  const { topics, wrongQuestions } = await req.json()
  const apiKey = process.env.YOUTUBE_API_KEY

  const links: Record<string, { url: string; title: string; channel: string; thumbnail: string }> = {}

  // Sınıf seviyesi etiketi
  function gradeTag(grade: string): string {
    if (!grade) return 'konu anlatımı'
    if (grade.includes('ilkokul')) return 'ilkokul konu anlatımı'
    if (grade.includes('ortaokul')) return 'ortaokul konu anlatımı'
    if (grade.includes('lise')) return 'lise konu anlatımı'
    return 'üniversite konu anlatımı'
  }

  const gradeLabel = gradeTag(profile?.grade || '')

  for (const topic of (topics || []).slice(0, 5)) {
    try {
      // Arama stratejisi:
      // 1. Önce konuya + sınıf seviyesine özel eğitim videosu ara
      // 2. Türkçe, viewCount'a göre sırala
      // 3. Shorts değil, uzun format tercih et (videoDuration=medium veya long)
      
      const searchQuery = `${topic} ${gradeLabel} öğretmen`
      const encoded = encodeURIComponent(searchQuery)

      if (!apiKey) {
        // API key yoksa fallback — en azından iyi bir arama URL'i ver
        links[topic] = {
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' ' + gradeLabel + ' öğretmen')}&sp=CAISAhAB`,
          title: `${topic} — YouTube Arama`,
          channel: 'YouTube',
          thumbnail: '',
        }
        continue
      }

      // YouTube Data API v3 — viewCount sıralaması, Türkçe, orta/uzun video
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search` +
        `?part=snippet` +
        `&q=${encoded}` +
        `&type=video` +
        `&relevanceLanguage=tr` +
        `&regionCode=TR` +
        `&videoDuration=medium` +        // 4-20 dakika arası (Shorts değil)
        `&order=viewCount` +             // En çok izlenene göre
        `&maxResults=5` +                // 5 aday al, en iyisini seç
        `&safeSearch=strict` +           // Güvenli içerik
        `&key=${apiKey}`
      )

      if (!res.ok) {
        console.error('YouTube API error:', res.status)
        links[topic] = {
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
          title: `${topic} Arama`,
          channel: '',
          thumbnail: '',
        }
        continue
      }

      const data = await res.json()
      const items = data.items || []

      if (items.length === 0) {
        // Sonuç yoksa daha geniş arama yap
        const res2 = await fetch(
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet` +
          `&q=${encodeURIComponent(topic + ' konu anlatımı')}` +
          `&type=video` +
          `&relevanceLanguage=tr` +
          `&order=viewCount` +
          `&maxResults=3` +
          `&safeSearch=strict` +
          `&key=${apiKey}`
        )
        const data2 = await res2.json()
        const items2 = data2.items || []
        if (items2.length > 0) {
          const video = items2[0]
          links[topic] = {
            url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
            title: video.snippet.title,
            channel: video.snippet.channelTitle,
            thumbnail: video.snippet.thumbnails?.default?.url || '',
          }
        } else {
          links[topic] = {
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`,
            title: `${topic} Arama`,
            channel: '',
            thumbnail: '',
          }
        }
        continue
      }

      // En iyi videoyu seç:
      // Öncelik: bilinen eğitim kanalları
      const eduChannels = [
        'Rehber Matematik', 'Feza Matematik', 'Tonguç Akademi',
        'Hocalara Geldik', 'Birikim Yayınları', 'YKS Kampı',
        'Engin Demirci', 'Özdebir', 'Matematik Delisi',
        'Fen Bilimleri', 'Türkçe Dersi', 'Edebiyat',
        'Konu Anlatımı', 'Öğretmen', 'Akademi', 'Eğitim'
      ]

      let bestVideo = items[0]
      for (const item of items) {
        const channelTitle = item.snippet.channelTitle || ''
        const videoTitle = item.snippet.title || ''
        const isEdu = eduChannels.some(ch =>
          channelTitle.toLowerCase().includes(ch.toLowerCase()) ||
          videoTitle.toLowerCase().includes('konu anlatım') ||
          videoTitle.toLowerCase().includes('öğretmen') ||
          videoTitle.toLowerCase().includes('ders')
        )
        if (isEdu) {
          bestVideo = item
          break
        }
      }

      links[topic] = {
        url: `https://www.youtube.com/watch?v=${bestVideo.id.videoId}`,
        title: bestVideo.snippet.title,
        channel: bestVideo.snippet.channelTitle,
        thumbnail: bestVideo.snippet.thumbnails?.default?.url || '',
      }

    } catch (e) {
      console.error(`YouTube error for topic "${topic}":`, e)
      links[topic] = {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic + ' konu anlatımı')}`,
        title: `${topic} Arama`,
        channel: '',
        thumbnail: '',
      }
    }
  }

  return NextResponse.json({ links })
}
