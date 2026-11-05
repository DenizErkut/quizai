// Tarayıcıda fotoğraf/taramadaki QR kodu okur (jsQR). Önce tüm görsel, bulunamazsa sağ üst köşe daha yüksek çözünürlükte denenir.
import jsQR from 'jsqr'

function scan(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, outWidth: number): string | null {
  const scale = outWidth / sw
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return scan(bitmap, 0, 0, bitmap.width, bitmap.height, Math.min(1600, bitmap.width))
      ?? scan(bitmap, bitmap.width * 0.5, 0, bitmap.width * 0.5, bitmap.height * 0.4, Math.min(1400, bitmap.width * 0.5))
      ?? scan(bitmap, 0, 0, bitmap.width, bitmap.height, Math.min(2400, bitmap.width))
  } finally {
    bitmap.close()
  }
}
