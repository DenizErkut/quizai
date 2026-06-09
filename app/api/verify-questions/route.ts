// app/api/verify-questions/route.ts
// Tüm soru tipleri için AI doğrulama — generate-quiz sonrası otomatik çalışır

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Soru tipine göre doğrulama prompt'u
function buildVerifyPrompt(q: any, lang: string): string {
  const type = q.type || 'multiple_choice'
  const base = `You are a strict educational content verifier. Verify this ${lang} question for correctness.\n\n`

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
3. Are the wrong options plausible but clearly wrong?

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

export async function POST(req: NextRequest) {
  // Internal secret (server-to-server) VEYA Bearer token kabul edilir
  const internalSecret = req.headers.get('x-internal-secret')
  const isInternal = internalSecret && internalSecret === (process.env.CRON_SECRET || 'internal')
  if (!isInternal) {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
    const token = authHeader.slice(7)
    const { createClient: cc } = require('@supabase/supabase-js')
    const sbAuth = cc(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: { user } } = await sbAuth.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 })
  }

  try {
    const { questions, topic, grade, language, questionType } = await req.json()
    if (!questions?.length) return NextResponse.json({ questions: [] })

    // mixed tipte her sorunun kendi type'ı var — ikinci AI doğrulama gerekmiyor
    if (questionType === 'mixed') {
      return NextResponse.json({ questions, stats: { original: questions.length, verified: questions.length, rejected: 0, replacements: 0, final: questions.length } })
    }

    const lang = language || 'Türkçe'
    const verified: any[] = []
    const rejected: number[] = []
    const rejectReasons: string[] = []

    // Her soruyu doğrula — paralel olarak (max 5 aynı anda)
    const BATCH = 5
    for (let i = 0; i < questions.length; i += BATCH) {
      const batch = questions.slice(i, i + BATCH)

      await Promise.all(batch.map(async (q: any, bIdx: number) => {
        const idx = i + bIdx

        // 1. Yerel matematik kontrolü (hızlı)
        if (!quickMathCheck(q)) {
          rejected.push(idx)
          rejectReasons.push(`Q${idx}: local math check failed`)
          return
        }

        // 2. AI doğrulama — sadece doğrulanabilir tipler
        const needsAICheck = ['multiple_choice', 'fill_blank', 'true_false', 'matching', 'multi_true_false'].includes(q.type || 'multiple_choice')

        if (!needsAICheck) {
          verified.push(q)
          return
        }

        try {
          const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 150,
            messages: [{ role: 'user', content: buildVerifyPrompt(q, lang) }],
          })

          const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
          const match = text.match(/\{[\s\S]*\}/)

          if (match) {
            const result = JSON.parse(match[0])
            if (!result.ok) {
              rejected.push(idx)
              rejectReasons.push(`Q${idx} (${q.type}): ${result.reason || 'failed'}`)
              return
            }
          }
          verified.push(q)
        } catch {
          // AI check failed → kabul et
          verified.push(q)
        }
      }))
    }

    // Reddedilen sorular için yenilerini üret
    let replacements: any[] = []
    if (rejected.length > 0) {
      try {
        const replaceType = questionType || 'multiple_choice'
        const replacePrompt = `Generate ${rejected.length} verified ${replaceType} questions about "${topic}" for "${grade}" level in ${lang}.

CRITICAL: Double-check every answer. Only include questions you are 100% certain about.
Each question MUST have "type":"${replaceType}" field.

Return ONLY valid JSON:
{"questions":[{"type":"${replaceType}","q":"...","opts":["A","B","C","D"],"ans":0,"exp":"step by step solution"}]}`

        const replaceRes = await anthropic.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          messages: [{ role: 'user', content: replacePrompt }],
        })

        const rText = replaceRes.content[0].type === 'text' ? replaceRes.content[0].text : ''
        const rMatch = rText.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
        if (rMatch) {
          const parsed = JSON.parse(rMatch[0])
          replacements = (parsed.questions || []).filter((q: any) => quickMathCheck(q))
        }
      } catch {
        // Replacement failed
      }
    }

    const final = [...verified, ...replacements].slice(0, questions.length)

    return NextResponse.json({
      questions: final,
      stats: {
        original: questions.length,
        verified: verified.length,
        rejected: rejected.length,
        replacements: replacements.length,
        final: final.length,
        rejectReasons,
      },
    })
  } catch (error: any) {
    console.error('[verify-questions] error:', error?.message)
    // Hata durumunda orijinal soruları döndür
    const { questions } = await req.json().catch(() => ({ questions: [] }))
    return NextResponse.json({ questions: questions || [] })
  }
}
