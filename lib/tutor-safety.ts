export type TutorSafetyCode = 'personal_data' | 'dangerous_instruction' | 'self_harm' | 'prompt_injection'
export type TutorSafetyResult = { allowed:true } | { allowed:false; code:TutorSafetyCode; reply:string }

const normalized = (value:string) => value.toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim()

export function inspectTutorInput(value:string):TutorSafetyResult {
  const text=normalized(value)
  if (/(sistem (prompt|mesaj)|gizli talimat|önceki talimatları (unut|yok say)|kuralları yok say)/i.test(text)) return {allowed:false,code:'prompt_injection',reply:'Gizli sistem talimatlarını paylaşamam veya güvenlik kurallarını devre dışı bırakamam. Dersinle ilgili soruna güvenli biçimde yardımcı olabilirim.'}
  if (/(şifre(n|ni)?|tc kimlik|kredi kartı|kart numarası|ev adresi|telefon numarası).{0,30}(yaz|söyle|gönder|paylaş)|(yaz|söyle|gönder|paylaş).{0,30}(şifre|tc kimlik|kredi kartı|kart numarası|ev adresi|telefon numarası)/i.test(text)) return {allowed:false,code:'personal_data',reply:'Şifre, kimlik numarası, kart bilgisi, adres veya telefon gibi kişisel bilgileri istemem ve paylaşmanı önermem. Bu bilgileri yazmadan sorunu anlatırsan yardımcı olabilirim.'}
  if (/(intihar|kendimi öldür|kendime zarar|yaşamak istemiyorum)/i.test(text)) return {allowed:false,code:'self_harm',reply:'Bunu tek başına taşımak zorunda değilsin. Şu anda güvende değilsen hemen 112’yi ara; güvendiğin bir yetişkine, ailene veya okulundaki rehber öğretmene şimdi haber ver. Ben ders desteği sunabilirim ama bu konuda gerçek bir yetişkinin yanında olması çok önemli.'}
  if (/(bomba|patlayıcı|silah).{0,35}(yap|üret|hazırla)|birine zarar.{0,25}(nasıl|yöntem)/i.test(text)) return {allowed:false,code:'dangerous_instruction',reply:'Birine zarar verebilecek araç veya yöntemlerle ilgili talimat veremem. Konunun güvenli bilimsel yönünü ya da ders kapsamındaki temel kavramları açıklayabilirim.'}
  return {allowed:true}
}

export function inspectTutorOutput(value:string):TutorSafetyResult {
  const text=normalized(value)
  if (/(şifreni|tc kimlik numaranı|kart numaranı|ev adresini|telefon numaranı).{0,25}(yaz|gönder|paylaş)/i.test(text)) return {allowed:false,code:'personal_data',reply:'Bu yanıt güvenlik nedeniyle gösterilmedi. Pratium Asistan senden şifre, kimlik, kart, adres veya telefon bilgisi istemez.'}
  return {allowed:true}
}
