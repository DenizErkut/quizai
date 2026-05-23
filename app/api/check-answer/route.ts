import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { question, correctAnswer, userAnswer, language } = await req.json()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are a teacher grading a fill-in-the-blank or short answer question.

Question: ${question}
Correct answer: ${correctAnswer}
Student answer: ${userAnswer}

Is the student answer semantically correct or close enough to be accepted? 
Consider:
- Partial matches (e.g. "lift" for "lift force" = correct)
- Synonyms and paraphrases
- Minor spelling variations
- The answer being a part of the correct answer or vice versa

Respond with ONLY: {"correct": true} or {"correct": false}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const result = JSON.parse(text)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ correct: false })
  }
}
