// app/api/verify-questions/route.ts
// Tüm soru tipleri için AI doğrulama — generate-quiz sonrası otomatik çalışır

import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 90
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { verifyQuestionWithOpenAI } from '@/lib/openai'
import { verifyQuestionSetWithGemini, verifyQuestionWithGemini } from '@/lib/verify-gemini'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { decideQuestionQuality, evaluateQuestionStructure, providerQualitySignal } from '@/lib/ai-gateway'
import { verifyQuestionWithMistral } from '@/lib/mistral-quality'
import { requireAgentCapability, writeAgentDecisionAudit } from '@/lib/agent-security-policy'
import { evaluateStrictQuestionReview, filterQuestionsByRequestedType, normalizeRequestedQuestionType } from '@/lib/quiz-generation-policy'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const auditDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Matematik icerikli soru mu - varsa bagimsiz kontrol icin OpenAI'a yonlendirilir
// (Claude'un kendi urettigini yine Claude'a kontrol ettirmek yerine)
function isMathQuestion(q: any): boolean {
  const text = `${q.q || ''} ${(q.opts || []).join(' ')}`
  return /[0-9]\s*[+\-*/=]\s*[0-9]|denklem|hesapla|çöz|eşitlik|kaçtır|toplam|fark|çarp|bölüm|equation|solve|calculate|basamak|okunuş|rakam/i.test(text)
}

// Soru tipine göre doğrulama prompt'u
function buildVerifyPromptBase(q: any, lang: string): string {
  const type = q.type || 'multiple_choice'
  const base = `You are a strict educational content verifier. Verify this question for correctness and language consistency.\n\nExpected question language: ${lang}\n\nLANGUAGE RULE (MANDATORY): The question stem and answer options must be written in the expected language. Foreign proper names, formulas and short quoted examples are allowed, but a question written mainly in another language MUST return ok:false with reason \"language_mismatch\". The explanation may be Turkish for foreign-language courses.\n\nSELF-CONTAINMENT RULE (MANDATORY): If the question says a word is underlined/highlighted/emphasized, that exact target must be visibly marked inside the question with [square brackets]. Otherwise return ok:false with reason \"missing_visible_emphasis\".\n\n`

  switch (type) {
    case 'multiple_choice':
    case 'fill_blank':
      return base + `Question: ${q.q}
Options: ${(q.opts || []).map((o: string, i: number) => `${i}:${o}`).join(' | ')}
Claimed correct index: ${q.ans} = "${q.opts?.[q.ans]}"
Explanation: ${q.exp || '—'}

Check:
1. Is the question clear and unambiguous?
2. Is the claimed answer actually correct?
3. Is there EXACTLY ONE defensible correct option? Reject if two options express the same valid reason from different angles.
4. Does the wording of the claimed option agree with the explanation? Reject when the explanation describes the opposite operation/error from the selected option.
5. Are the wrong options plausible but clearly wrong?
6. Are the question and options predominantly in the expected language?
7. Is every referenced underline/highlight visibly marked with [square brackets]?
8. Does the question require meaningful use of the target knowledge rather than a trivial wording/recall trick, and are all distractors realistic student misconceptions? Reject trivial or implausible-option questions.

Respond ONLY with JSON: {"ok": true} or {"ok": false, "reason": "brief reason", "fix": "correct answer if wrong"}`

    case 'true_false':
      return base + `Statement: ${q.q}
Claimed answer: ${q.ans === 0 ? 'TRUE' : 'FALSE'}
Explanation: ${q.exp || '—'}

Is this statement clearly true or false? Is the claimed answer correct?
Respond ONLY with JSON: {"ok": true} or {"ok": false, "reason": "brief reason"}`

    case 'multi_true_false':
      return base + `Question: ${q.q}
Statements: ${(q.statements || []).map((s: any, i: number) => `${i}: "${s.text}" → ${s.correct ? 'TRUE' : 'FALSE'}`).join('\n')}

Verify each statement's true/false label is correct.
Respond ONLY with JSON: {"ok": true} or {"ok": false, "reason": "which statements are wrong"}`

    case 'matching':
      return base + `Question: ${q.q}
Pairs: ${(q.pairs || []).map((p: any) => `"${p.left}" → "${p.right}"`).join(' | ')}

Are all pairs correctly matched?
Respond ONLY with JSON: {"ok": true} or {"ok": false, "reason": "which pair is wrong"}`

    case 'ordering':
      return base + `Question: ${q.q}
Items: ${(q.items || []).join(' | ')}
Correct order indices: ${(q.correctOrder || []).join(',')}

Is the claimed ordering correct?
Respond ONLY with JSON: {"ok": true} or {"ok": false, "reason": "correct order explanation"}`

    default:
      return base + `Question: ${q.q}\nIs this question clear and answerable?\nRespond ONLY with JSON: {"ok": true} or {"ok": false, "reason": "..."}`
  }
}

