// app/robots.ts
// Next.js App Router convention — /robots.txt'i otomatik üretir.
// Daha önce pratium.com'da hiç robots.txt yoktu (pratium.com.tr kurumsal
// statik sitede vardı, ama ürün uygulamasının kendisinde eksikti).
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/profile/',
          '/dashboard/',
          '/quiz/',
          '/exam/',
          '/acik-uclu/',
          '/checkout/',
          '/classes/',
          '/institution/',
          '/teacher/',
          '/parent/',
          '/notifications/',
          '/notes/',
          '/plan/',
          '/analysis/',
          '/report/',
          '/archive/',
          '/live/',
          '/daily/',
          '/challenge/',
          '/leaderboard/',
          '/referral/',
          '/assignments/',
          '/review/',
          '/reading/',
          '/pdf-tools/',
        ],
      },
    ],
    sitemap: 'https://pratium.com/sitemap.xml',
  }
}
