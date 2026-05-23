import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Simple equation solver using substitution
function solveAndVerify(question: string, opts: string[], ansIndex: number): { verified: boolean; computedAnswer?: string; error?: string } {
  try {
    // Extract equations like "3(2x+1)-4=2(x+5)" from question
    const eqMatch = question.match(/([0-9x+\-*/()\s.^=]+=[0-9x+\-*/()\s.^]+)/i)
    if (!eqMatch) return { verified: true } // Can't parse, skip

    const eq = eqMatch[1].replace(/\s/g, '')
    const [left, right] = eq.split('=')
    if (!left || !right) return { verified: true }

    // Try each option as the answer
    const claimedAnswer = opts[ansIndex]
    const numMatch = claimedAnswer.match(/-?[\d.]+/)
    if (!numMatch) return { verified: true } // Not a numeric answer

    const x = parseFloat(numMatch[0])

    // Evaluate both sides with x substituted
    const evalSide = (expr: string, xVal: number): number => {
      const safe = expr
        .replace(/(\d)(x)/g, '$1*x')
        .replace(/\)(x)/g, ')*x')
        .replace(/x/g, String(xVal))
        .replace(/\^/g, '**')
      return Function('"use strict"; return (' + safe + ')')()
    }

    const leftVal = evalSide(left, x)
    const rightVal = evalSide(right, x)
    const diff = Math.abs(leftVal - rightVal)

    if (diff > 0.001) {
      // Find actual correct x by testing -20 to 20
      for (let testX = -20; testX <= 20; testX += 0.5) {
        const lv = evalSide(left, testX)
        const rv = evalSide(right, testX)
        if (Math.abs(lv - rv) < 0.001) {
          return { verified: false, computedAnswer: `x = ${testX}` }
        }
      }
      return { verified: false, computedAnswer: 'No integer solution found' }
    }
    return { verified: true }
  } catch {
    return { verified: true } // Parse error, skip verification
  }
}

export async function POST(req: NextRequest) {
  try {
    const { questions, topic, grade, language } = await req.json()
    const verified: any[] = []
    const rejected: number[] = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]

      // Step 1: Local math verification
      const localResult = solveAndVerify(q.q, q.opts || [], q.ans)

      if (!localResult.verified) {
        console.log(`Q${i} failed local verification. Computed: ${localResult.computedAnswer}, Claimed: ${q.opts[q.ans]}`)
        rejected.push(i)
        continue
      }

      // Step 2: Claude double-check for math questions
      const hasMath = /[\d]+[\s]*[+\-*/=^]|equation|formula|calculate|solve|denklem|hesapla|çöz/i.test(q.q)

      if (hasMath) {
        try {
          const checkResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Verify this question and answer are mathematically correct.

Question: ${q.q}
Options: ${(q.opts || []).map((o: string, i: number) => `${i}: ${o}`).join(', ')}
Claimed correct answer index: ${q.ans} (= "${q.opts[q.ans]}")

Solve the problem yourself step by step, then check if the claimed answer matches.
Respond ONLY with JSON: {"correct": true} or {"correct": false, "actual_answer": "the real answer"}`
            }]
          })

          const text = checkResponse.content[0].type === 'text' ? checkResponse.content[0].text.trim() : ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) {
            const result = JSON.parse(match[0])
            if (!result.correct) {
              console.log(`Q${i} failed Claude verification. Actual: ${result.actual_answer}`)
              rejected.push(i)
              continue
            }
          }
        } catch {
          // Claude check failed, keep question
        }
      }

      verified.push(q)
    }

    // If too many rejected, generate replacements
    const needMore = rejected.length
    let replacements: any[] = []

    if (needMore > 0) {
      try {
        const replaceResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Generate ${needMore} replacement multiple choice questions about "${topic}" for level "${grade}" in ${language}.

CRITICAL: For any math equation, solve it completely FIRST, then write the question. Verify ans index points to correct option.

Return ONLY JSON:
{"questions":[{"type":"multiple_choice","q":"...","opts":["A","B","C","D"],"ans":0,"exp":"step by step solution"}]}`
          }]
        })

        const rText = replaceResponse.content[0].type === 'text' ? replaceResponse.content[0].text : ''
        const rMatch = rText.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
        if (rMatch) {
          const rParsed = JSON.parse(rMatch[0])
          replacements = rParsed.questions || []
          // Verify replacements too
          replacements = replacements.filter(q => {
            const r = solveAndVerify(q.q, q.opts || [], q.ans)
            return r.verified
          })
        }
      } catch {
        // Replacement failed, just return what we have
      }
    }

    const final = [...verified, ...replacements].slice(0, questions.length)

    return NextResponse.json({
      questions: final,
      stats: {
        original: questions.length,
        rejected: rejected.length,
        replacements: replacements.length,
        final: final.length
      }
    })
  } catch (error) {
    console.error('Math verify error:', error)
    return NextResponse.json({ questions: [], error: 'Verification failed' }, { status: 500 })
  }
}
