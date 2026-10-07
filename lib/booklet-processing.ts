// Keep each extraction small enough for one serverless request. Inline
// `Cevap: B` belongs to its question, not to a global answer-key section.
export function bookletBatches(raw: string): string[] {
  if (raw.length > 500000) throw new Error('Kitapçık metni çok büyük. İçeriği ayrı kitapçıklara bölün; metin sessizce kesilmez.')
  const text = raw
  const answerStart = text.search(/\n\s*(?:CEVAP ANAHTARI|YANIT ANAHTARI|CEVAPLAR|YANITLAR)\s*(?:\r?\n|$)/iu)
  const questions = answerStart >= 0 ? text.slice(0, answerStart) : text
  const answers = answerStart >= 0 ? text.slice(answerStart) : ''
  const starts = [...questions.matchAll(/(?:^|\n)\s*(?:Soru\s+\d{1,3}\s*(?:\||[.)])|\d{1,3}[.)]\s+(?![Ss][ıiIİ]n[ıiIİ]f))/giu)].map(match => match.index!)
  const blocks = starts.length
    ? starts.map((start, index) => questions.slice(start, starts[index + 1] ?? questions.length))
    : questions.split(/\n{2,}/).filter(Boolean)
  if (starts.length && starts[0] > 0) blocks[0] = questions.slice(0, starts[0]) + blocks[0]
  const batches: string[] = []
  let current = ''
  let count = 0
  for (const block of blocks) {
    if (current && (count >= 8 || current.length + block.length > 14000)) {
      batches.push(`${current}\n${answers}`); current = ''; count = 0
    }
    // A huge unstructured OCR block cannot safely be interpreted as a bounded
    // question batch. Require document correction instead of silently truncating.
    if (block.length > 24000) throw new Error('Kitapçık metni soru gruplarına ayrılamadı. Metni Düzelt alanından kontrol edin.')
    current += block + '\n'; count++
  }
  if (current.trim()) batches.push(`${current}\n${answers}`)
  return batches
}

export type BookletResponse = { resource_id?: string; chunks?: number; promoted?: number; processingPending?: boolean; done?: boolean; progress?: string; error?: string }

export async function readBookletResponse(response: Response): Promise<BookletResponse> {
  const text = await response.text()
  let data: BookletResponse
  try { data = JSON.parse(text) } catch {
    throw new Error(response.status === 504
      ? 'Sunucu süre sınırına ulaştı. Kaydedilen kitapçığın “İşlemeyi sürdür” düğmesiyle devam edin; tekrar PDF yüklemeniz gerekmez.'
      : `Sunucu geçerli yanıt vermedi (${response.status}). Kitapçık listesini kontrol edip işlemi sürdürün.`)
  }
  if (!response.ok) throw new Error(data.error || `İşlem tamamlanamadı (${response.status}).`)
  return data
}

export async function finishBookletProcessing(id: string, progress: (message: string) => void) {
  for (let step = 0; step < 1000; step++) {
    const response = await fetch('/api/admin/exam-upload', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'process-next', id }),
    })
    const result = await readBookletResponse(response)
    progress(`Kitapçık kaydedildi. ${result.progress || 'Sorular kontrol ediliyor…'} Bu sayfayı açık tutun; kesilirse listeden sürdürebilirsiniz.`)
    if (result.done) return result
  }
  throw new Error('İşlem kesildi. Kitapçık listesinden işlemeyi sürdürebilirsiniz.')
}
