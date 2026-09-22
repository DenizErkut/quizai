// lib/paytr.ts
//
// 22 Eylül 2026 — Deniz'in kararıyla: Iyzico'dan PayTR'a TAM GEÇİŞ.
// PayTR iFrame API kullanılıyor (dev.paytr.com/iframe-api) — Iyzico'nun
// checkoutForm akışıyla aynı UX: kart bilgileri PayTR'ın kendi (PCI-DSS
// kapsamlı) iframe'inde toplanıyor, ham kart verisi Pratium sunucusuna HİÇ
// uğramıyor.
//
// İki ayrı hash hesaplaması var, KARIŞTIRILMAMALI:
//  1) get-token isteği için "paytr_token" (bu dosyada generateGetTokenHash)
//  2) bildirim (webhook) doğrulaması için "hash" (bu dosyada verifyCallbackHash)
// Her ikisi de HMAC-SHA256 + Base64, ama alan sırası ve içerdikleri FARKLI —
// dev.paytr.com/iframe-api/iframe-api-1-adim ve .../iframe-api-2-adim
// sayfalarından birebir alındı.
//
// merchant_key ve merchant_salt GERÇEK API SIRLARI — asla client'a, log'a
// veya git'e girmemeli. Sadece Vercel env değişkenleri olarak saklanıyor
// (PAYTR_MERCHANT_ID/PAYTR_MERCHANT_KEY/PAYTR_MERCHANT_SALT), tıpkı eski
// IYZICO_API_KEY/IYZICO_SECRET_KEY deseninde olduğu gibi.

import crypto from 'crypto'

export const PAYTR_MERCHANT_ID = process.env.PAYTR_MERCHANT_ID!
const PAYTR_MERCHANT_KEY = process.env.PAYTR_MERCHANT_KEY!
const PAYTR_MERCHANT_SALT = process.env.PAYTR_MERCHANT_SALT!

export const PAYTR_GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token'
// iframe src'i: `${PAYTR_IFRAME_BASE_URL}/${token}`
export const PAYTR_IFRAME_BASE_URL = 'https://www.paytr.com/odeme/guvenli'

function hmacBase64(input: string): string {
  return crypto.createHmac('sha256', PAYTR_MERCHANT_KEY).update(input, 'utf8').digest('base64')
}

// get-token adımı (Adım 1) için paytr_token.
// Alan sırası (dev.paytr.com/iframe-api/iframe-api-1-adim ile BİREBİR aynı):
// merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket
// + no_installment + max_installment + currency + test_mode + merchant_salt
export function generateGetTokenHash(params: {
  userIp: string
  merchantOid: string
  email: string
  paymentAmountKurus: number   // kuruş cinsinden TAM SAYI (999 = 9.99 TL)
  userBasketBase64: string
  noInstallment: 0 | 1
  maxInstallment: number
  currency: string
  testMode: 0 | 1
}): string {
  const hashStr =
    PAYTR_MERCHANT_ID +
    params.userIp +
    params.merchantOid +
    params.email +
    params.paymentAmountKurus +
    params.userBasketBase64 +
    params.noInstallment +
    params.maxInstallment +
    params.currency +
    params.testMode +
    PAYTR_MERCHANT_SALT
  return hmacBase64(hashStr)
}

// Bildirim (Adım 2 / webhook) doğrulaması.
// Alan sırası: merchant_oid + merchant_salt + status + total_amount
// PayTR'dan gelen `hash` alanıyla BİREBİR eşleşmeli — eşleşmezse istek
// sahte sayılıp reddedilmeli (bkz. app/api/paytr/callback/route.ts).
export function verifyCallbackHash(params: {
  merchantOid: string
  status: string
  totalAmount: string   // PayTR'dan geldiği gibi, string olarak (ör. "3456")
  hash: string
}): boolean {
  const hashStr = params.merchantOid + PAYTR_MERCHANT_SALT + params.status + params.totalAmount
  const expected = hmacBase64(hashStr)
  // timingSafeEqual: hash karşılaştırmasında zamanlama saldırısına karşı —
  // basit === de işlevsel olarak yeterli olurdu ama bu ucuz bir sertleştirme.
  const expectedBuf = Buffer.from(expected)
  const receivedBuf = Buffer.from(params.hash)
  if (expectedBuf.length !== receivedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

// PayTR "user_basket" formatı: base64(JSON.stringify([[isim, "fiyat.ss", adet], ...]))
// Fiyat STRING ve NOKTALI olmalı (ör. "499.00") — payment_amount'un aksine
// (o kuruş/tam sayı) burada ondalık string bekleniyor. dev.paytr.com'daki
// örnekler bu formatı kullanıyor.
export function buildUserBasket(items: Array<{ name: string; price: number; quantity: number }>): string {
  const basket = items.map(item => [item.name, item.price.toFixed(2), item.quantity])
  return Buffer.from(JSON.stringify(basket), 'utf8').toString('base64')
}

// merchant_oid: max 64 alfanumerik karakter, benzersiz olmalı (dev.paytr.com/iframe-api/iframe-api-1-adim).
// Iyzico'daki conversationId'nin aksine ("|" ile ayrılmış userId|plan|timestamp") burada
// user/plan bilgisini OID'nin İÇİNE kodlamıyoruz — bunun yerine subscriptions tablosuna
// provider:'paytr' + stripe_subscription_id:oid olarak bir satır yazıyoruz ve bildirim
// (callback) geldiğinde bu satırı oid'den buluyoruz. Böylece OID sade ve garanti alfanumerik kalıyor.
export function generateMerchantOid(): string {
  const rand = crypto.randomBytes(12).toString('hex').toUpperCase() // 24 hex karakter
  const ts = Date.now().toString(36).toUpperCase() // ~8 karakter
  return `PT${ts}${rand}`
}
