// Ortak sunucu hatası yanıtı: beklenmeyen hataların ham mesajı (tablo/sütun adı, sağlayıcı ayrıntısı) istemciye gitmez;
// sunucu günlüğüne yazılır, istemciye genel bir mesaj döner. Kullanıcıya gösterilmesi bilinçli mesajlar
// `UserFacingError` ile fırlatılır ve olduğu gibi (kendi durum koduyla) döner.
export class UserFacingError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserFacingError'
    this.status = status
  }
}

export function errorResponse(context: string, error: unknown, fallback = 'Bir hata oluştu, lütfen tekrar dene.', status = 500): Response {
  if (error instanceof UserFacingError) return Response.json({ error: error.message }, { status: error.status })
  console.error(`[${context}]`, error instanceof Error ? error.message : 'bilinmeyen hata')
  return Response.json({ error: fallback }, { status })
}
