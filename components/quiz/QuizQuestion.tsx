'use client'
import { Fragment } from 'react'
import { DIFFICULTIES, type Question } from '@/lib/quiz-constants'

interface QuizQuestionProps {
  questions: Question[]
  current: number
  answers: { userAns: number; correct: boolean }[]
  difficulty: string
  currentLang: string
  checkingAnswer: boolean
  fillInput: string
  shortInput: string
  chosen: number | null
  orderAnswer: string[]
  matchAnswer: Record<number, number>
  multiTFAnswer: Record<number, boolean | null>
  tableFillAnswer: string[]
  onSelectAnswer: (idx: number) => void
  onFillSubmit: () => void
  onNext: () => void
  setFillInput: (v: string) => void
  setShortInput: (v: string) => void
  setOrderAnswer: (v: string[]) => void
  setMatchAnswer: (fn: (prev: Record<number, number>) => Record<number, number>) => void
  setMultiTFAnswer: (fn: (prev: Record<number, boolean | null>) => Record<number, boolean | null>) => void
  setTableFillAnswer: (fn: (prev: string[]) => string[]) => void
  onFinish: () => void
  shuffledPairs: string[]
  shuffledIndexMap: number[]
}

export default function QuizQuestion({
  questions, current, answers, difficulty, currentLang,
  checkingAnswer, fillInput, shortInput, chosen, orderAnswer,
  matchAnswer, multiTFAnswer, tableFillAnswer,
  onSelectAnswer, onFillSubmit, onNext, setFillInput, setShortInput,
  setOrderAnswer, setMatchAnswer, setMultiTFAnswer, setTableFillAnswer,
  onFinish, shuffledPairs, shuffledIndexMap,
}: QuizQuestionProps) {
  const q = questions[current]
  const progPct = Math.round((current / questions.length) * 100)
  const diff = DIFFICULTIES.find(d => d.value === difficulty)!

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', position: 'relative' }}>
      <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.07) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '60px', left: '-100px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(8,36,101,0.05) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Üst Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <img src='/pratium-logo-new.svg' alt='Pratium' style={{ height: '32px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '99px', background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`, fontWeight: 600 }}>{diff.label}</span>
            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{answers.filter(a => a.correct).length}/{answers.length || current} doğru</span>
          </div>
        </div>

        {/* İlerleme */}
        <div className="progress-bar" style={{ marginBottom: '1.5rem' }}>
          <div className="progress-fill" style={{ width: `${progPct}%` }} />
        </div>

        <div className="card anim-up">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 500 }}>Soru {current + 1} / {questions.length}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {q.qtype === 'svg' && q.svg && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid rgba(91,76,245,0.2)' }}>📊 Görsel</span>}
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>🌐 {currentLang}</span>
            </div>
          </div>

          {q.qtype === 'svg' && q.svg && (
            <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div dangerouslySetInnerHTML={{ __html: q.svg }} style={{ width: '100%' }} />
            </div>
          )}

          {q.type && q.type !== 'multiple_choice' && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: 'rgba(8,36,101,0.08)', color: 'var(--primary)', fontWeight: 700, border: '1px solid rgba(8,36,101,0.15)' }}>
                {({'fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ Doğru / Yanlış','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap','multi_true_false':'📋✓✗ Çoklu D/Y — Maarif','table_fill':'🗂️ Tablo Doldurma — Maarif'} as Record<string,string>)[q.type]}
              </span>
            </div>
          )}

          <p style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.55, marginBottom: '1.5rem' }}>
            {q.q.split(/(\[[^\]]+\])/).map((part: string, idx: number) =>
              part.startsWith('[') && part.endsWith(']')
                ? <span key={idx} style={{ textDecoration: 'underline', textDecorationStyle: 'double' as const, textDecorationColor: '#6366f1', fontWeight: 700 }}>{part.slice(1, -1)}</span>
                : <span key={idx}>{part}</span>
            )}
          </p>

          {/* ── 1. ÇOKTAN SEÇMELİ ── */}
          {(!q.type || q.type === 'multiple_choice') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(q.opts || []).map((opt, i) => {
                let bg = 'var(--bg2)', border = '1px solid var(--border)', color = 'var(--text)'
                if (chosen !== null) {
                  if (i === q.ans) { bg = 'rgba(22,163,74,0.1)'; border = '1.5px solid rgba(22,163,74,0.5)'; color = '#15803d' }
                  else if (i === chosen) { bg = 'rgba(220,38,38,0.08)'; border = '1.5px solid rgba(220,38,38,0.4)'; color = '#dc2626' }
                }
                return (
                  <button key={i} onClick={() => onSelectAnswer(i)} disabled={chosen !== null}
                    style={{ textAlign: 'left', padding: '12px 15px', borderRadius: '10px', border, background: bg, color, fontSize: '14px', cursor: chosen !== null ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s', width: '100%' }}>
                    <span style={{ fontWeight: 700, marginRight: '8px', opacity: 0.5 }}>{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── 2. DOĞRU / YANLIŞ ── */}
          {q.type === 'true_false' && (
            <div style={{ display: 'flex', gap: '12px' }}>
              {[{label: '✓ Doğru', val: 0}, {label: '✗ Yanlış', val: 1}].map(opt => {
                const isChosen = chosen === opt.val
                const isCorrect = opt.val === q.ans
                const showResult = chosen !== null
                return (
                  <button key={opt.val} onClick={() => onSelectAnswer(opt.val)} disabled={chosen !== null}
                    style={{ flex: 1, padding: '18px', borderRadius: '12px', fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-sans)',
                      border: `1.5px solid ${showResult && isCorrect ? 'rgba(22,163,74,0.5)' : showResult && isChosen && !isCorrect ? 'rgba(220,38,38,0.4)' : 'var(--border)'}`,
                      background: showResult && isCorrect ? 'rgba(22,163,74,0.1)' : showResult && isChosen && !isCorrect ? 'rgba(220,38,38,0.08)' : 'var(--bg2)',
                      color: showResult && isCorrect ? '#15803d' : showResult && isChosen && !isCorrect ? '#dc2626' : 'var(--text2)',
                      cursor: chosen !== null ? 'default' : 'pointer' }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── 3. BOŞLUK DOLDURMA ── */}
          {q.type === 'fill_blank' && (
            <div>
              <input value={fillInput} onChange={e => setFillInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && chosen === null && onFillSubmit()}
                disabled={chosen !== null} placeholder="Cevabınızı yazın..."
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${chosen !== null ? (answers[answers.length-1]?.correct ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: chosen !== null ? (answers[answers.length-1]?.correct ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)') : 'var(--bg2)', fontSize: '14px', fontFamily: 'var(--font-sans)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' as const }} />
              {chosen === null && (
                <button className="btn btn-primary" onClick={onFillSubmit} disabled={!fillInput.trim() || checkingAnswer} style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                  Cevapla ✓
                </button>
              )}
              {chosen !== null && (
                <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600, color: answers[answers.length-1]?.correct ? '#15803d' : '#dc2626' }}>
                  {answers[answers.length-1]?.correct ? '✓ Doğru!' : `Doğru cevap: "${q.blank || q.opts?.[q.ans]}"`}
                </div>
              )}
            </div>
          )}

          {/* ── 4. KISA CEVAP ── */}
          {q.type === 'short_answer' && (
            <div>
              <textarea value={shortInput} onChange={e => setShortInput(e.target.value)} disabled={chosen !== null}
                placeholder="Cevabınızı yazın..." rows={3}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', fontSize: '14px', fontFamily: 'var(--font-sans)', color: 'var(--text)', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
              {chosen === null && (
                <button className="btn btn-primary" onClick={onFillSubmit} disabled={!shortInput.trim() || checkingAnswer} style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                  Gönder ✓
                </button>
              )}
              {chosen !== null && (
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '13px' }}>
                  <strong style={{ color: 'var(--primary)' }}>Örnek cevap:</strong> {q.opts?.[q.ans] || q.blank}
                </div>
              )}
            </div>
          )}

          {/* ── 5. EŞLEŞTİRME ── */}
          {q.type === 'matching' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>Kavram</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>Tanım</div>
                {(q.pairs || []).map((pair: any, i: number) => {
                  const userShuffledIdx = matchAnswer[i]
                  const isAnswered = chosen !== null && userShuffledIdx !== undefined
                  const isCorrect = isAnswered && shuffledIndexMap[userShuffledIdx] === i
                  return (
                    <Fragment key={i}>
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(8,36,101,0.06)', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                        {pair.left}
                      </div>
                      <select value={userShuffledIdx ?? ''}
                        onChange={e => setMatchAnswer(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                        disabled={chosen !== null}
                        style={{ padding: '10px 12px', borderRadius: '8px', border: `1.5px solid ${isAnswered ? (isCorrect ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: isAnswered ? (isCorrect ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)') : 'var(--bg2)', fontSize: '13px', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                        <option value="">Seç...</option>
                        {shuffledPairs.map((right: string, j: number) => (
                          <option key={j} value={j}>{right}</option>
                        ))}
                      </select>
                    </Fragment>
                  )
                })}
              </div>
              {chosen === null && (
                <button className="btn btn-primary"
                  onClick={() => { const allMatched = q.pairs?.every((_: any, i: number) => matchAnswer[i] !== undefined); if (!allMatched) return; const correct = q.pairs?.every((_: any, i: number) => shuffledIndexMap[matchAnswer[i]] === i) ?? false; onSelectAnswer(correct ? 0 : -1) }}
                  disabled={Object.keys(matchAnswer).length < (q.pairs || []).length}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  Eşleştir 🔗
                </button>
              )}
              {chosen !== null && (
                <div style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '13px' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '6px' }}>Doğru eşleşmeler:</strong>
                  {(q.pairs || []).map((p: any, i: number) => (
                    <div key={i} style={{ marginTop: '3px', color: 'var(--text2)' }}>• {p.left} → {p.right}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 6. SIRALAMA ── */}
          {q.type === 'ordering' && (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '10px' }}>Öğeleri doğru sıraya diz:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {orderAnswer.map((item, i) => {
                  const isCorrect = chosen !== null && (q.correctOrder || []).indexOf(q.items?.indexOf(item) ?? i) === i
                  return (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${chosen !== null ? (isCorrect ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)') : 'var(--border)'}`, background: chosen !== null ? (isCorrect ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)') : 'var(--bg2)', fontSize: '13px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text4)', fontSize: '12px', width: '20px' }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{item}</span>
                      {chosen === null && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button onClick={() => { if (i === 0) return; const a = [...orderAnswer]; [a[i-1], a[i]] = [a[i], a[i-1]]; setOrderAnswer(a) }} disabled={i === 0} style={{ background: 'rgba(8,36,101,0.08)', border: '1px solid rgba(8,36,101,0.15)', borderRadius: '6px', cursor: 'pointer', color: '#082465', fontSize: '20px', padding: '4px 10px', opacity: i === 0 ? 0.3 : 1, lineHeight: 1 }}>▲</button>
                          <button onClick={() => { if (i >= orderAnswer.length-1) return; const a = [...orderAnswer]; [a[i], a[i+1]] = [a[i+1], a[i]]; setOrderAnswer(a) }} disabled={i >= orderAnswer.length-1} style={{ background: 'rgba(8,36,101,0.08)', border: '1px solid rgba(8,36,101,0.15)', borderRadius: '6px', cursor: 'pointer', color: '#082465', fontSize: '20px', padding: '4px 10px', opacity: i >= orderAnswer.length-1 ? 0.3 : 1, lineHeight: 1 }}>▼</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {chosen === null && (
                <button className="btn btn-primary"
                  onClick={() => { const correct = orderAnswer.every((v, i) => (q.items?.indexOf(v) ?? i) === (q.correctOrder?.[i] ?? i)); onSelectAnswer(correct ? 0 : -1) }}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                  Sıralamayı Onayla 📋
                </button>
              )}
            </div>
          )}

          {/* ── 7. ÇOKLU D/Y ── */}
          {q.type === 'multi_true_false' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(q.statements || []).map((s: any, i: number) => {
                  const isAnswered = chosen !== null
                  const isCorrect = multiTFAnswer[i] === s.correct
                  return (
                    <div key={i} style={{ padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${isAnswered ? (isCorrect ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)') : 'var(--border)'}`, background: isAnswered ? (isCorrect ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)') : 'var(--bg2)' }}>
                      <div style={{ fontSize: '13px', marginBottom: '8px' }}>{i + 1}. {s.text}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {[true, false].map(val => (
                          <button key={String(val)} onClick={() => { if (chosen !== null) return; setMultiTFAnswer(prev => ({ ...prev, [i]: val })) }}
                            disabled={chosen !== null}
                            style={{ padding: '5px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: chosen !== null ? 'default' : 'pointer', border: `1.5px solid ${multiTFAnswer[i] === val ? (val ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: multiTFAnswer[i] === val ? (val ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)') : 'var(--bg3)', color: multiTFAnswer[i] === val ? (val ? '#15803d' : '#dc2626') : 'var(--text2)' }}>
                            {val ? '✓ Doğru' : '✗ Yanlış'}
                          </button>
                        ))}
                        {isAnswered && <span style={{ fontSize: '12px', fontWeight: 600, color: isCorrect ? '#15803d' : '#dc2626' }}>{isCorrect ? '✓' : `✗ (${s.correct ? 'Doğru' : 'Yanlış'})`}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {chosen === null && (
                <button className="btn btn-primary"
                  onClick={() => { const correct = (q.statements || []).every((s: any, i: number) => multiTFAnswer[i] === s.correct); onSelectAnswer(correct ? 0 : -1) }}
                  disabled={(q.statements || []).some((_: any, i: number) => multiTFAnswer[i] === undefined || multiTFAnswer[i] === null)}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                  Onayla ✓
                </button>
              )}
            </div>
          )}

          {/* ── 8. TABLO DOLDURMA ── */}
          {q.type === 'table_fill' && (() => {
            const td = q.tableData
            const tableAnswers = q.tableAnswers || []
            let blankIdx = 0
            function tableCellCorrect(userInput: string, correctAns: string): boolean {
              const u = userInput.toLowerCase().trim()
              const c = correctAns.toLowerCase().trim()
              if (!u) return false
              if (u === c) return true
              if (c.includes(u) || u.includes(c)) return true
              const cWords = c.split(/\s+/).filter((w: string) => w.length > 2)
              const uWords = u.split(/\s+/).filter((w: string) => w.length > 2)
              return cWords.some((cw: string) => uWords.some((uw: string) => cw === uw || cw.startsWith(uw) || uw.startsWith(cw)))
            }
            return (
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '10px' }}>Boş hücreleri doldur:</p>
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr>{td?.headers?.map((h: string, i: number) => (
                        <th key={i} style={{ padding: '10px 12px', background: 'rgba(8,36,101,0.06)', border: '1px solid var(--border)', fontWeight: 700, color: 'var(--primary)', textAlign: 'left' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {td?.rows?.map((row: any, ri: number) => (
                        <tr key={ri}>
                          {row.cells.map((cell: string, ci: number) => {
                            const isBlank = row.blanks?.includes(ci)
                            if (isBlank) {
                              const idx = blankIdx++
                              const isCorrectAns = chosen !== null && tableCellCorrect(tableFillAnswer[idx] || '', tableAnswers[idx] || '')
                              return (
                                <td key={ci} style={{ padding: '8px', border: '1px solid var(--border)', background: chosen !== null ? (isCorrectAns ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)') : 'var(--bg3)' }}>
                                  {chosen !== null ? (
                                    <span style={{ fontWeight: 600, color: isCorrectAns ? '#15803d' : '#dc2626' }}>
                                      {tableFillAnswer[idx] || '—'} {!isCorrectAns && <span style={{ fontSize: '11px' }}>→ {tableAnswers[idx]}</span>}
                                    </span>
                                  ) : (
                                    <input value={tableFillAnswer[idx] || ''} onChange={e => { const n = [...tableFillAnswer]; n[idx] = e.target.value; setTableFillAnswer(() => n) }}
                                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '12px', fontFamily: 'var(--font-sans)', width: '100%', boxSizing: 'border-box' as const }} />
                                  )}
                                </td>
                              )
                            }
                            return <td key={ci} style={{ padding: '10px 12px', border: '1px solid var(--border)', color: 'var(--text2)' }}>{cell}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {chosen === null && (
                  <button className="btn btn-primary"
                    onClick={() => { const allCorrect = tableAnswers.every((ans: string, i: number) => tableCellCorrect(tableFillAnswer[i] || '', ans)); onSelectAnswer(allCorrect ? 0 : -1) }}
                    disabled={tableFillAnswer.some(t => !t?.trim())}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                    Tabloyu Gönder 🗂️
                  </button>
                )}
              </div>
            )
          })()}

          {/* Açıklama + Sonraki */}
          {chosen !== null && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', borderLeft: `4px solid ${chosen === q.ans ? '#16a34a' : '#dc2626'}`, fontSize: '14px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '1rem' }}>
                <strong style={{ color: chosen === q.ans ? '#16a34a' : '#dc2626', display: 'block', marginBottom: '4px' }}>
                  {chosen === q.ans ? '✓ Doğru!' : '✗ Yanlış'}
                </strong>
                {q.exp}
              </div>
              <button className="btn btn-primary" onClick={onNext} disabled={checkingAnswer} style={{ width: '100%', justifyContent: 'center' }}>
                {current + 1 < questions.length ? 'Sonraki Soru →' : 'Sonuçları Gör 🎯'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
