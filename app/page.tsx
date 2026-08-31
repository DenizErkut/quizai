'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SiteFooter from '@/components/SiteFooter'

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
  ['Pratium’u ücretsiz deneyebilir miyim?','Evet. Ücretsiz planla hemen test oluşturmaya ve temel gelişim özelliklerini kullanmaya başlayabilirsin.'],
  ['Hangi seviyeler destekleniyor?','İlkokuldan üniversite ve yetişkin sınavlarına kadar farklı sınıf ve hazırlık seviyeleri desteklenir.'],
  ['Öğretmenler sınıf gelişimini görebilir mi?','Evet. Öğretmen panelinde ödev, sınıf performansı ve öğrenci bazlı gelişim raporları bulunur.'],
  ['Dosyadan soru hazırlayabilir miyim?','Premium planlarda PDF, Word ve görsellerden içerikle uyumlu sorular oluşturabilirsin.'],
]

export default function LandingPage() {
  const router = useRouter()
  const [checking,setChecking] = useState(true)
  const [openFaq,setOpenFaq] = useState<number|null>(0)
  useEffect(()=>{(createClient() as any).auth.getUser().then(({data:{user}}:any)=>user?router.replace('/quiz'):setChecking(false))},[router])
  if(checking) return <main className="warm-loader"><div className="spinner" /></main>
  return <main className="landing-page">
    <header className="landing-nav"><div className="landing-container nav-inner">
      <Link href="/" className="landing-brand"><img src="/pratium-logo-new.svg" alt="Pratium" /></Link>
      <nav className="landing-links"><a href="#nasil-calisir">Nasıl çalışır?</a><Link href="/for-teachers">Öğretmenler için</Link><Link href="/pricing">Planlar</Link></nav>
      <div className="landing-actions"><Link href="/login" className="warm-link">Giriş yap</Link><Link href="/register" className="warm-button warm-button-small">Ücretsiz başla</Link></div>
    </div></header>
    <section className="landing-hero"><div className="landing-container hero-grid">
      <div className="hero-copy"><div className="warm-badge">✦ Sana göre şekillenen öğrenme</div><h1>Ezberleme.<br/><em>Gerçekten öğren.</em></h1><p>Pratium güçlü ve gelişime açık konularını anlayıp sana özel bir çalışma yolu çıkarır. Daha az karmaşa, daha çok ilerleme hissi.</p><div className="hero-actions"><Link href="/register" className="warm-button">Hemen ücretsiz dene <span>→</span></Link><a href="#nasil-calisir" className="warm-button warm-button-quiet">Nasıl çalıştığını gör</a></div><div className="hero-proof"><div className="avatar-stack"><span>DE</span><span>AS</span><span>MK</span></div><p><strong>Her seviyeye uygun</strong><br/>MEB müfredatı ve 8 farklı soru tipi</p></div></div>
      <div className="hero-demo"><div className="demo-top"><span className="demo-subject">Matematik</span><span>3 / 8 soru</span></div><div className="demo-progress"><span/></div><div className="prati-note"><img src="/mascot-prati-face.svg" alt=""/><span>Harika gidiyorsun! Bu soruyu birlikte düşünelim.</span></div><h2>Bir üçgenin iç açıları toplamı kaç derecedir?</h2><div className="demo-options"><button>A <span>90°</span></button><button className="selected">B <span>180°</span><b>✓</b></button><button>C <span>270°</span></button></div><div className="demo-footer"><span>🔥 7 günlük seri</span><span>Doğru cevap!</span></div></div>
    </div></section>
    <section className="audience-section"><div className="landing-container"><div className="section-heading"><span>Kimin için?</span><h2>Herkes için daha anlaşılır bir öğrenme deneyimi</h2></div><div className="audience-grid">{audiences.map(([icon,title,text,href,color])=><Link href={href} key={title} className={`audience-card ${color}`}><div className="audience-icon">{icon}</div><h3>{title}</h3><p>{text}</p><b>Keşfet <span>→</span></b></Link>)}</div></div></section>
    <section className="how-section" id="nasil-calisir"><div className="landing-container how-grid"><div className="how-intro"><div className="warm-badge">Basit ve kişisel</div><h2>Başlamak için yalnızca bir konu yeterli.</h2><p>Geri kalanını Pratium senin seviyene ve ilerlemene göre şekillendirir.</p><Link href="/register" className="warm-button">İlk çalışmanı başlat →</Link></div><div className="steps">{steps.map(([n,title,text])=><div className="step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>
    <section className="insight-section"><div className="landing-container insight-grid"><div className="insight-panel"><div className="insight-head"><div><span>Haftalık ilerleme</span><strong>%18</strong><small>geçen haftaya göre artış</small></div><div className="insight-ring">4<small>/5</small></div></div><div className="chart-bars">{[42,64,51,78,68,92,74].map((h,i)=><span key={i} style={{height:`${h}%`}} />)}</div><div className="chart-days">{['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(d=><span key={d}>{d}</span>)}</div></div><div className="insight-copy"><div className="warm-badge">Puanın ötesinde</div><h2>Ne yaptığını değil, nasıl geliştiğini gör.</h2><p>Pratium yanlışlarını konu bazında analiz eder, tekrar zamanını planlar ve bir sonraki en doğru adımı sade bir dille gösterir.</p><ul><li>✓ Kişisel gelişim özeti</li><li>✓ Akıllı tekrar planı</li><li>✓ Öğrenci, öğretmen ve veli görünümü</li></ul></div></div></section>
    <section className="faq-section"><div className="landing-container faq-grid"><div><span className="warm-badge">Merak edilenler</span><h2>Aklında soru kalmasın.</h2><p>Başka bir konuda yardıma ihtiyacın varsa bize her zaman ulaşabilirsin.</p></div><div className="faq-list">{faqs.map(([q,a],i)=><div className="faq-item" key={q}><button onClick={()=>setOpenFaq(openFaq===i?null:i)} aria-expanded={openFaq===i}><span>{q}</span><b>{openFaq===i?'−':'+'}</b></button>{openFaq===i&&<p>{a}</p>}</div>)}</div></div></section>
    <section className="final-cta"><div className="landing-container"><img src="/mascot-prati.svg" alt="Prati maskotu"/><div><span>Bugün küçük bir adım at.</span><h2>Öğrenme yolculuğunu sana özel hale getir.</h2></div><Link href="/register" className="warm-button warm-button-light">Ücretsiz başla →</Link></div></section>
    <SiteFooter />
  </main>
}
