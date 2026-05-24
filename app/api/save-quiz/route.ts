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

    // Update streak
    const today = new Date().toISOString().split('T')[0]
    const { data: streak } = await supabase
      .from('streaks').select('*').eq('user_id', userId).maybeSingle()

    if (!streak) {
      await supabase.from('streaks').insert({
        user_id: userId, current_streak: 1, longest_streak: 1,
        total_points: 10, last_activity_date: today,
      })
      console.log('[save-quiz] streak created')
    } else {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yStr = yesterday.toISOString().split('T')[0]
      const last = streak.last_activity_date

      if (last === today) {
        await supabase.from('streaks')
          .update({ total_points: (streak.total_points || 0) + 5 })
          .eq('user_id', userId)
      } else if (last === yStr) {
        const ns = (streak.current_streak || 0) + 1
        await supabase.from('streaks').update({
          current_streak: ns,
          longest_streak: Math.max(ns, streak.longest_streak || 0),
          total_points: (streak.total_points || 0) + 10,
          last_activity_date: today,
        }).eq('user_id', userId)
      } else {
        await supabase.from('streaks').update({
          current_streak: 1,
          total_points: (streak.total_points || 0) + 10,
          last_activity_date: today,
        }).eq('user_id', userId)
      }
      console.log('[save-quiz] streak updated, last:', last, 'today:', today)
    }

    // Weak topics
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
        }).catch(() => {})
      }
    }

    console.log('[save-quiz] done, pct:', pct)
    return NextResponse.json({ success: true, pct })
  } catch (error: any) {
    console.error('[save-quiz] ERROR:', error?.message)
    return NextResponse.json({ error: error?.message || 'Save failed' }, { status: 500 })
  }
}
