// Sunucu bileşeni: sayfa için BreadcrumbList JSON-LD (Pratium > Sayfa adı).
export default function BreadcrumbJsonLd({ name, path }: { name: string; path: string }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Pratium', item: 'https://pratium.com' },
      { '@type': 'ListItem', position: 2, name, item: `https://pratium.com${path}` },
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
