import type { TeacherTrainingModuleId } from './teacher-ai-training-course'

const ANSWERS: Record<TeacherTrainingModuleId, Record<string, { choice: 'A' | 'B' | 'C' | 'D'; explanation: string }>> = {
  verify: {
    v1: { choice: 'B', explanation: 'Akıcı anlatım doğruluğu kanıtlamaz; bağımsız kontrol gerekir.' },
    v2: { choice: 'C', explanation: 'İşlemi yeniden çözmek, sonucu doğrudan doğrular.' },
    v3: { choice: 'B', explanation: 'Kanıt sormak, iddiayı sınama alışkanlığı kazandırır.' },
    v4: { choice: 'C', explanation: 'Hem kazanım eşleşmesi hem cevap anahtarı doğrulanmalıdır.' },
  },
  curriculum: {
    c1: { choice: 'B', explanation: 'Eşleşme, sorunun gerçekten hedef beceriyi ölçmesiyle kurulur.' },
    c2: { choice: 'B', explanation: 'Kazanım kodunu güncel resmî MEB kaynağıyla doğrulayın.' },
    c3: { choice: 'B', explanation: 'Soru, hedef sınıf ve kazanımın kapsamı içinde kalmalıdır.' },
    c4: { choice: 'A', explanation: 'Güncel resmî MEB müfredatı birincil başvuru kaynağıdır.' },
  },
  pedagogy: {
    p1: { choice: 'B', explanation: 'Küçük ipucu ve yeniden deneme öğrencinin düşünmesini korur.' },
    p2: { choice: 'B', explanation: 'Açık dil ve kısa açıklamalar bilişsel yükü azaltır.' },
    p3: { choice: 'C', explanation: 'Sürece odaklanan geri bildirim öğrenmeyi ve yeniden denemeyi destekler.' },
    p4: { choice: 'B', explanation: 'AI, öğrencinin kendi gerekçesini geliştirmesine destek olmalıdır.' },
  },
  safety: {
    s1: { choice: 'B', explanation: 'Anonim ve asgari bağlam veri riskini azaltır.' },
    s2: { choice: 'C', explanation: 'Hassas risklerde kurum prosedürü ve insan desteği esastır.' },
    s3: { choice: 'B', explanation: 'AI görselleri de doğruluk, yaş ve güvenlik incelemesinden geçmelidir.' },
    s4: { choice: 'A', explanation: 'Tanımlayıcı veriyi çıkarmak ve paylaşımı azaltmak güvenli yaklaşımdır.' },
  },
}

export function scoreTeacherTrainingModule(moduleId: string, answers: unknown) {
  if (!Object.hasOwn(ANSWERS, moduleId)) return null
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  const key = moduleId as TeacherTrainingModuleId
  const values = answers as Record<string, unknown>
  const questionIds = Object.keys(ANSWERS[key]).sort()
  if (Object.keys(values).sort().join(',') !== questionIds.join(',')
    || Object.values(values).some(value => !['A', 'B', 'C', 'D'].includes(value as string))) return null
  const results = questionIds.map(id => ({ id, selected: values[id], correct: ANSWERS[key][id].choice,
    explanation: ANSWERS[key][id].explanation, isCorrect: values[id] === ANSWERS[key][id].choice }))
  const score = results.filter(result => result.isCorrect).length
  return { score, passed: score >= 3, results }
}
