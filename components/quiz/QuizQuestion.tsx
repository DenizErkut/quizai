'use client'
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
  orderAnswer: number[]
  matchAnswer: Record<number, number>
  multiTFAnswer: Record<number, boolean | null>
  tableFillAnswer: string[]
  onSelectAnswer: (idx: number) => void
  onFillSubmit: () => void
  onNext: () => void
  setFillInput: (v: string) => void
  setShortInput: (v: string) => void
  setOrderAnswer: (v: number[]) => void
  setMatchAnswer: (fn: (prev: Record<number, number>) => Record<number, number>) => void
  setMultiTFAnswer: (fn: (prev: Record<number, boolean | null>) => Record<number, boolean | null>) => void
  setTableFillAnswer: (fn: (prev: string[]) => string[]) => void
  onFinish: () => void
}

export default function QuizQuestion({
  questions, current, answers, difficulty, currentLang,
  checkingAnswer, fillInput, shortInput, chosen, orderAnswer,
  matchAnswer, multiTFAnswer, tableFillAnswer,
  onSelectAnswer, onFillSubmit, onNext, setFillInput, setShortInput,
  setOrderAnswer, setMatchAnswer, setMultiTFAnswer, setTableFillAnswer,
  onFinish,
}: QuizQuestionProps) {
  const q = questions[current]
  const progPct = Math.round((current / questions.length) * 100)
  const diff = DIFFICULTIES.find(d => d.value === difficulty)!

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', background: 'linear-gradient(160deg, #f0f9ff 0%, #ffffff 40%, #fff8e8 100%)' }}>
        <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.07) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', bottom: '60px', left: '-100px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(8,36,101,0.05) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <img src='/pratium-logo-new.svg' alt='Pratium' style={{ height: '32px' }} />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '99px', background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`, fontWeight: 600 }}>{diff.label}</span>
              <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{answers.filter(a => a.correct).length}/{answers.length || current} doğru</span>
            </div>
          </div>
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
            {/* Soru tipi badge */}
            {q.type && q.type !== 'multiple_choice' && (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: 'rgba(8,36,101,0.08)', color: 'var(--primary)', fontWeight: 700, border: '1px solid rgba(8,36,101,0.15)' }}>
                  {({'fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ Doğru / Yanlış','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap','multi_true_false':'📋✓✗ Çoklu D/Y — Maarif','table_fill':'🗂️ Tablo Doldurma — Maarif'} as Record<string,string>)[q.type]}
                </span>
              </div>
            )}

            <p style={{ fontSize: '17px', fontWeight: 500, lineHeight: 1.55, marginBottom: '1.5rem' }}>{q.q}</p>

            {/* ── ÇOKTAN SEÇMELİ (default) ── */}
            {(!q.type || q.type === 'multiple_choice') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(q.opts || []).map((opt, i) => {
                  let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--text)'
                  if (chosen !== null) {
                    if (i === q.ans) { bg = 'var(--green-bg)'; border = 'rgba(22,163,74,0.35)'; color = 'var(--green)' }
                    else if (i === chosen) { bg = 'var(--red-bg)'; border = 'rgba(220,38,38,0.35)'; color = 'var(--red)' }
                  }
                  return (
                    <button key={i} onClick={() => onSelectAnswer(i)} disabled={chosen !== null}
                      style={{ textAlign: 'left', padding: '12px 15px', borderRadius: '10px', border: `1.5px solid ${border}`, background: bg, color, fontSize: '14px', lineHeight: 1.45, cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}>
                      <span style={{ fontWeight: 700, marginRight: '8px', opacity: 0.5 }}>{String.fromCharCode(65 + i)}.</span>{opt}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── DOĞRU / YANLIŞ ── */}
            {q.type === 'true_false' && (
              <div style={{ display: 'flex', gap: '12px' }}>
                {[{label: '✓ Doğru', val: 0, c: 'var(--green)', bg: 'var(--green-bg)'}, {label: '✗ Yanlış', val: 1, c: 'var(--red)', bg: 'var(--red-bg)'}].map(opt => {
                  const isChosen = chosen === opt.val
                  const isCorrect = opt.val === q.ans
                  const showResult = chosen !== null
                  return (
                    <button key={opt.val} onClick={() => onSelectAnswer(opt.val)} disabled={chosen !== null}
                      style={{ flex: 1, padding: '18px', borderRadius: '12px', fontSize: '18px', fontWeight: 700,
                        border: `2px solid ${showResult && isCorrect ? 'rgba(22,163,74,0.5)' : showResult && isChosen && !isCorrect ? 'rgba(220,38,38,0.5)' : 'var(--border)'}`,
                        background: showResult && isCorrect ? 'var(--green-bg)' : showResult && isChosen && !isCorrect ? 'var(--red-bg)' : 'var(--bg2)',
                        color: showResult && isCorrect ? 'var(--green)' : showResult && isChosen && !isCorrect ? 'var(--red)' : 'var(--text2)',
                        cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-sans)' }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── BOŞLUK DOLDURMA ── */}
            {q.type === 'fill_blank' && (
              <div>
                <input value={fillInput} onChange={e => setFillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && chosen === null && onFillSubmit()}
                  disabled={chosen !== null}
                  placeholder="Cevabınızı yazın..."
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', fontSize: '16px', fontFamily: 'var(--font-sans)', border: `2px solid ${chosen !== null ? (answers[answers.length-1]?.correct ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: chosen !== null ? (answers[answers.length-1]?.correct ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }} />
                {chosen === null && (
                  <button className="btn btn-primary" onClick={onFillSubmit} disabled={!fillInput.trim() || checkingAnswer}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
                    Cevapla →
                  </button>
                )}
                {chosen !== null && (
                  <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600, color: answers[answers.length-1]?.correct ? 'var(--green)' : 'var(--red)' }}>
                    {answers[answers.length-1]?.correct ? '✓ Doğru!' : `✗ Doğru cevap: "${q.blank || q.opts?.[q.ans]}"`}
                  </div>
                )}
              </div>
            )}

            {/* ── KISA CEVAP ── */}
            {q.type === 'short_answer' && (
              <div>
                <textarea value={shortInput} onChange={e => setShortInput(e.target.value)}
                  disabled={chosen !== null}
                  placeholder="Cevabınızı buraya yazın..."
                  rows={3}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontFamily: 'var(--font-sans)', border: '2px solid var(--border)', background: 'var(--bg2)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', color: 'var(--text)' }} />
                {chosen === null && (
                  <button className="btn btn-primary" onClick={onFillSubmit} disabled={!shortInput.trim() || checkingAnswer}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
                    Gönder →
                  </button>
                )}
                {chosen !== null && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text3)' }}>
                    <strong style={{ color: 'var(--primary)' }}>Örnek cevap:</strong> {q.opts?.[q.ans] || q.blank}
                  </div>
                )}
              </div>
            )}

            {/* ── EŞLEŞTİRME ── */}
            {q.type === 'matching' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '4px' }}>Kavram</div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '4px' }}>Tanım</div>
                  {(q.pairs || []).map((pair: any, i: number) => {
                    // matchSelections[i] = kullanıcının seçtiği shuffledPairs index'i
                    // Doğru cevap: shuffledIndexMap[seçilen] === i (orijinal index eşleşmeli)
                    const userShuffledIdx = matchSelections[i]
                    const isAnswered = chosen !== null && userShuffledIdx !== undefined
                    const isCorrect = isAnswered && shuffledIndexMap[userShuffledIdx] === i
                    return (
                      <>
                        <div key={`l${i}`} style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(8,36,101,0.06)', border: '1px solid rgba(8,36,101,0.1)', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
                          {pair.left}
                        </div>
                        <select key={`r${i}`}
                          value={userShuffledIdx ?? ''}
                          onChange={e => setMatchSelections(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                          disabled={chosen !== null}
                          style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${isAnswered ? (isCorrect ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)') : 'var(--border)'}`, background: isAnswered ? (isCorrect ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
                          <option value="">Seç...</option>
                          {shuffledPairs.map((right: string, j: number) => (
                            <option key={j} value={j}>{right}</option>
                          ))}
                        </select>
                      </>
                    )
                  })}
                </div>
                {chosen === null && (
                  <button className="btn btn-primary" onClick={() => { const allMatched = q.pairs?.every((_: any, i: number) => matchAnswer[i] !== undefined); if (!allMatched) return; const correct = q.pairs?.every((_: any, i: number) => matchAnswer[i] === i) ?? false; onSelectAnswer(correct ? 0 : -1) }}
                    disabled={Object.keys(matchSelections).length < (q.pairs || []).length}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    Eşleştir →
                  </button>
                )}
                {chosen !== null && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text3)' }}>
                    <strong style={{ color: 'var(--primary)' }}>Doğru eşleşmeler:</strong>
                    {(q.pairs || []).map((p: any, i: number) => (
                      <div key={i} style={{ marginTop: '4px' }}>{p.left} → {p.right}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SIRALAMA ── */}
            {q.type === 'ordering' && (
              <div>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Öğeleri sürükleyerek doğru sıraya koy:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {orderAnswer.map((item, i) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${chosen !== null ? ((q.correctOrder || []).indexOf(q.items?.indexOf(item) ?? i) === i ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)') : 'var(--border)'}`, background: chosen !== null ? ((q.correctOrder || []).indexOf(q.items?.indexOf(item) ?? i) === i ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontSize: '13px', cursor: chosen !== null ? 'default' : 'grab' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text4)', fontSize: '12px', width: '20px' }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{item}</span>
                      {chosen === null && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button onClick={() => { if (i === 0) return; const a = [...orderAnswer]; [a[i-1], a[i]] = [a[i], a[i-1]]; setOrderAnswer(a) }} disabled={i === 0} style={{ background: 'rgba(8,36,101,0.08)', border: '1px solid rgba(8,36,101,0.15)', borderRadius: '6px', cursor: 'pointer', color: '#082465', fontSize: '20px', padding: '4px 10px', opacity: i === 0 ? 0.3 : 1, lineHeight: 1 }}>▲</button>
                          <button onClick={() => { if (i >= orderAnswer.length-1) return; const a = [...orderAnswer]; [a[i], a[i+1]] = [a[i+1], a[i]]; setOrderAnswer(a) }} disabled={i === orderAnswer.length-1} style={{ background: 'rgba(8,36,101,0.08)', border: '1px solid rgba(8,36,101,0.15)', borderRadius: '6px', cursor: 'pointer', color: '#082465', fontSize: '20px', padding: '4px 10px', opacity: i === orderAnswer.length-1 ? 0.3 : 1, lineHeight: 1 }}>▼</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {chosen === null && (
                  <button className="btn btn-primary" onClick={() => { const correct = orderAnswer.every((v, i) => v === q.correctOrder?.[i]); onSelectAnswer(correct ? 0 : -1) }}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                    Sıralamayı onayla →
                  </button>
                )}
              </div>
            )}

            {/* ── ÇOKLU D/Y (Maarif Modeli) ── */}
            {q.type === 'multi_true_false' && (
              <div>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Her ifade için Doğru veya Yanlış'ı seç:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(q.statements || []).map((s: any, i: number) => {
                    const isAnswered = chosen !== null
                    const isCorrect = s.correct === true
                    return (
                      <div key={i} style={{ padding: '12px 14px', borderRadius: '10px', border: `1.5px solid ${isAnswered ? (mTFAnswers[i] === s.correct ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.3)') : 'var(--border)'}`, background: isAnswered ? (mTFAnswers[i] === s.correct ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)' }}>
                        <div style={{ fontSize: '13px', marginBottom: '8px' }}>{i + 1}. {s.text}</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {[true, false].map(val => (
                            <button key={String(val)} onClick={() => { if (chosen !== null) return; setMTFAnswers(prev => ({ ...prev, [i]: val })) }}
                              disabled={chosen !== null}
                              style={{ padding: '6px 16px', borderRadius: '8px', border: `1.5px solid ${mTFAnswers[i] === val ? (val ? 'rgba(22,163,74,0.6)' : 'rgba(220,38,38,0.6)') : 'var(--border)'}`, background: mTFAnswers[i] === val ? (val ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontWeight: 600, fontSize: '12px', cursor: chosen !== null ? 'default' : 'pointer', color: mTFAnswers[i] === val ? (val ? 'var(--green)' : 'var(--red)') : 'var(--text2)' }}>
                              {val ? '✓ Doğru' : '✗ Yanlış'}
                            </button>
                          ))}
                          {isAnswered && <span style={{ fontSize: '12px', fontWeight: 600, color: mTFAnswers[i] === s.correct ? 'var(--green)' : 'var(--red)', marginLeft: '4px' }}>{mTFAnswers[i] === s.correct ? '✓' : `✗ (${isCorrect ? 'Doğru' : 'Yanlış'})`}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {chosen === null && (
                  <button className="btn btn-primary"
                    onClick={() => {
                      const stmts = q.statements || []
                      const correct = stmts.every((s: any, i: number) => mTFAnswers[i] === s.correct)
                      onSelectAnswer(correct ? 0 : -1)
                      setAnswers(prev => {
                        const next = [...prev, { userAns: correct ? 0 : -1, correct }]
                        answersRef.current = next
                        return next
                      })
                    }}
                    disabled={(q.statements || []).some((_: any, i: number) => mTFAnswers[i] === undefined || mTFAnswers[i] === null)}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                    Cevapları onayla →
                  </button>
                )}
              </div>
            )}

            {/* ── TABLO DOLDURMA (Maarif Modeli) ── */}
            {q.type === 'table_fill' && (() => {
              const td = q.tableData
              const tableAnswers = q.tableAnswers || []
              let blankIdx = 0
              function tableCellCorrect(userInput: string, correctAns: string): boolean {
                const u = userInput.toLowerCase().trim()
                const c = correctAns.toLowerCase().trim()
                if (!u) return false
                if (u === c) return true
                // İçerme kontrolü — "enerji" yazdıysa "enerji üretimi" doğru sayılsın
                if (c.includes(u) || u.includes(c)) return true
                // Kelime bazlı — en az bir önemli kelime eşleşirse
                const cWords = c.split(/\s+/).filter(w => w.length > 2)
                const uWords = u.split(/\s+/).filter(w => w.length > 2)
                return cWords.some(cw => uWords.some(uw => cw === uw || cw.startsWith(uw) || uw.startsWith(cw)))
              }
              function submitTable() {
                const allCorrect = tableAnswers.every((ans: string, i: number) => tableCellCorrect(tableFillAnswer[i] || '', ans))
                onSelectAnswer(allCorrect ? 0 : -1)
                setAnswers(prev => {
                  const next = [...prev, { userAns: allCorrect ? 0 : -1, correct: allCorrect }]
                  answersRef.current = next
                  return next
                })
              }
              return (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Boş hücreleri doldurun:</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          {td?.headers?.map((h: string, i: number) => (
                            <th key={i} style={{ padding: '8px 12px', background: 'rgba(8,36,101,0.08)', border: '1px solid var(--border)', fontWeight: 700, color: 'var(--primary)', textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
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
                                  <td key={ci} style={{ padding: '6px 8px', border: '1px solid var(--border)', background: chosen !== null ? (isCorrectAns ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)' }}>
                                    {chosen !== null ? (
                                      <span style={{ fontWeight: 600, color: isCorrectAns ? 'var(--green)' : 'var(--red)' }}>
                                        {tableFillAnswer[idx] || '—'} {!isCorrectAns && <span style={{ fontSize: '11px' }}>→ {tableAnswers[idx]}</span>}
                                      </span>
                                    ) : (
                                      <input value={tableFillAnswer[idx] || ''} onChange={e => { const n = [...tableFillAnswer]; n[idx] = e.target.value; setTableFillAnswer(() => n) }}
                                        style={{ width: '100%', padding: '4px 8px', border: '1.5px solid var(--accent)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--font-sans)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
                                    )}
                                  </td>
                                )
                              }
                              return <td key={ci} style={{ padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--bg2)' }}>{cell}</td>
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {chosen === null && (
                    <button className="btn btn-primary" onClick={submitTableFn} disabled={tableFillAnswer.some(t => !t?.trim())}
                      style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }}>
                      Tabloyu onayla →
                    </button>
                  )}
                </div>
              )
            })()}

            {chosen !== null && (
              <>
                <div style={{ marginTop: '1rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg2)', borderLeft: '3px solid var(--accent)', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.65 }}>
                  <strong style={{ color: chosen === q.ans ? 'var(--green)' : 'var(--red)' }}>{chosen === q.ans ? 'Doğru! ' : 'Yanlış. '}</strong>{q.exp}
                </div>
                <button className="btn btn-primary" onClick={onNext} disabled={checkingAnswer || isSavingRef.current} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                  {current + 1 < questions.length ? 'Sonraki soru →' : (isSavingRef.current ? 'Kaydediliyor...' : 'Sonuçları gör →')}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    )
}
