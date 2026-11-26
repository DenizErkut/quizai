// app/sitemap.ts
// Herkese açık (giriş gerektirmeyen) sayfalar + MEB müfredat içerik merkezi sayfaları.
// lastModified: statik sayfalar için gerçek içerik tarihi (her istekte "şimdi" yazmak arama motorlarına güvenilmez sinyal verir);
// müfredat sayfaları için veri tarihi bilinmediğinden belirtilmez.
import type { MetadataRoute } from 'next'
import { loadHubIndex } from '@/lib/curriculum-hub'
import { MIN_INDEXABLE_OBJECTIVES } from '@/lib/curriculum-slug'

const STATIC_LASTMOD = new Date('2026-11-25T00:00:00Z')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://pratium.com'
  const pages: MetadataRoute.Sitemap = [
    { url: base, lastModified: STATIC_LASTMOD, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/for-students`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/for-parents`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/for-teachers`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/mufredat`, lastModified: STATIC_LASTMOD, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/methodology`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/faq`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/hakkimizda`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/pricing`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/ozel-kocluk`, lastModified: STATIC_LASTMOD, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/privacy`, lastModified: STATIC_LASTMOD, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/cookie-policy`, lastModified: STATIC_LASTMOD, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/kaynaklar`, lastModified: STATIC_LASTMOD, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: STATIC_LASTMOD, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/mesafeli-satis`, lastModified: STATIC_LASTMOD, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/teslimat-iade`, lastModified: STATIC_LASTMOD, changeFrequency: 'yearly', priority: 0.3 },
  ]
  try {
    const hub = (await loadHubIndex()).filter(pair => pair.count >= MIN_INDEXABLE_OBJECTIVES)
    for (const pair of hub) pages.push({ url: `${base}/mufredat/${pair.gradeSlug}/${pair.subjectSlug}`, changeFrequency: 'monthly', priority: 0.7 })
  } catch { /* veritabanı erişilemezse yalnız statik sayfalar listelenir */ }
  return pages
}
