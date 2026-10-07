import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { acceptMarkers, expandWithLabels, figureBox, figuresForPages } from '../lib/booklet-figures'

test('markers must continue the numbering; lists inside a question are skipped', () => {
  const known = new Set([16, 17, 18])
  const accepted = acceptMarkers([{ n: 17, top: 100, x: 10 }, { n: 1, top: 160, x: 10 }, { n: 2, top: 180, x: 10 }, { n: 18, top: 300, x: 10 }], known, 16)
  assert.deepEqual(accepted.map(marker => marker.n), [17, 18])
})

test('booklets with gaps in their numbering still work', () => {
  const known = new Set([2, 3, 12, 16, 36])
  const markers = [2, 3, 12, 16, 36].map((n, i) => ({ n, top: i * 100, x: 10 }))
  assert.deepEqual(acceptMarkers(markers, known, 0).map(marker => marker.n), [2, 3, 12, 16, 36])
})

test('figure box ignores hairlines and finds the drawing', () => {
  const width = 100, gray = new Uint8Array(width * 100).fill(255)
  for (let x = 0; x < width; x++) gray[5 * width + x] = 0 // 1px rule: too thin to count as a figure on its own
  for (let y = 30; y < 80; y++) for (let x = 20; x < 90; x++) gray[y * width + x] = 0
  const box = figureBox(gray, width, { left: 0, right: 100, top: 0, bottom: 100 })
  assert.ok(box && box.left === 20 && box.right === 90 && box.top === 30 && box.bottom === 80, JSON.stringify(box))
})

test('labels join a figure, answers, options and sentences never do', () => {
  const box = { left: 100, right: 200, top: 100, bottom: 200 }
  const texts = [
    { str: 'Şub', box: { left: 120, right: 140, top: 203, bottom: 213 } },
    { str: 'Hangi çıkarım veriye uygundur?', box: { left: 100, right: 190, top: 220, bottom: 232 } },
    { str: 'A) ', box: { left: 100, right: 112, top: 238, bottom: 250 } },
    { str: 'M kesin kuzey', box: { left: 114, right: 170, top: 238, bottom: 250 } },
    { str: 'Cevap: B', box: { left: 120, right: 170, top: 256, bottom: 268 } },
  ]
  assert.equal(expandWithLabels(box, texts, 600, 80).bottom, 213)
})

test('crops the chart of question 2 from a real PDF and leaves text-only questions alone', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  let y = 800
  const line = (text: string) => { page.drawText(text, { x: 50, y, size: 11, font }); y -= 18 }
  line('1. Which fruit is red?'); line('A) apple   B) pear'); line('Cevap: A'); y -= 10
  line('2. Study the bar chart. Which month is highest?')
  const top = y
  page.drawRectangle({ x: 80, y: top - 120, width: 30, height: 90, color: rgb(0.2, 0.4, 0.8) })
  page.drawRectangle({ x: 130, y: top - 120, width: 30, height: 50, color: rgb(0.2, 0.4, 0.8) })
  y = top - 150
  line('A) Jan   B) Feb'); line('Cevap: A'); y -= 10
  line('3. A text only question?'); line('A) yes   B) no')
  const result = await figuresForPages(new Uint8Array(await doc.save()), { fromPage: 0, pages: 4, lastQuestion: 0, knownNumbers: new Set([1, 2, 3]) })
  assert.deepEqual(result.figures.map(figure => figure.questionNumber), [2])
  assert.equal(result.lastQuestion, 3)
  assert.ok(result.figures[0].width > 100 && result.figures[0].height > 100)
})

test('a PDF with an embedded raster picture renders without crashing the process', async () => {
  const { createCanvas } = await import('@napi-rs/canvas')
  const canvas = createCanvas(200, 120)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#2255aa'; ctx.fillRect(0, 0, 200, 120)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(40, 40, 120, 40)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText('1. Which picture is blue?', { x: 50, y: 800, size: 11, font })
  const image = await doc.embedPng(canvas.toBuffer('image/png'))
  page.drawImage(image, { x: 80, y: 600, width: 200, height: 120 })
  page.drawText('A) this one   B) none', { x: 50, y: 570, size: 11, font })
  const result = await figuresForPages(new Uint8Array(await doc.save()), { fromPage: 0, pages: 1, lastQuestion: 0, knownNumbers: new Set([1]) })
  assert.deepEqual(result.figures.map(figure => figure.questionNumber), [1])
})
