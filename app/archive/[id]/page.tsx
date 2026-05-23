import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!session) notFound()

  const questions: { question: string; options: string[]; correct: number }[] = session.questions
  const answers: number[] = session.answers

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/archive" className="text-sm text-gray-500 hover:text-indigo-600 mb-6 inline-block">
        ← Arşive dön
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">{session.topic}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date(session.created_at).toLocaleDateString('tr-TR', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
          {' · '}{session.question_count} soru{' · '}
          <span className={session.pct >= 70 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
            %{session.pct}
          </span>
        </p>
      </div>

      <div className="space-y-6">
        {questions.map((q, i) => {
          const userAnswer = answers[i]
          const isCorrect = userAnswer === q.correct

          return (
            <div
              key={i}
              className={`p-5 rounded-xl border-2 ${
                isCorrect
                  ? 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800'
                  : 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-3 mb-4">
                <span className={`text-lg shrink-0 ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                  {isCorrect ? '✓' : '✗'}
                </span>
                <p className="font-medium text-sm leading-relaxed">{i + 1}. {q.question}</p>
              </div>
              <div className="space-y-2 ml-7">
                {q.options.map((opt, j) => {
                  const isUserChoice = j === userAnswer
                  const isCorrectChoice = j === q.correct
                  return (
                    <div
                      key={j}
                      className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                        isCorrectChoice
                          ? 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100 font-semibold'
                          : isUserChoice && !isCorrect
                          ? 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 line-through'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <span className="opacity-50 text-xs">{String.fromCharCode(65 + j)})</span>
                      {opt}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-10 flex gap-3">
        <Link
          href={`/quiz/retry/${session.id}`}
          className="flex-1 text-center py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
        >
          Yanlışları Tekrar Çöz
        </Link>
        <Link
          href="/quiz"
          className="flex-1 text-center py-3 rounded-xl border border-gray-200 dark:border-gray-700 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Yeni Test
        </Link>
      </div>
    </div>
  )
}
