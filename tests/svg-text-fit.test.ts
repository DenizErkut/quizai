import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTextWidth, fitSvgText } from '../lib/svg-text-fit'

const wrapSvg = (body: string) => `<svg viewBox="0 0 400 280" xmlns="http://www.w3.org/2000/svg">${body}</svg>`

test('sığan metne dokunmaz', () => {
  const svg = wrapSvg('<text x="200" y="18" font-size="14" text-anchor="middle">Üçgen</text>')
  assert.equal(fitSvgText(svg), svg)
})

test('taşan uzun başlık satırlara bölünür ve görünür alanda kalır', () => {
  const title = 'Bir üçgende köşeden karşı kenarın orta noktasına çizilen doğru parçasının ağırlık merkezine oranı'
  const out = fitSvgText(wrapSvg(`<text x="200" y="18" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle">${title}</text>`))
  const lines = [...out.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(match => match[1])
  assert.ok(lines.length >= 2 && lines.length <= 3)
  const size = Number(out.match(/font-size="([\d.]+)"/)![1])
  for (const line of lines) assert.ok(estimateTextWidth(line.replace('…', ''), size, true) <= 400 - 12, line)
})

test('kenara yakın etiket içeri çekilir', () => {
  const out = fitSvgText(wrapSvg('<text x="380" y="100" font-size="13">Karşı kenarın orta noktası burada</text>'))
  assert.ok(Number(out.match(/ x="([\d.]+)"/)![1]) < 380)
})

test('döndürülmüş metne dokunmaz ve metin kaçışı korunur', () => {
  const rotated = wrapSvg('<text x="10" y="100" transform="rotate(-60 10 100)" font-size="13">çok uzun döndürülmüş etiket metni burada burada burada</text>')
  assert.equal(fitSvgText(rotated), rotated)
  const out = fitSvgText(wrapSvg('<text x="200" y="20" font-size="20" text-anchor="middle">a &lt; b ve a &amp; b koşulları için çok çok uzun bir başlık yazısı burada</text>'))
  assert.match(out, /a &lt; b/)
})
