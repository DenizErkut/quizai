// Telefon fotoğrafları 3-8 MB olur; API sınırı ~4.5 MB. 1800 px JPEG el yazısını okunur tutarken ~300-600 KB'a iner.
export async function compressImage(file: File): Promise<{ mediaType: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return { mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] }
}
