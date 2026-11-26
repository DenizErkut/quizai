import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SiteFooter from '@/components/SiteFooter'
import { loadHubPage } from '@/lib/curriculum-hub'
import { MIN_INDEXABLE_OBJECTIVES } from '@/lib/curriculum-slug'

export const revalidate = 86400
export async function generateStaticParams() { return [] } // sayfalar ilk istekte üretilir, sonra önbelleklenir (ISR)

type Params = { params: Promise<{ grade: string; subject: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { grade, subject } = await params
  const result = await loadHubPage(grade, subject)
  if (!result) return { title: 'Sayfa bulunamadı | Pratium', robots: { index: false } }
  const { page } = result
  const title = `${page.grade} ${page.subject} Kazanımları (MEB) | Pratium`
  const description = `${page.grade} ${page.subject} dersi MEB öğretim programı kazanımları: ${page.count} kazanım, ${page.units.length} ünite/öğrenme alanı. Kazanım kodları ve öğrenme çıktıları; Pratium ile her kazanıma uygun sorular çöz.`
  return {
    title, description,
    alternates: { canonical: `/mufredat/${page.gradeSlug}/${page.subjectSlug}` },
    robots: page.count >= MIN_INDEXABLE_OBJECTIVES ? undefined : { index: false, follow: true }, // eksik/ince veri: dizine alınmaz
    openGraph: { title, description, url: `https://pratium.com/mufredat/${page.gradeSlug}/${page.subjectSlug}`, type: 'article', locale: 'tr_TR' },
  }
}

export default async function CurriculumPage({ params }: Params) {
  const { grade, subject } = await params
  const result = await loadHubPage(grade, subject)
  if (!result) notFound()
  const { page, all } = result
  const url = `https://pratium.com/mufredat/${page.gradeSlug}/${page.subjectSlug}`
  const sameGrade = all.filter(pair => pair.gradeSlug === page.gradeSlug && pair.subjectSlug !== page.subjectSlug && pair.count >= MIN_INDEXABLE_OBJECTIVES)
  const sameSubject = all.filter(pair => pair.subjectSlug === page.subjectSlug && pair.gradeSlug !== page.gradeSlug && pair.count >= MIN_INDEXABLE_OBJECTIVES)
  const unitNames = page.units.map(unit => unit.unit)
  const faqs: Array<[string, string]> = [
    [`${page.grade} ${page.subject} dersinde kaç kazanım var?`, `Pratium kataloğunda ${page.grade} ${page.subject} dersi için ${page.count} doğrulanmış kazanım listelenir; bunlar ${page.units.length} ünite veya öğrenme alanında gruplanır: ${unitNames.slice(0, 8).join(', ')}.`],
    ['Kazanım kodları ne anlama gelir?', 'Kazanım kodu, MEB öğretim programındaki bir öğrenme çıktısını tanımlayan kısaltmadır; ders, sınıf ve sıra numarasını içerir. Bir sorunun hangi kazanımı ölçtüğünü açıkça belirtmek için kullanılır.'],
    ['Pratium bu kazanımlar için soru hazırlar mı?', 'Evet. Pratium, sınıfına ve konuna göre sorular üretir; soruları ilgili kazanımla eşleştirmeyi ve seviyene göre zorluğu ayarlamayı hedefler. Konu düzeyinde eşleşen kazanım yoksa sorular kazanım hesabına girmez.'],
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Pratium', item: 'https://pratium.com' },
        { '@type': 'ListItem', position: 2, name: 'MEB Müfredatı', item: 'https://pratium.com/mufredat' },
        { '@type': 'ListItem', position: 3, name: `${page.grade} ${page.subject}`, item: url }] },
      { '@type': 'ItemList', name: `${page.grade} ${page.subject} kazanımları`, numberOfItems: page.count,
        itemListElement: page.units.flatMap(unit => unit.objectives).slice(0, 100).map((objective, index) => ({ '@type': 'ListItem', position: index + 1, name: `${objective.code} ${objective.title}` })) },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  }
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1rem' }}><img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} /></Link>
        <nav aria-label="Konum" style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '0.75rem' }}>
          <Link href="/">Pratium</Link> › <Link href="/mufredat">MEB Müfredatı</Link> › {page.grade} {page.subject}
        </nav>
        <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>{page.grade} {page.subject} Kazanımları (MEB)</h1>
        <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.7, marginBottom: '1.25rem' }}>
          MEB öğretim programına göre {page.grade} {page.subject} dersi için Pratium kataloğunda {page.count} doğrulanmış kazanım bulunuyor. Kazanımlar {page.units.length} ünite veya öğrenme alanında toplanır: {unitNames.join(', ')}.
          Aşağıda her kazanımın kodunu ve öğrenme çıktısını görebilirsin.
        </p>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <Link href="/register" className="btn btn-primary">Bu kazanımlara uygun soru çöz →</Link>
        </div>
        {page.units.map(unit => (
          <section key={unit.unit} className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="serif" style={{ fontSize: '18px', marginBottom: '0.6rem' }}>{unit.unit}</h2>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.8, fontSize: '14px' }}>
              {unit.objectives.map(objective => <li key={objective.code}><strong>{objective.code}</strong> — {objective.title}</li>)}
            </ul>
          </section>
        ))}
        <h2 className="serif" style={{ fontSize: '20px', margin: '1.5rem 0 0.75rem' }}>Sık sorulan sorular</h2>
        {faqs.map(([q, a]) => <div key={q} style={{ marginBottom: '0.9rem' }}><h3 style={{ fontSize: '15px', marginBottom: '4px' }}>{q}</h3><p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7 }}>{a}</p></div>)}
        {(sameGrade.length > 0 || sameSubject.length > 0) && (
          <section style={{ marginTop: '1.5rem', fontSize: '13px' }}>
            {sameGrade.length > 0 && <p><strong>{page.grade} diğer dersler:</strong> {sameGrade.map(pair => <Link key={pair.subjectSlug} href={`/mufredat/${pair.gradeSlug}/${pair.subjectSlug}`} style={{ marginRight: '10px' }}>{pair.subject}</Link>)}</p>}
            {sameSubject.length > 0 && <p><strong>{page.subject} diğer sınıflar:</strong> {sameSubject.map(pair => <Link key={pair.gradeSlug} href={`/mufredat/${pair.gradeSlug}/${pair.subjectSlug}`} style={{ marginRight: '10px' }}>{pair.grade}</Link>)}</p>}
          </section>
        )}
        <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, marginTop: '1.5rem' }}>
          Kaynak: T.C. Millî Eğitim Bakanlığı Talim ve Terbiye Kurulu Başkanlığı öğretim programları; kazanımlar Pratium kataloğunda doğrulanmıştır{page.updatedAt ? ` (son güncelleme: ${new Date(page.updatedAt).toLocaleDateString('tr-TR')})` : ''}. Ayrıntı: <Link href="/kaynaklar">Kaynaklar ve Atıflar</Link>.
        </p>
      </div>
      <SiteFooter />
    </main>
  )
}
