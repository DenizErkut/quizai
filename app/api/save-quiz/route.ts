import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { sessionId, answers, score, userId } = await req.json()
    if (!sessionId || !userId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('question_count, topic')
      .eq('id', sessionId)
      .single()

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const pct = session.question_count > 0
      ? Math.round((score / session.question_count) * 100) : 0

    // Mark completed
    await supabase.from('quiz_sessions').update({
      answers, score, pct, completed: true
    }).eq('id', sessionId)

    // Update streak
    const today = new Date().toISOString().split('T')[0]
    const { data: streak } = await supabase
      .from('streaks').select('*').eq('user_id', userId).single()

    if (!streak) {
      await supabase.from('streaks').insert({
        user_id: userId, current_streak: 1, longest_streak: 1,
        total_points: 10, last_activity_date: today,
      })
    } else {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]
      const last = streak.last_activity_date

      if (last === today) {
        await supabase.from('streaks')
          .update({ total_points: (streak.total_points || 0) + 5 })
          .eq('user_id', userId)
      } else if (last === yesterdayStr) {
        const ns = (streak.current_streak || 0) + 1
        await supabase.from('streaks').update({
          current_streak: ns,
          longest_streak: Math.max(ns, streak.longest_streak || 0),
          total_points: (streak.total_points || 0) + 10,
          last_activity_date: today,
        }).eq('user_id', userId)
      } else {
        await supabase.from('streaks').update({
          current_streak: 1, total_points: (streak.total_points || 0) + 10,
          last_activity_date: today,
        }).eq('user_id', userId)
      }
    }

    // Update weak topics
    const wrongCount = (answers || []).filter((a: any) => !a.correct).length
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

    return NextResponse.json({ success: true, pct })
  } catch (error) {
    console.error('Save quiz error:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
