import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function buildPrompt(type: string, topic: string, grade: string, difficulty: string, language: string, count: number, fileContent?: string): string {
  const contentNote = fileContent
    ? `Topic: "${topic}". Generate questions from this content:\n${fileContent.slice(0, 3000)}`
    : `Topic: "${topic}".`

  const base = `${contentNote}\nLevel: ${grade}. Difficulty: ${difficulty}. Language for all questions and explanations: ${language}. Question count: ${count}.\n\nCRITICAL ACCURACY RULES:\n1. For math: solve fully before writing, verify the answer is in opts at the correct index\n2. For science/history: only include facts you are certain about\n3. The "ans" index must point to the CORRECT answer in "opts"\n4. If you are unsure, use a simpler question\n\nReturn ONLY valid JSON, no markdown, no explanation.\n\n`

  if (type === 'fill_blank') return base + `Generate fill-in-the-blank questions. Leave a critical word/concept as blank. Provide 4 options (one correct), write the correct answer in "blank" field too.
IMPORTANT: For any calculation or factual claim, verify it is 100% correct before including.

{"questions":[{"type":"fill_blank","q":"_____ is the powerhouse of the cell.","blank":"Mitochondria","opts":["Mitochondria","Ribosome","Nucleus","Lysosome"],"ans":0,"exp":"Mitochondria produces ATP through cellular respiration."}]}`

  if (type === 'true_false') return base + `Generate true/false questions with reasoning. ans:0 means True, ans:1 means False. opts must always be ["True","False"] but translated to ${language}.

{"questions":[{"type":"true_false","q":"Photosynthesis only occurs during daytime.","opts":["True","False"],"ans":0,"exp":"Photosynthesis requires light energy so it occurs during daytime."}]}`

  if (type === 'matching') return base + `Generate matching questions. Each question has 4 concept-definition pairs in "pairs" array.

{"questions":[{"type":"matching","q":"Match cell organelles with their functions.","pairs":[{"left":"Mitochondria","right":"Energy production"},{"left":"Ribosome","right":"Protein synthesis"},{"left":"Nucleus","right":"DNA storage"},{"left":"Lysosome","right":"Digestion"}],"opts":["A","B","C","D"],"ans":0,"exp":"Each organelle has a critical role in the cell."}]}`

  if (type === 'ordering') return base + `Generate ordering/sequencing questions. Provide 4-5 items in random order in "items" array. "correctOrder" contains the indices of items in correct order.

{"questions":[{"type":"ordering","q":"Order these events chronologically.","items":["Event B","Event A","Event D","Event C"],"correctOrder":[1,0,3,2],"opts":["1st","2nd","3rd","4th"],"ans":0,"exp":"The correct chronological order is A, B, C, D."}]}`

  if (type === 'short_answer') return base + `Generate short answer questions. Write a model/example answer in opts[0]. ans:0. Student will write their own answer.

{"questions":[{"type":"short_answer","q":"What is photosynthesis and where does it occur?","opts":["Photosynthesis is the process by which plants use sunlight to convert CO2 and water into glucose and oxygen. It occurs in chloroplasts."],"ans":0,"exp":"Equation: 6CO2 + 6H2O + light -> C6H12O6 + 6O2"}]}`

  // default: multiple_choice
  return base + `Generate multiple choice questions with 4 options (A/B/C/D), correct answer index, and explanation.

CRITICAL FOR MATH/SCIENCE QUESTIONS:
- Solve every calculation step by step BEFORE writing the question
- Verify your answer is correct mathematically
- Make sure the correct answer actually appears in the options at the index you specify in "ans"
- Double-check: if ans=0, opts[0] must be the verified correct answer
- Never include ambiguous or trick questions where multiple answers could be correct

{"questions":[{"type":"multiple_choice","q":"Question text here","opts":["Option A","Option B","Option C","Option D"],"ans":0,"exp":"Step by step explanation"}]}`
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, monthly_test_count, grade, language')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if (profile.plan === 'free' && (profile.monthly_test_count || 0) >= 10) {
      return NextResponse.json({ error: 'limit_reached' }, { status: 429 })
    }

    const body = await req.json()
    const {
      topic,
      questionCount = 10,
      difficulty = 'normal',
      language,
      fileContent,
      includeVisuals = true,
      questionType = 'multiple_choice',
      dailyChallenge = false,
    } = body

    const lang = language || profile.language || 'Turkce'
    const grade = profile.grade || 'ortaokul 6. sinif'

    const prompt = buildPrompt(questionType, topic, grade, difficulty, lang, questionCount, fileContent)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Invalid JSON')
      parsed = JSON.parse(match[0])
    }

    let questions = parsed.questions || []

    // Math verification pipeline
    const isMathTopic = /math|matematik|calcul|denklem|geometr|cebir|trigon|istatistik|olasil|fizik|kimya|physics|chemistry|algebra|equation|formula/i.test(topic)
    const isMathType = questionType === 'multiple_choice'

    if (isMathTopic && isMathType && questions.length > 0) {
      try {
        const verifyRes = await fetch(`${req.nextUrl.origin}/api/verify-math`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions, topic, grade, language: lang }),
        })
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json()
          if (verifyData.questions?.length > 0) {
            questions = verifyData.questions
            console.log('Math verification stats:', verifyData.stats)
          }
        }
      } catch (e) {
        console.error('Math verification skipped:', e)
      }
    }

    if (!dailyChallenge) {
      await supabase
        .from('profiles')
        .update({ monthly_test_count: (profile.monthly_test_count || 0) + 1 })
        .eq('id', user.id)
    }

    const { data: session } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        topic,
        grade: profile.grade,
        language: lang,
        question_count: questions.length,
        questions,
        answers: [],
        score: 0,
        pct: 0,
        completed: false,
        question_type: questionType,
      })
      .select('id')
      .single()

    return NextResponse.json({ questions, sessionId: session?.id })
  } catch (error) {
    console.error('Generate quiz error:', error)
    return NextResponse.json({ error: 'Quiz generation failed' }, { status: 500 })
  }
}
