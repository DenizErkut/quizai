import type { Metadata } from 'next'
import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'
import { loadHubIndex } from '@/lib/curriculum-hub'
import { MIN_INDEXABLE_OBJECTIVES } from '@/lib/curriculum-slug'

export const revalidate = 86400

export const metadata: Metadata = {
  title: 'MEB Müfredatı ve Kazanımlar: Sınıf ve Derse Göre | Pratium',
  description: '1. sınıftan 12. sınıfa MEB öğretim programı kazanımları: ders ve sınıfa göre kazanım kodları, üniteler ve öğrenme çıktıları. Pratium her kazanım için seviyene uygun sorular hazırlar.',
  alternates: { canonical: '/mufredat' },
}

export default async function CurriculumIndexPage() {
  const pairs = await loadHubIndex()
  const grades = [...new Set(pairs.map(pair => pair.gradeNumber))]
  const total = pairs.reduce((sum, pair) => sum + pair.count, 0)
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Pratium', item: 'https://pratium.com' }, { '@type': 'ListItem', position: 2, name: 'MEB Müfredatı', item: 'https://pratium.com/mufredat' }],
  }
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}><img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} /></Link>
        <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>MEB Müfredatı ve Kazanımlar</h1>
        <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          Bu sayfalar, T.C. Millî Eğitim Bakanlığı öğretim programlarındaki kazanımları sınıf ve derse göre listeler. Pratium kataloğunda şu an {pairs.length} ders-sınıf birleşiminde {total.toLocaleString('tr-TR')} doğrulanmış kazanım bulunuyor.
          Her kazanım için kodunu, öğrenme çıktısını ve bağlı olduğu üniteyi görebilir, Pratium ile o kazanıma uygun, seviyene göre ayarlanan sorular çözebilirsin.
        </p>
        {grades.map(grade => (
          <section key={grade} style={{ marginBottom: '1.25rem' }}>
            <h2 className="serif" style={{ fontSize: '20px', marginBottom: '0.5rem' }}>{grade}. Sınıf</h2>
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', listStyle: 'none', padding: 0 }}>
              {pairs.filter(pair => pair.gradeNumber === grade).map(pair => (
                <li key={pair.subjectSlug}>
                  {pair.count >= MIN_INDEXABLE_OBJECTIVES
                    ? <Link href={`/mufredat/${pair.gradeSlug}/${pair.subjectSlug}`} className="card-sm" style={{ display: 'block', textDecoration: 'none', color: 'var(--text)', fontSize: '14px' }}>{pair.subject} <small style={{ color: 'var(--text3)' }}>· {pair.count} kazanım</small></Link>
                    : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>Kaynak: T.C. Millî Eğitim Bakanlığı Talim ve Terbiye Kurulu Başkanlığı öğretim programları; kazanımlar Pratium kataloğunda doğrulanmıştır. Ayrıntı için <Link href="/kaynaklar">Kaynaklar ve Atıflar</Link> sayfasına bakın.</p>
      </div>
      <SiteFooter />
    </main>
  )
}
