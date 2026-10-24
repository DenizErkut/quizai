'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SiteFooter from '@/components/SiteFooter'
import { useT } from '@/lib/i18n/I18nProvider'

const audiences = [
  ['🎒','Öğrenciler için','Kendi hızında ilerle, eksiklerini gör ve sıradaki doğru adımı bil.','/for-students','mint'],
  ['✏️','Öğretmenler için','Sınıfını tek yerden takip et, ödev oluştur ve gelişimi kolayca yorumla.','/for-teachers','sun'],
  ['🌿','Veliler için','Çocuğunun ilerlemesini baskı kurmadan, anlaşılır özetlerle takip et.','/for-parents','peach'],
]
const steps = [
  ['01','Konunu seç','Sınıfını, dersini veya çalışmak istediğin içeriği belirle.'],
  ['02','Sana özel çalış','Pratium seviyene uygun soruları ve tekrarları anında hazırlar.'],
  ['03','İlerlemeni gör','Sadece puanı değil, neyi geliştirdiğini de net biçimde görürsün.'],
]
const faqs = [
  ['Pratium’u ücretsiz deneyebilir miyim?','Pratium, Gümüş, Altın ve Platin planlarıyla ücretli bir platformdur. Gümüş, en uygun fiyatlı giriş planı olarak hemen başlamak isteyenler için idealdir.'],
  ['Hangi seviyeler destekleniyor?','İlkokuldan üniversite ve yetişkin sınavlarına kadar farklı sınıf ve hazırlık seviyeleri desteklenir.'],
  ['Öğretmenler sınıf gelişimini görebilir mi?','Evet. Öğretmen panelinde ödev, sınıf performansı ve öğrenci bazlı gelişim raporları bulunur.'],
  ['Dosyadan soru hazırlayabilir miyim?','Altın ve üzeri planlarda PDF, Word ve görsellerden içerikle uyumlu sorular oluşturabilirsin.'],
]