type ObjectiveCandidate = { ref: string; objectiveCode: string; title: string; subject?: string; grade?: string }

function buildVerifyPrompt(q: any, lang: string, objective?: ObjectiveCandidate | null): string {
  const difficulty = typeof q.difficulty === 'string' ? q.difficulty : ''
  const criteria = `${difficulty ? `\n\nDIFFICULTY CLAIM: "${difficulty}". Easy = one basic concept/at most one operation; normal = two connected reasoning steps or concept application; hard = multi-step reasoning, transfer to a new situation, or combined concepts. Larger numbers or longer wording alone do not make an item hard. Set difficultyMatches=true only if the actual cognitive work matches the claim.` : ''}${objective ? `\n\nCANONICAL LEARNING OUTCOME: [${objective.objectiveCode}] ${objective.title} (${objective.grade || ''} ${objective.subject || ''}). Does this exact question directly assess that outcome, not merely share a broad topic? Set objectiveMatches=true only for direct alignment.` : ''}`
  return buildVerifyPromptBase(q, lang) + criteria
    + '\n\nReturn strict JSON with difficultyMatches (boolean); when an approved canonical learning outcome is supplied, also include objectiveMatches (boolean). Missing fields mean this item failed strict review.'
}

async function verifyQuestionWithClaude(verifyPrompt: string): Promise<{ ok: boolean; reason?: string; difficultyMatches?: boolean; objectiveMatches?: boolean } | null> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 180,
      messages: [{ role: 'user', content: verifyPrompt }],
    })
    logAnthropicUsage('verify-questions:claude-fallback', 'claude-sonnet-4-5', res)
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return parsed && typeof parsed.ok === 'boolean' ? parsed : null
  } catch {
    return null
  }
}

// Matematik için yerel hızlı kontrol (API çağrısı yapmadan)
function quickMathCheck(q: any): boolean {
  if (!q.q || !q.opts) return true
  const isMath = /[0-9]\s*[+\-*/=]\s*[0-9]|denklem|hesapla|çöz|solve|equation/i.test(q.q)
  if (!isMath) return true

  try {
    const numMatch = (q.opts[q.ans] || '').match(/-?[\d.]+/)
    if (!numMatch) return true

    const eqMatch = q.q.match(/([0-9x+\-*/().\s^]+=[0-9x+\-*/().\s^]+)/)
    if (!eqMatch) return true

    const [left, right] = eqMatch[1].split('=')
    const x = parseFloat(numMatch[0])
    const evalSide = (expr: string, xVal: number) => {
      const safe = expr.replace(/(\d)(x)/g, '$1*x').replace(/x/g, String(xVal)).replace(/\^/g, '**')
      return Function('"use strict"; return (' + safe + ')')()
    }
    const diff = Math.abs(evalSide(left, x) - evalSide(right, x))
    return diff < 0.01
  } catch {
    return true
  }
}

// Öğretmen geri bildirimiyle bulunan gerçek bir hata (13 Ağustos 2026):
// büyük sayılarda (8-10 haneli, "149 597 890" gibi) "X basamağında hangi
// rakam var" / "X basamağının basamak değeri kaçtır" sorularında AI
// (Claude) kendi ürettiği açıklamada bile basamak sayarken KAYMA hatası
// yapıyordu (ör. sondaki "0"ı atlayıp tüm basamak isimlerini bir kaydırma).
// isMathQuestion() regex'i bu soru kalıbını ("kaçtır" hariç, "hangi rakam
// bulunmaktadır" gibi ifadeler) YAKALAMADIĞI için bu sorular yanlışlıkla
// "matematik değil" sayılıp BAĞIMSIZ OpenAI kontrolü yerine Claude'un
// kendi kendini kontrol etmesine bırakılıyordu — bu da aynı hatayı
// tekrarlıyordu. Bu fonksiyon, AI'a hiç güvenmeden, KOD İLE (Python/JS
// aritmetiği ile) basamak hesabını yapıp iddia edilen cevapla karşılaştırır
// — matematiksel olarak %100 güvenilir, AI'ın hesap hatası riski hiç yok.
const BASAMAK_ADLARI = ['birler', 'onlar', 'yüzler', 'binler', 'on binler', 'yüz binler', 'milyonlar', 'on milyonlar', 'yüz milyonlar', 'milyarlar', 'on milyarlar', 'yüz milyarlar']

