// One definition of "the same question" for learning-gain measurements: the server rejects a pair of
// tests that share a signature, and the teacher UI uses the same function to grey out such tests early.
export function questionSignature(text: unknown): string {
  return typeof text === 'string' ? text.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() : ''
}

export function sharedQuestionCount(a: Array<{ text?: unknown }>, b: Array<{ text?: unknown }>): number {
  const left = new Set(a.map(question => questionSignature(question.text)).filter(Boolean))
  return new Set(b.map(question => questionSignature(question.text)).filter(signature => signature && left.has(signature))).size
}
