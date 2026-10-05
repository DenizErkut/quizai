export function bookletImageSvg(bytes: Uint8Array, width: number, height: number) {
  if (bytes.length > 2_000_000 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 12_000_000) throw new Error('Görsel en fazla 2 MB ve 12 megapiksel olmalı.')
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!png && !jpeg) throw new Error('Yalnız gerçek PNG veya JPEG görselleri kabul edilir.')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="data:image/${png ? 'png' : 'jpeg'};base64,${Buffer.from(bytes).toString('base64')}"/></svg>`
}