function checkBasamakQuestion(q: any): { ok: boolean; gercekCevap: string } | null {
  const text = q.q || ''
  if (!/basamağ/i.test(text)) return null // basamak sorusu değil

  const numMatch = text.match(/\d{1,3}(?:[\s.]\d{3})+/)
  if (!numMatch) return null

  const digits = numMatch[0].replace(/[\s.]/g, '')
  const tl = text.toLowerCase()
  const sortedNames = [...BASAMAK_ADLARI].sort((a, b) => b.length - a.length)
  const basamakAdi = sortedNames.find(ad => tl.includes(ad + ' basamağ'))
  if (!basamakAdi) return null

  const basamakIndex = BASAMAK_ADLARI.indexOf(basamakAdi)
  if (basamakIndex >= digits.length) return null // sayı bu basamağa sahip değil

  const gercekRakam = digits[digits.length - 1 - basamakIndex]
  const basamakDegeriIsteniyor = /basamak değeri/i.test(text)
  const dogruCevap = basamakDegeriIsteniyor
    ? String(parseInt(gercekRakam, 10) * Math.pow(10, basamakIndex))
    : gercekRakam

  const iddiaEdilenCevap = (q.opts?.[q.ans] || '').replace(/[\s.]/g, '')
  return { ok: iddiaEdilenCevap === dogruCevap, gercekCevap: dogruCevap }
}