export default function LandingPage() {
  const router = useRouter()
  const { t } = useT()
  const [checking,setChecking] = useState(true)
  const [openFaq,setOpenFaq] = useState<number|null>(0)
  useEffect(()=>{
    let active = true
    ;(createClient()).auth.getUser()
      .then(({data:{user}}:any)=>{ if (!active) return; user ? router.replace('/quiz') : setChecking(false) })
      .catch(()=>{ if (active) setChecking(false) })
    return () => { active = false }
  },[router])
  if(checking) return <main className="warm-loader"><div className="spinner" /></main>
  return <main className="landing-page">
    <header className="landing-nav"><div className="landing-container nav-inner">
      <Link href="/" className="landing-brand"><img src="/pratium-logo-new.svg" alt="Pratium" /></Link>
      <nav className="landing-links"><a href="#nasil-calisir">{t('Nasıl çalışır?')}</a><Link href="/for-teachers">{t('Öğretmenler için')}</Link><Link href="/pricing">{t('Planlar')}</Link></nav>
      <div className="landing-actions"><Link href="/login" className="warm-link">{t('Giriş yap')}</Link><Link href="/register" className="warm-button warm-button-small">{t('Hemen başla')}</Link></div>
    </div></header>
    <section className="landing-hero"><div className="landing-container hero-grid">
      <div className="hero-copy"><div className="warm-badge">{t('✦ Sana göre şekillenen öğrenme')}</div><h1>{t('Ezberleme.')}<br/><em>{t('Gerçekten öğren.')}</em></h1><p>{t('Pratium güçlü ve gelişime açık konularını anlayıp sana özel bir çalışma yolu çıkarır. Daha az karmaşa, daha çok ilerleme hissi.')}</p><div className="hero-actions"><Link href="/register" className="warm-button">{t('Hemen başla')} <span>→</span></Link><a href="#nasil-calisir" className="warm-button warm-button-quiet">{t('Nasıl çalıştığını gör')}</a></div><div className="hero-proof"><div className="avatar-stack"><span>DE</span><span>AS</span><span>MK</span></div><p><strong>{t('Her seviyeye uygun')}</strong><br/>{t('MEB müfredatı ve 8 farklı soru tipi')}</p></div></div>
      <div className="hero-demo"><div className="demo-top"><span className="demo-subject">{t('Matematik')}</span><span>{t('3 / 8 soru')}</span></div><div className="demo-progress"><span/></div><div className="prati-note"><img src="/mascot-prati-face-v2.webp" alt=""/><span>{t('Harika gidiyorsun! Bu soruyu birlikte düşünelim.')}</span></div><h2>{t('Bir üçgenin iç açıları toplamı kaç derecedir?')}</h2><div className="demo-options"><button>A <span>90°</span></button><button className="selected">B <span>180°</span><b>✓</b></button><button>C <span>270°</span></button></div><div className="demo-footer"><span>{t('🔥 7 günlük seri')}</span><span>{t('Doğru cevap!')}</span></div></div>
    </div></section>
    <section className="audience-section"><div className="landing-container"><div className="section-heading"><span>{t('Kimin için?')}</span><h2>{t('Herkes için daha anlaşılır bir öğrenme deneyimi')}</h2></div><div className="audience-grid">{audiences.map(([icon,title,text,href,color])=><Link href={href} key={title} className={`audience-card ${color}`}><div className="audience-icon">{icon}</div><h3>{t(title)}</h3><p>{t(text)}</p><b>{t('Keşfet')} <span>→</span></b></Link>)}</div></div></section>
    <section className="how-section" id="nasil-calisir"><div className="landing-container how-grid"><div className="how-intro"><div className="warm-badge">{t('Basit ve kişisel')}</div><h2>{t('Başlamak için yalnızca bir konu yeterli.')}</h2><p>{t('Geri kalanını Pratium senin seviyene ve ilerlemene göre şekillendirir.')}</p><Link href="/register" className="warm-button">{t('İlk çalışmanı başlat →')}</Link></div><div className="steps">{steps.map(([n,title,text])=><div className="step" key={n}><span>{n}</span><div><h3>{t(title)}</h3><p>{t(text)}</p></div></div>)}</div></div></section>
    <section className="insight-section"><div className="landing-container insight-grid"><div className="insight-panel"><div className="insight-head"><div><span>{t('Haftalık ilerleme')}</span><strong>%18</strong><small>{t('geçen haftaya göre artış')}</small></div><div className="insight-ring">4<small>/5</small></div></div><div className="chart-bars">{[42,64,51,78,68,92,74].map((h,i)=><span key={i} style={{height:`${h}%`}} />)}</div><div className="chart-days">{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d=><span key={d}>{t(d)}</span>)}</div></div><div className="insight-copy"><div className="warm-badge">{t('Puanın ötesinde')}</div><h2>{t('Ne yaptığını değil, nasıl geliştiğini gör.')}</h2><p>{t('Pratium yanlışlarını konu bazında analiz eder, tekrar zamanını planlar ve bir sonraki en doğru adımı sade bir dille gösterir.')}</p><ul><li>{t('✓ Kişisel gelişim özeti')}</li><li>{t('✓ Akıllı tekrar planı')}</li><li>{t('✓ Öğrenci, öğretmen ve veli görünümü')}</li></ul></div></div></section>
    <section className="faq-section"><div className="landing-container faq-grid"><div><span className="warm-badge">{t('Merak edilenler')}</span><h2>{t('Aklında soru kalmasın.')}</h2><p>{t('Başka bir konuda yardıma ihtiyacın varsa bize her zaman ulaşabilirsin.')}</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button onClick={()=>setOpenFaq(openFaq===i?null:i)} aria-expanded={openFaq===i}><span>{t(q)}</span><b>{openFaq===i?'−':'+'}</b></button>{openFaq===i&&<p>{t(a)}</p>}</div>)}</div></div></section>
    <section className="final-cta"><div className="landing-container"><img src="/mascot-prati-v2.webp" alt="Prati maskotu"/><div><span>{t('Bugün küçük bir adım at.')}</span><h2>{t('Öğrenme yolculuğunu sana özel hale getir.')}</h2></div><Link href="/register" className="warm-button warm-button-light">{t('Hemen başla →')}</Link></div></section>
    <SiteFooter />
  </main>
}
