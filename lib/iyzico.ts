import crypto from 'crypto'

const IYZICO_API_KEY = process.env.IYZICO_API_KEY!
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY!

/**
 * iyzico IYZWSv2 HmacSHA256 imza üretimi (resmi algoritma).
 *
 * signatureString = randomKey + uriPath + requestBody
 * signature       = HMAC-SHA256(signatureString, secretKey) -> HEX
 * authorization   = "IYZWSv2 " + base64("apiKey:X&randomKey:Y&signature:Z")
 *
 * ÖNEMLİ: signature HEX olmalı (base64 değil), ve mesaj apiKey/secretKey
 * içermemeli — sadece randomKey + uriPath + body. Önceki implementasyon
 * bunların hepsini yanlış yapıyordu ("Geçersiz imza" hatasının kaynağı buydu).
 *
 * uriPath, base URL'den sonraki path'tir, örn:
 * "/payment/iyzipos/checkoutform/initialize/auth/ecom"
 */
export function generateIyzicoAuthHeader(uriPath: string, body: string): string {
  const randomKey = `${Date.now()}${Math.random().toString(36).slice(2)}`
  const signatureString = randomKey + uriPath + body
  const signature = crypto
    .createHmac('sha256', IYZICO_SECRET_KEY)
    .update(signatureString, 'utf8')
    .digest('hex')

  const authorizationParams = [
    `apiKey:${IYZICO_API_KEY}`,
    `randomKey:${randomKey}`,
    `signature:${signature}`,
  ]

  return 'IYZWSv2 ' + Buffer.from(authorizationParams.join('&'), 'utf8').toString('base64')
}