export async function POST(req: NextRequest) {
  const agent = 'question-verifier-v1' as const
  requireAgentCapability(agent, 'verify_content')
  // Only a verified user token is accepted; do not use a service-role bypass here.
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const sbAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: { user } } = await sbAuth.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })

  try {
    const body = await req.json()
    const { questions: rawQuestions, topic, grade, language } = body
    const questionType = normalizeRequestedQuestionType(body.questionType)
    const questions = Array.isArray(rawQuestions)
      ? filterQuestionsByRequestedType(rawQuestions, questionType)
      : []
    const reviewContext = {
      userId: user.id,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
    }
    const strictQualityPolicy = body?.strictQualityPolicy === true
    const objectiveCandidates = Array.isArray(body?.objectiveCandidates)
      ? body.objectiveCandidates as ObjectiveCandidate[]
      : []
    if (!questions?.length) return NextResponse.json({ questions: [] })

    // Mixed tipte pahalı ikinci AI doğrulama yapılmaz; fakat tüm tipler merkezi
    // deterministik şema kontrolünden geçer.
    if (questionType === 'mixed' && !strictQualityPolicy) {
      const accepted = questions.filter((question: any) => evaluateQuestionStructure(question).verdict === 'accept')
      const stats = { policyVersion: 'quality-engine-v1', original: questions.length, verified: accepted.length, rejected: questions.length - accepted.length, replacements: 0, final: accepted.length }
      await writeAgentDecisionAudit(auditDb, { actor_id: user.id, agent_name: agent, policy_version: 'question-verification-boundary-v1', input_summary: { question_count: questions.length, question_type: 'mixed' }, decision_summary: { verified: accepted.length, rejected: stats.rejected } })
      return NextResponse.json({ questions: accepted, stats })
    }

    const lang = language || 'Türkçe'
    const verified: any[] = []
    const rejected: number[] = []
    const rejectReasons: string[] = []
    const rejectionDetails: Array<{
      questionIndex: number
      objectiveCode: string | null
      generationProvider: string
      validator: string
      controlType: string
      reasonCode: string
    }> = []

    // Her soruyu doğrula — paralel olarak (max 5 aynı anda)
    const BATCH = 5
    for (let i = 0; i < questions.length; i += BATCH) {
      const batch = questions.slice(i, i + BATCH)

      await Promise.all(batch.map(async (q: any, bIdx: number) => {
        const idx = i + bIdx

        const structuralDecision = decideQuestionQuality([evaluateQuestionStructure(q)])
        if (structuralDecision.verdict === 'reject') {
          rejected.push(idx)
          rejectReasons.push(`Q${idx}: ${structuralDecision.reasonCode}`)
          rejectionDetails.push({ questionIndex: idx, objectiveCode: null, generationProvider: String(q.generationProvider || 'unknown'), validator: 'deterministic', controlType: 'structure', reasonCode: structuralDecision.reasonCode })
          return
        }

        // 1. Yerel matematik kontrolü (hızlı)
        if (!quickMathCheck(q)) {
          rejected.push(idx)
          rejectReasons.push(`Q${idx}: local math check failed`)
          rejectionDetails.push({ questionIndex: idx, objectiveCode: null, generationProvider: String(q.generationProvider || 'unknown'), validator: 'deterministic', controlType: 'math', reasonCode: 'local_math_check_failed' })
          return
        }

        // 1b. Basamak sorusu ise -- AI'a hiç gitmeden, kod ile kesin kontrol
        const basamakResult = checkBasamakQuestion(q)
        if (basamakResult && !basamakResult.ok) {
          rejected.push(idx)
          rejectReasons.push(`Q${idx}: basamak hesabı yanlış (doğrusu: ${basamakResult.gercekCevap})`)
          rejectionDetails.push({ questionIndex: idx, objectiveCode: null, generationProvider: String(q.generationProvider || 'unknown'), validator: 'deterministic', controlType: 'place_value', reasonCode: 'place_value_mismatch' })
          return
        }

        // 2. AI doğrulama — sadece doğrulanabilir tipler
        // A single canonical objective is unambiguous. Models occasionally
        // omit the ref even when the question was generated from the supplied
        // objective list; seed that ref so the independent reviewer can still
        // verify direct alignment. Multiple candidates remain fail-closed.
        if (strictQualityPolicy && objectiveCandidates.length === 1
          && (typeof q.learningObjectiveRef !== 'string' || !q.learningObjectiveRef.trim())) {
          q.learningObjectiveRef = objectiveCandidates[0].ref
        }
        const selectedObjective = objectiveCandidates.find(candidate => candidate.ref === q.learningObjectiveRef) || null
        if (strictQualityPolicy && objectiveCandidates.length > 0 && !selectedObjective) {
          rejected.push(idx)
          rejectReasons.push(`Q${idx}: canonical objective missing or invalid`)
          rejectionDetails.push({ questionIndex: idx, objectiveCode: null, generationProvider: String(q.generationProvider || 'unknown'), validator: 'deterministic', controlType: 'objective', reasonCode: 'canonical_objective_missing' })
          return
        }
        const needsAICheck = strictQualityPolicy || ['multiple_choice', 'fill_blank', 'true_false', 'matching', 'multi_true_false'].includes(q.type || 'multiple_choice')

        if (!needsAICheck) {
          verified.push(strictQualityPolicy ? { ...q, qualityVerificationVersion: 'quiz-quality-v2', difficultyVerified: true, objectiveVerified: objectiveCandidates.length === 0 } : q)
          return
        }

        try {
          // Matematik sorularinda BAGIMSIZ kontrol icin OpenAI (Claude kendi
          // urettigini yine Claude'a kontrol ettirmiyor). Diger tipler icin
          // Claude ile devam ediyoruz.
          const verifyPrompt = buildVerifyPrompt(q, lang, selectedObjective)
          const generatingProvider = q.generationProvider === 'mistral' ? 'mistral' : q.generationProvider === 'openai' ? 'openai' : 'anthropic'

          // Birincil (OpenAI/Claude) ve Gemini kontrollerini SIRALI degil
          // PARALEL calistir - sirali calistirmak toplam gecikmeyi ikiye
          // katliyordu ve generate-quiz'in 60sn'lik zaman asimina neden
          // oluyordu.
          const [primaryCheck, geminiCheck, mistralCheck] = await Promise.all([
            strictQualityPolicy
              ? generatingProvider === 'mistral'
                ? verifyQuestionWithOpenAI(verifyPrompt, 'gpt-4.1-mini', { userId: user.id, quizSessionId: reviewContext.sessionId, requestId: reviewContext.requestId })
                : verifyQuestionWithMistral(verifyPrompt, reviewContext)
              : isMathQuestion(q)
                ? verifyQuestionWithOpenAI(verifyPrompt)
                : (async () => {
                  const res = await anthropic.messages.create({
                    model: 'claude-sonnet-4-5',
                    max_tokens: 150,
                    messages: [{ role: 'user', content: verifyPrompt }],
                  })
                  logAnthropicUsage('verify-questions:claude', 'claude-sonnet-4-5', res)
                  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
                  const match = text.match(/\{[\s\S]*\}/)
                  return match ? JSON.parse(match[0]) : { ok: true }
                })(),
            strictQualityPolicy ? Promise.resolve(null) : verifyQuestionWithGemini(verifyPrompt),
            strictQualityPolicy || generatingProvider === 'mistral'
              ? Promise.resolve(null)
              : verifyQuestionWithMistral(verifyPrompt, reviewContext),
          ])

          if (strictQualityPolicy) {
            // İlk bağımsız denetleyicinin tek başına reddi adaptif testi
            // kesmesin. Aynı soru ikinci, farklı bir sağlayıcı tarafından
            // yeniden incelenir; iki açık ret olursa fail-closed kalır.
            let secondaryCheck = primaryCheck?.ok === false
              ? await verifyQuestionWithGemini(verifyPrompt)
              : null
            // Gemini is an optional whole-set layer and can be unavailable or
            // return malformed JSON. A primary rejection still deserves a
            // real independent second opinion before the item is discarded.
            if (primaryCheck?.ok === false && !secondaryCheck) {
              secondaryCheck = generatingProvider === 'anthropic'
                ? await verifyQuestionWithOpenAI(verifyPrompt, 'gpt-4.1-mini', reviewContext)
                : await verifyQuestionWithClaude(verifyPrompt)
            }
            const strictReview = evaluateStrictQuestionReview({
              primary: primaryCheck,
              secondary: [secondaryCheck],
              objectiveRequired: objectiveCandidates.length > 0,
            })
            if (!Boolean(q.difficulty) || !strictReview.passed) {
              rejected.push(idx)
              const reasonCode = primaryCheck?.ok === false
                ? (secondaryCheck?.ok === false ? 'two_provider_rejection' : 'primary_rejection_not_overturned')
                : 'strict_evidence_missing'
              rejectReasons.push(`Q${idx}: ${reasonCode}`)
              rejectionDetails.push({
                questionIndex: idx,
                objectiveCode: selectedObjective?.objectiveCode || null,
                generationProvider: generatingProvider,
                validator: generatingProvider === 'mistral' ? 'openai+gemini' : 'mistral+gemini',
                controlType: 'independent_quality',
                reasonCode,
              })
              return
            }
            verified.push({
              ...q,
              qualityVerificationVersion: 'quiz-quality-v2',
              difficultyVerified: strictReview.difficultyVerified,
              objectiveVerified: strictReview.objectiveVerified,
            })
            return
          }

          const providerDecision = decideQuestionQuality([
            providerQualitySignal(isMathQuestion(q) ? 'openai-validator' : 'anthropic-validator', primaryCheck),
            providerQualitySignal('gemini-validator', geminiCheck),
            providerQualitySignal('mistral-validator', mistralCheck),
          ])

          if (providerDecision.verdict === 'reject') {
            rejected.push(idx)
            const rejectedSignal = providerDecision.signals.find(signal => signal.verdict === 'reject')
            rejectReasons.push(`Q${idx} (${q.type}): ${rejectedSignal?.source || 'validator'} ${rejectedSignal?.detail || providerDecision.reasonCode}`)
            return
          }

          verified.push(q)
        } catch {
          if (strictQualityPolicy) {
            rejected.push(idx)
            rejectReasons.push(`Q${idx}: strict independent verification unavailable`)
            rejectionDetails.push({ questionIndex: idx, objectiveCode: selectedObjective?.objectiveCode || null, generationProvider: String(q.generationProvider || 'unknown'), validator: 'independent_provider', controlType: 'availability', reasonCode: 'strict_verification_unavailable' })
          } else {
            // Legacy non-strict verification preserves historical behavior.
            verified.push(q)
          }
        }
      }))
    }

    let geminiSetReview: { ok: boolean; reason?: string; issueIndexes?: number[] } | null = null
    // Bazı adaylar elense bile kabul edilen alt küme Gemini'nin genel set
    // kontrolünden geçmeden öğrenciye dönmez.
    if (strictQualityPolicy && verified.length > 0) {
      geminiSetReview = await verifyQuestionSetWithGemini({
        questions: verified,
        topic: String(topic || ''),
        grade: String(grade || ''),
        language: String(lang || ''),
      })
      if (geminiSetReview?.ok === false) {
        rejectReasons.push(`Final Gemini set review rejected: ${geminiSetReview.reason || 'material issue detected'}`)
        rejectionDetails.push({ questionIndex: -1, objectiveCode: null, generationProvider: 'mixed', validator: 'gemini', controlType: 'whole_set', reasonCode: 'gemini_set_rejection' })
        rejected.push(...(geminiSetReview.issueIndexes || []))
        verified.splice(0, verified.length)
      } else {
        const reviewStatus = geminiSetReview?.ok === true ? 'passed' : 'unavailable'
        if (reviewStatus === 'unavailable') {
          console.warn('[verify-questions] Gemini whole-set review unavailable; per-question provider review remains enforced')
        }
        verified.splice(0, verified.length, ...verified.map(question => ({ ...question, geminiSetReviewStatus: reviewStatus })))
      }
    }

    // Reddedilen sorular için yenilerini üret
    let replacements: any[] = []
    if (rejected.length > 0 && !strictQualityPolicy) {
      try {
        const replaceType = questionType || 'multiple_choice'
        const replacePrompt = `Generate ${rejected.length} verified ${replaceType} questions about "${topic}" for "${grade}" level in ${lang}.

CRITICAL: Double-check every answer. Only include questions you are 100% certain about.
The question stem and every option MUST be in ${lang}. Do not switch to another language.
If you refer to an underlined/highlighted word, mark that exact word with [square brackets].
Each question MUST have "type":"${replaceType}" field.

Return ONLY valid JSON:
{"questions":[{"type":"${replaceType}","q":"...","opts":["A","B","C","D"],"ans":0,"exp":"step by step solution"}]}`

        const replaceRes = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          messages: [{ role: 'user', content: replacePrompt }],
        })
        logAnthropicUsage('verify-questions:replace', 'claude-sonnet-4-5', replaceRes, {
          meta: { rejectedCount: rejected.length },
        })

        const rText = replaceRes.content[0].type === 'text' ? replaceRes.content[0].text : ''
        const rMatch = rText.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
        if (rMatch) {
          const parsed = JSON.parse(rMatch[0])
          const replacementCandidates = (parsed.questions || []).filter((q: any) =>
            quickMathCheck(q) && evaluateQuestionStructure(q).verdict === 'accept'
          )
          const checkedReplacements = await Promise.all(replacementCandidates.map(async (q: any) => ({
            question: q,
            review: await verifyQuestionWithMistral(buildVerifyPrompt(q, lang)),
          })))
          replacements = checkedReplacements
            .filter(({ review }) => review?.ok !== false)
            .map(({ question }) => question)
        }
      } catch {
        // Replacement failed
      }
    }

    const final = [...verified, ...replacements].slice(0, questions.length)

    await writeAgentDecisionAudit(auditDb, { actor_id: user.id, agent_name: agent, policy_version: 'question-verification-boundary-v2', input_summary: { question_count: questions.length, question_type: questionType || 'multiple_choice' }, decision_summary: { verified: verified.length, rejected: rejected.length, replacements: replacements.length, final: final.length, rejection_details: rejectionDetails } })

    return NextResponse.json({
      questions: final,
      stats: {
        policyVersion: strictQualityPolicy ? 'quiz-quality-v2' : 'quality-engine-v1',
        original: questions.length,
        verified: verified.length,
        rejected: rejected.length,
        replacements: replacements.length,
        final: final.length,
        rejectReasons,
        ...(strictQualityPolicy ? { geminiSetReview } : {}),
      },
    })
  } catch (error: any) {
    console.error('[verify-questions] error:', error?.message)
    return NextResponse.json({ error: 'Soru doğrulaması veya denetim kaydı tamamlanamadı.' }, { status: 503 })
  }
}
