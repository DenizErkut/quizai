import type { MutableRefObject } from 'react'

// Sessiz, geçerli en küçük WAV: <audio> öğesinin kilidini açmak için.
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='

/**
 * iPhone/iPad Safari, sesi yalnızca kullanıcı dokunuşu sırasında "kilidi açılmış" bir <audio> öğesinde çalmaya izin verir;
 * sunucudan ses indirdikten SONRA oluşturulan yeni Audio().play() engellenir ("Koçun sesi hazırlanamadı" hatası).
 * Bu yüzden dokunuş anında (ilk await'ten ÖNCE) öğe oluşturulup sessiz bir ses çalınarak kilidi açılır; indirilen ses sonra aynı öğeye verilir.
 */
export function primeAudio(ref: MutableRefObject<HTMLAudioElement | null>): HTMLAudioElement {
  const audio = ref.current ?? new Audio()
  ref.current = audio
  audio.onended = null; audio.onerror = null
  audio.pause()
  audio.src = SILENT_WAV
  void audio.play().catch(() => undefined)
  return audio
}
