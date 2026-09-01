import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

const sections = [
  ['1. Veri sorumlusu', 'Bu Çerez Politikası, Pratium platformunun veri sorumlusu Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi tarafından hazırlanmıştır. İletişim: info@pratium.com.tr.'],
  ['2. Çerez nedir?', 'Çerezler, internet sitesini kullandığınızda tarayıcınız aracılığıyla cihazınızda saklanan küçük metin dosyalarıdır. Benzer amaçlarla yerel depolama teknolojileri de kullanılabilir.'],
  ['3. Çerezleri hangi amaçlarla kullanıyoruz?', 'Zorunlu teknolojiler; oturum açma, hesap güvenliği, yük dengeleme, çerez tercihinizin saklanması ve platformun talep ettiğiniz işlevleri sunması amacıyla kullanılır. Analiz ve kişiselleştirme teknolojileri ise yalnızca açık tercihiniz bulunması halinde kullanılabilir.'],
  ['4. Çerez kategorileri', 'Zorunlu çerezler platformun çalışması için gereklidir ve kapatılamaz. Analiz çerezleri, kullanım eğilimlerini toplu olarak ölçmek için; kişiselleştirme çerezleri ise dil, görünüm ve deneyim tercihlerini hatırlamak için kullanılır. Reklam veya davranışsal hedefleme çerezleri şu anda kullanılmamaktadır.'],
  ['5. Hukuki sebepler', 'Zorunlu çerezler, KVKK’nın 5’inci maddesinde düzenlenen sözleşmenin kurulması veya ifası ile veri sorumlusunun hukuki yükümlülüğü ve meşru menfaati kapsamında, ölçülülük ilkesi gözetilerek kullanılabilir. Zorunlu olmayan analiz ve kişiselleştirme çerezleri açık rızanıza dayanır.'],
  ['6. Tercihleriniz ve açık rızanın geri alınması', '“Tümünü reddet” seçeneği platforma erişiminizi engellemez. Tercihinizi sayfadaki “Çerez tercihleri” düğmesinden istediğiniz zaman değiştirebilir veya açık rızanızı ileriye etkili olarak geri alabilirsiniz. Tarayıcı ayarlarınızdan mevcut çerezleri ayrıca silebilirsiniz.'],
  ['7. Saklama süresi', 'Çerezler amaçları için gerekli olan süreyle sınırlı tutulur. Oturum çerezleri oturum sona erdiğinde silinebilir; tercih kaydı ise yeniden seçim yapmanız veya politika sürümü değişene kadar cihazınızda tutulabilir. Yasal ya da teknik ihtiyaç bulunmadıkça gereğinden uzun saklama yapılmaz.'],
  ['8. Aktarım ve hizmet sağlayıcılar', 'Platform altyapısı ve kimlik doğrulama hizmetleri kapsamında teknik hizmet sağlayıcılardan yararlanılabilir. Aktarım gereken hallerde KVKK’nın 8’inci ve 9’uncu maddeleri ile uygun güvence mekanizmaları gözetilir. Güncel sağlayıcı bilgileri Gizlilik Politikası ve KVKK Aydınlatma Metni ile birlikte değerlendirilmelidir.'],
  ['9. Haklarınız ve iletişim', 'KVKK’nın 11’inci maddesindeki haklarınıza ilişkin taleplerinizi info@pratium.com.tr adresine iletebilirsiniz. Ayrıntılı veri işleme açıklamaları için Gizlilik Politikası ve KVKK Aydınlatma Metni’ni inceleyebilirsiniz.'],
]

export default function CookiePolicyPage() {
  return <main className="legal-page"><div className="legal-shell"><Link href="/" className="legal-logo"><img src="/pratium-logo-new.svg" alt="Pratium" /></Link><span className="warm-badge">Yasal bilgilendirme</span><h1>Çerez Politikası</h1><p className="legal-date">Son güncelleme: 1 Eylül 2026</p><div className="legal-intro">Bu metin, kullandığımız çerez ve benzeri teknolojileri; bunların amaçlarını ve tercihlerinizi nasıl yönetebileceğinizi açıklar.</div>{sections.map(([title,text])=><section className="card" key={title}><h2>{title}</h2><p>{text}</p></section>)}<div className="legal-links"><Link href="/privacy">Gizlilik Politikası ve KVKK Aydınlatma Metni</Link><Link href="/kvkk/aydinlatma">KVKK Aydınlatma Metni</Link></div></div><SiteFooter /></main>
}
