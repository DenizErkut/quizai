import { expect, test } from '@playwright/test'
import { svgToPngDataUrl } from '../lib/mistral-quality'

test('SVG görselini Mistral Vision için PNG data URL biçimine dönüştürür', () => {
  const dataUrl = svgToPngDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="white"/><text x="10" y="30">29 m</text></svg>')
  expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
})
