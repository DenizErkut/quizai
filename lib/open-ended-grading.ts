// Shared rubric grading for open-ended answers (online answers and imported paper answers use the
// SAME prompt, so a paper answer is graded exactly like a typed one).
import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'

const anthropic = new Anthropic()

// Guvenlik agi: AI modeli nadiren Turkce metnin arasina yabanci alfabe
// (Korece/Cince/Japonca vb.) karakterleri sikistirabiliyor. Bu unicode
// araliklarindaki karakterleri temizler - Turkce/Latin/matematik
// sembollerini etkilemez.
export function stripForeignScripts(text: string): string {
  if (!text) return text
  return text.replace(/[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g, '').replace(/\s{2,}/g, ' ').trim()
}

// Bir "ders" alanı yabancı dil dersi mi? (İngilizce, Almanca, vb.)
// generate-open-ended/route.ts'teki AYNI mantık — bu derslerde öğrencinin
// cevabının hedef dilde olması BEKLENEN/DOĞRU davranıştır, "yanlış dil"
// diye reddedilmemeli. (Bkz. o dosyadaki uzun açıklama.)
const FOREIGN_LANGUAGE_SUBJECTS = new Set([
  'ingilizce', 'almanca', 'fransızca', 'fransizca', 'ispanyolca',
  'arapça', 'arapca', 'rusça', 'rusca', 'italyanca', 'çince', 'cince',
  'japonca', 'korece',
])
function isForeignLanguageSubject(subject: string): boolean {
  // .toLowerCase() (locale'siz) KULLANMA: JS'de 'İ'.toLowerCase() -> 'i̇'
  // (nokta ayrı bir combining karakter olarak kalır) üretir, düz 'i' ile
  // ASLA eşleşmez — "İngilizce" gibi büyük noktalı İ ile başlayan tüm ders
  // adları bu yüzden hiç tanınmıyordu (bkz. app/api/generate-quiz/route.ts
  // içindeki aynı düzeltme — kod tabanında zaten bilinen bir sorun).
  return FOREIGN_LANGUAGE_SUBJECTS.has((subject || '').trim().toLocaleLowerCase('tr'))
}

export type GradableSession = {
  grade?: string | null; subject?: string | null; scenario: string; question: string
  rubric: Array<{ criterion: string; maxPoints: number; description?: string }>; total_possible: number | string | null
}
export type GradedAnswer = {
  criteriaResults: Array<{ criterion: string; maxPoints: number; earnedPoints: number; feedback: string }>
  overallFeedback: string
  totalEarned: number
}

export async function gradeOpenEndedAnswer(session: GradableSession, studentAnswer: string, userId: string, operation = 'grade-open-ended'): Promise<GradedAnswer> {
  const rubricText = (session.rubric as any[])
    .map((r, i) => `${i + 1}. ${r.criterion} (${r.maxPoints} puan): ${r.description}`)
    .join('\n')

  const prompt = `Sen MEB'in "Açık Uçlu Soruların Puanlanması Kursu" eğitiminden geçmiş, dereceli puanlama anahtarına (rubrik) göre değerlendirme yapan deneyimli bir öğretmensin.
Puanlama ilkesi: puanlar görüş bildiren değil, DELİLLERLE DESTEKLENEN yanıtlara verilir. Kısmi puan vermekten çekinme - bir kriterin bir kısmı karşılanmışsa o kısmına denk gelen puanı ver.

YAŞA UYGUN PUANLAMA KURALI — EN ÖNCELİKLİ KURAL:
- Bu öğrenci ${session.grade || 'ortaokul'} seviyesindedir; cevabı bir uzman, akademisyen veya öğretmen metni gibi yazmasını bekleme.
- Ortaokulda 1-3 kısa cümle, lisede 2-4 açık cümle; sorunun istediği doğru düşünceyi içeriyorsa tam puan alabilir.
- Rubrikteki teknik sözcükleri birebir kullanma şartı arama. Aynı doğru kavramı gündelik, basit veya eş anlamlı sözcüklerle anlatan cevabı kabul et.
- Cevap özlü diye puan kırma; yalnız soruda açıkça istenen bir unsur gerçekten yoksa puan kır.
- Türkçe/yabancı dil dersi dışında yazım, noktalama, anlatım veya profesyonel üslup kusurlarını puanlama. Anlam doğruysa içeriğe puan ver.
- Öğrenciden senaryoda veya soruda istenmeyen ek bilgi, uzun gerekçe, kaynak adı, bilimsel terminoloji ya da yetişkin düzeyi ayrıntı bekleme.
- Doğru sonuca ulaşan fakat açıklaması sınırlı cevapta, doğru sonuç ve doğru düşünce için güçlü kısmi puan ver; küçük ifade kusuru sıfır puan nedeni değildir.

SENARYO: ${session.scenario}
SORU: ${session.question}

DERECELI PUANLAMA ANAHTARI:
${rubricText}
(Toplam: ${session.total_possible} puan)

ÖĞRENCİNİN CEVABI:
"""
${studentAnswer.trim()}
"""

Her kriteri ayrı ayrı değerlendir, kaç puan hak ettiğini belirle (0 ile o kriterin maxPoints'i arasında, tam sayı) ve öğrenciye yönelik kısa, yapıcı bir geri bildirim yaz (1-2 cümle, doğrudan öğrenciye hitaben "sen" dilinde).
Ayrıca genel bir değerlendirme cümlesi yaz.

${isForeignLanguageSubject(session.subject) ? `ÖNEMLİ (DİL): Bu bir "${session.subject}" dersi sorusu. ÖĞRENCİNİN CEVABININ "${session.subject}" DİLİNDE OLMASI BEKLENEN VE DOĞRU davranıştır — öğrenci "${session.subject}" dilinde yazdıysa bunu SEBEP GÖSTEREREK ASLA puan kırma veya "yanlış dil" deme; tam tersine cevabın o dildeki dilbilgisi/kullanım açısından doğruluğunu değerlendir. SADECE senin yazacağın feedback ve overallFeedback metinleri Türkçe olsun (senin değerlendirme dilin Türkçe, öğrencinin cevap dili "${session.subject}").` : `ÖNEMLİ: Tüm metinleri SADECE TÜRKÇE yaz. Başka hiçbir dilden (İngilizce, Korece, Çince vb.) tek bir kelime bile kullanma.`}

SADECE aşağıdaki JSON formatında yanıt ver:
{
"criteriaResults": [
  { "criterion": "Kriter adı (rubrikteki ile birebir aynı)", "maxPoints": 30, "earnedPoints": 22, "feedback": "Kısa geri bildirim" }
],
"overallFeedback": "Genel değerlendirme (2-3 cümle, motive edici ama dürüst)"
}`

  const response = await anthropic.messages.create({
    model: CLAUDE_SONNET, ...SONNET_PARAMS,
    max_tokens: sonnetTokens(1500),
    messages: [{ role: 'user', content: prompt }],
  })
  await logAnthropicUsage(operation, CLAUDE_SONNET, response, { userId })

  const text = responseText(response)
  let parsed
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0])
    else throw new Error('AI yanıtı ayrıştırılamadı.')
  }

  if (!Array.isArray(parsed?.criteriaResults)) {
    throw new Error('Puanlama başarısız, tekrar dene.')
  }

  // Guvenlik agi: yabanci alfabe karakterlerini temizle
  const canonicalRubric = Array.isArray(session.rubric) ? session.rubric : []
  parsed.criteriaResults = canonicalRubric.map((criterion: any, index: number) => {
    const modelResult = parsed.criteriaResults[index] || {}
    const maxPoints = Math.max(0, Number(criterion.maxPoints) || 0)
    const earnedPoints = Math.min(maxPoints, Math.max(0, Math.round(Number(modelResult.earnedPoints) || 0)))
    return {
      criterion: stripForeignScripts(String(criterion.criterion || 'Kriter')),
      maxPoints,
      earnedPoints,
      feedback: stripForeignScripts(String(modelResult.feedback || '')),
    }
  })
  parsed.overallFeedback = stripForeignScripts(parsed.overallFeedback || '')

  const totalEarned = Math.min(Number(session.total_possible) || 0,
    parsed.criteriaResults.reduce((s: number, r: any) => s + r.earnedPoints, 0))
  return { criteriaResults: parsed.criteriaResults, overallFeedback: parsed.overallFeedback || '', totalEarned }
}
