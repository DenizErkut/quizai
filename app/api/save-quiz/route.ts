import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  console.log('[save-quiz] POST called')
  try {
    const body = await req.json()
    console.log('[save-quiz] body:', JSON.stringify(body).slice(0, 200))

    const { sessionId, answers, score, userId } = body

    if (!sessionId || !userId) {
      console.log('[save-quiz] Missing params:', { sessionId, userId })
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get session
    const { data: session, error: sessionErr } = await supabase
      .from('quiz_sessions')
      .select('question_count, topic, user_id')
      .eq('id', sessionId)
      .single()

    console.log('[save-quiz] session:', session, 'err:', sessionErr)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const pct = session.question_count > 0
      ? Math.round((score / session.question_count) * 100) : 0

    // Mark completed
    const { error: updateErr } = await supabase
      .from('quiz_sessions')
      .update({ answers, score, pct, completed: true })
      .eq('id', sessionId)

    console.log('[save-quiz] update err:', updateErr)

    // Streak — upsert ile güncelle (insert veya update, tek seferde)
    const today = new Date().toISOString().split('T')[0]
    const { data: existingStreak } = await supabase
      .from('streaks').select('*').eq('user_id', userId).maybeSingle()

    if (!existingStreak) {
      await supabase.from('streaks').upsert({
        user_id: userId, current_streak: 1, longest_streak: 1,
        total_points: 10, last_activity_date: today,
      }, { onConflict: 'user_id' })
      console.log('[save-quiz] streak upserted (new)')
    } else {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yStr = yesterday.toISOString().split('T')[0]
      const last = existingStreak.last_activity_date

      let updateData: any = {}
      if (last === today) {
        updateData = { total_points: (existingStreak.total_points || 0) + 5 }
      } else if (last === yStr) {
        const ns = (existingStreak.current_streak || 0) + 1
        updateData = {
          current_streak: ns,
          longest_streak: Math.max(ns, existingStreak.longest_streak || 0),
          total_points: (existingStreak.total_points || 0) + 10,
          last_activity_date: today,
        }
      } else {
        updateData = {
          current_streak: 1,
          total_points: (existingStreak.total_points || 0) + 10,
          last_activity_date: today,
        }
      }
      const { error: strErr } = await supabase.from('streaks')
        .update(updateData).eq('user_id', userId)
      console.log('[save-quiz] streak updated, last:', last, 'today:', today, 'err:', strErr)
    }

    // Weak topics — multi_true_false için ifade bazında say
    let wrongCount = 0
    let totalCount = answers?.length || 0

    if (Array.isArray(answers)) {
      // Tüm cevapları tara, MTF ise ifade sayısını kullan
      // Not: mTFAnswers body'de gelmiyorsa fallback olarak answer.correct kullan
      wrongCount = answers.filter((a: any) => !a.correct).length
      totalCount = answers.length
    }

    if (wrongCount > 0 && session.topic) {
      const { data: wt } = await supabase.from('weak_topics')
        .select('*').eq('user_id', userId).eq('topic', session.topic).maybeSingle()
      if (wt) {
        await supabase.from('weak_topics').update({
          wrong_count: (wt.wrong_count || 0) + wrongCount,
          total_count: (wt.total_count || 0) + (answers?.length || 0),
          last_seen_at: new Date().toISOString(),
        }).eq('id', wt.id)
      } else {
        await supabase.from('weak_topics').insert({
          user_id: userId, topic: session.topic, subject: 'Genel',
          wrong_count: wrongCount, total_count: answers?.length || 0,
          last_seen_at: new Date().toISOString(),
        })
      }
    }

    console.log('[save-quiz] done, pct:', pct)
    return NextResponse.json({ success: true, pct })
  } catch (error: any) {
    console.error('[save-quiz] ERROR:', error?.message)
    return NextResponse.json({ error: error?.message || 'Save failed' }, { status: 500 })
  }
}
