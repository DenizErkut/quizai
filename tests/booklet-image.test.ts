import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookletImageSvg } from '../lib/booklet-image'
import { requiresBookletVisual } from '../lib/booklet-visual-gate'
import { Resvg } from '@resvg/resvg-js'

test('original PNG stays embedded and can render in the student SVG image path', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64')
  const svg = bookletImageSvg(png, 1, 1)
  assert.ok(svg.includes(png.toString('base64')))
  const rendered = new Resvg(svg).render()
  assert.equal(rendered.width, 1)
  assert.ok(rendered.asPng().length > 0)
})
test('active content and oversized assets cannot be stored as booklet images', () => {
  assert.throws(() => bookletImageSvg(Buffer.from('<svg onload="alert(1)"/>'), 1, 1))
  assert.throws(() => bookletImageSvg(new Uint8Array(2_000_001), 1, 1))
  assert.throws(() => bookletImageSvg(new Uint8Array(4), 5000, 5000))
})
test('missing figures go to human attachment, ordinary text does not', () => {
  assert.equal(requiresBookletVisual({ q: 'Aşağıdaki şekilde gösterilen üçgenin alanı kaçtır?' }), true)
  assert.equal(requiresBookletVisual({ q: 'Which diagram is correct?', requires_visual: true }), true)
  assert.equal(requiresBookletVisual({ q: '12 ve 18 sayılarının EBOB değeri kaçtır?' }), false)
})
