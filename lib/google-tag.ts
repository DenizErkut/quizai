// Google etiketi (Google Tag Manager → Google Analytics). Çerez politikası gereği yalnızca kullanıcı "analiz çerezlerine"
// açık rıza verdiğinde yüklenir; rıza yokken hiçbir Google betiği indirilmez. Rıza geri alınırsa Consent Mode ile
// analytics_storage kapatılır.
export const GOOGLE_TAG_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-57G6ST83'
export const GOOGLE_TAG_SRC = 'https://www.googletagmanager.com/gtm.js'

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }

/** dataLayer + gtag() hazırlar ve Consent Mode varsayılanını "reddedildi" yapar (idempotent). */
export function prepareGoogleTag(win: GtagWindow = window as GtagWindow): void {
  win.dataLayer = win.dataLayer || []
  if (!win.gtag) {
    // Google'ın gtag komutları dataLayer'a dizi değil `arguments` nesnesi olarak itilmelidir; rest parametre bunu bozar.
    // eslint-disable-next-line prefer-rest-params
    win.gtag = function gtag() { win.dataLayer!.push(arguments) }
    win.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 })
  }
}

/** Rıza verilince analytics_storage açılır ve (ilk kez) Google etiketi yüklenir. */
export function enableGoogleTag(doc: Document = document, win: GtagWindow = window as GtagWindow): void {
  prepareGoogleTag(win)
  win.gtag!('consent', 'update', { analytics_storage: 'granted' })
  if (doc.getElementById('pratium-google-tag')) return
  win.dataLayer!.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const script = doc.createElement('script')
  script.id = 'pratium-google-tag'
  script.async = true
  script.src = `${GOOGLE_TAG_SRC}?id=${encodeURIComponent(GOOGLE_TAG_ID)}`
  doc.head.appendChild(script)
}

/** Rıza geri alınınca ölçüm depolaması kapatılır (yüklenmiş betik sayfa yenilenene kadar kalır ama veri toplamaz). */
export function disableGoogleTag(win: GtagWindow = window as GtagWindow): void {
  if (win.gtag) win.gtag('consent', 'update', { analytics_storage: 'denied' })
}
