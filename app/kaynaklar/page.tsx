import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export const metadata = { title: 'Kaynaklar ve Atıflar | Pratium' }

const sections: [string, string][] = [
  ['Avustralya Müfredatı (ACARA)', '© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2010 to present, unless otherwise indicated. This material was downloaded from the Australian Curriculum website (www.australiancurriculum.edu.au) (accessed 23 October 2026) and was modified (first letter capitalised, formatting symbols simplified, assigned to Pratium grade levels). The material is licensed under CC BY 4.0 Attribution 4.0 International Deed (https://creativecommons.org/licenses/by/4.0/). ACARA does not endorse any product that uses the Australian Curriculum.'],
  ['İngiltere Ulusal Müfredatı (DfE)', 'Contains public sector information licensed under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Kaynak: Department for Education, National curriculum in England: mathematics programmes of study (gov.uk). Metinler Pratium sınıf düzeylerine göre düzenlenmiştir.'],
  ['Türkiye (MEB)', 'Türkiye için kazanımlar ve kaynaklar, T.C. Milli Eğitim Bakanlığı Talim ve Terbiye Kurulu Başkanlığı öğretim programlarına dayanır.'],
]

export default function SourcesPage() {
  return <main className="legal-page"><div className="legal-shell"><Link href="/" className="legal-logo"><img src="/pratium-logo-new.svg" alt="Pratium" /></Link><span className="warm-badge">Kaynaklar</span><h1>Kaynaklar ve Atıflar</h1><div className="legal-intro">Pratium’da kullanılan müfredat kazanımlarının kaynakları ve lisans atıfları aşağıdadır.</div>{sections.map(([title, text]) => <section className="card" key={title}><h2>{title}</h2><p>{text}</p></section>)}<div className="legal-links"><Link href="/methodology">Metodoloji</Link></div></div><SiteFooter /></main>
}
