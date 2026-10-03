export const POLICY = 'historical-objective-backfill-v1'
export const MIN_SCORE = 80
export function reviewQuestionShape(question) {
  if (question.type === 'true_false' && (question.opts == null || (Array.isArray(question.opts) && question.opts.length === 0))) return { ...question,opts:['Doğru','Yanlış'],ans:typeof question.ans==='boolean'?(question.ans?0:1):question.ans }
  return question
}
export function auditCatalogPayload(candidates) {
  const contexts = [], indexes = new Map()
  const catalog = candidates.map(candidate => {
    const context = { subject:candidate.subject || '', topic:candidate.topic || '', unit:candidate.unit || '' }
    const key = JSON.stringify(context)
    if (!indexes.has(key)) { indexes.set(key,contexts.length); contexts.push(context) }
    return [candidate.objective_code,candidate.title,indexes.get(key)]
  })
  return { catalogFields:['code','title','contextIndex'],contexts,catalog }
}
const REQUIRED = ['answerCorrect', 'explanationConsistent', 'ageAppropriate', 'unambiguous', 'directObjectiveMatch']

export function parseAudits(raw, size, provider, model) {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed.results) || parsed.results.length !== size) throw new Error(`${provider}: incomplete audit`)
  const byIndex = new Map()
  for (const result of parsed.results) {
    // Missing reuse-only flags cannot turn an explicit negative audit into approval.
    if (result.objectiveCode === null || REQUIRED.some(key => result[key] === false) || (typeof result.score === 'number' && result.score < MIN_SCORE)) {
      for (const key of ['difficultyMatches','standalone']) if (result[key] === undefined) result[key] = false
    }
    if (!Number.isInteger(result.index) || result.index < 0 || result.index >= size || byIndex.has(result.index)
      || typeof result.score !== 'number' || result.score < 0 || result.score > 100
      || typeof result.reason !== 'string' || result.reason.trim().length < 8
      || !(result.objectiveCode === null || typeof result.objectiveCode === 'string')
      || REQUIRED.some(key => typeof result[key] !== 'boolean') || typeof result.difficultyMatches !== 'boolean' || typeof result.standalone !== 'boolean') {
      throw new Error(`${provider}: malformed audit (${JSON.stringify({ index: result.index, types: Object.fromEntries(['score','reason','objectiveCode',...REQUIRED,'difficultyMatches','standalone'].map(key=>[key,typeof result[key]])) })})`)
    }
    if (norm(result.reason).includes('dogrudan olmasa')) result.directObjectiveMatch = false
    byIndex.set(result.index, { ...result, provider, model, score: Math.round(result.score), reason: result.reason.slice(0, 1200),
      approved: REQUIRED.every(key => result[key] === true) && result.score >= MIN_SCORE && Boolean(result.objectiveCode) })
  }
  return Array.from({ length: size }, (_, index) => byIndex.get(index))
}

export function decideAudits(audits, candidates) {
  if (audits.length !== 2 || new Set(audits.map(audit => audit.provider)).size !== 2) throw new Error('Two independent audits required')
  const objective = candidates.find(candidate => candidate.objective_code === audits[0].objectiveCode)
  const approved = Boolean(objective) && audits.every(audit => audit.approved === true && audit.objectiveCode === objective.objective_code)
  const score = Math.min(...audits.map(audit => audit.score))
  const reason = approved
    ? `${audits[0].reason} İkinci bağımsız denetçi aynı kazanımı ve cevap doğruluğunu doğruladı.`
    : audits[0].objectiveCode !== audits[1].objectiveCode
      ? `Kazanım seçiminde bağımsız denetçiler uzlaşmadı. ${audits.map(audit => `${audit.provider}: ${audit.reason}`).join(' | ')}`
      : audits.filter(audit => !audit.approved).map(audit => `${audit.provider}: ${audit.reason}`).join(' | ') || 'Aktif katalogda bu sınıf ve ders için doğrudan ölçülen kazanım doğrulanamadı.'
  return { decision: approved ? 'approved' : 'rejected', objective: approved ? objective : null, score, reason, audits }
}

export function norm(value) {
  return String(value || '').normalize('NFKD').toLocaleLowerCase('tr-TR').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function deterministicBlock(question) {
  question = reviewQuestionShape(question)
  if (typeof question.q !== 'string' || question.q.trim().length < 5) return 'Soru metni eksik.'
  const type = question.type || 'multiple_choice'
  if (['multiple_choice', 'true_false'].includes(type)) {
    if (!Array.isArray(question.opts) || question.opts.length < 2 || question.opts.some(option => typeof option !== 'string' || !option.trim())) return 'Seçenekler eksik veya geçersiz.'
    if (!Number.isInteger(question.ans) || question.ans < 0 || question.ans >= question.opts.length) return 'Cevap anahtarı geçersiz.'
    if (new Set(question.opts.map(value => value.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim())).size !== question.opts.length) return 'Seçenekler yineleniyor.'
  } else if (!['fill_blank', 'short_answer', 'matching', 'multi_true_false', 'ordering', 'table_fill'].includes(type)) return 'Soru tipi tanınmıyor.'
  if (question.svg || question.chartData || question.hasVisual) return 'Görsel soru ayrıca görsel öğretmen kontrolü gerektiriyor; toplu metin denetimiyle onaylanmadı.'
  if (!String(question.exp || question.explanation || '').trim()) return 'Doğru cevabı doğrulayan açıklama eksik.'
  return null
}
