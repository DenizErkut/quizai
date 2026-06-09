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
  shuffledPairs, shuffledIndexMap,
}: QuizQuestionProps) {
  const q = questions[current]
  const progPct = Math.round((current / questions.length) * 100)
  const diff = DIFFICULTIES.find(d => d.value === difficulty)!

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem', paddingBottom: '5rem', position: 'relative' }}>
      <div style={{ position: 'fixed', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, var(--accent-bg) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '60px', left: '-100px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, var(--primary-bg) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Üst Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <img src='/pratium-logo-new.svg' alt='Pratium' style={{ height: '32px' }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-neon-glow" style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.border}` }}>{diff.label}</span>
            <span className="streak-badge">🔥 {answers.filter(a => a.correct).length}/{answers.length || current} Doğru</span>
          </div>
        </div>

        {/* XP İlerleme Çubuğu */}
        <div className="xp-progress-container" style={{ marginBottom: '2rem' }}>
          <div className="xp-progress-bar" style={{ width: `${progPct}%` }} />
        </div>

        <div className="bento-card anim-pop">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Soru {current + 1} / {questions.length}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {q.qtype === 'svg' && q.svg && <span className="badge badge-neon-glow">📊 Görsel</span>}
              <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>🌐 {currentLang}</span>
            </div>
          </div>

          {q.qtype === 'svg' && q.svg && (
            <div style={{ marginBottom: '1.25rem', padding: '1rem', borderRadius: 'var(--radius)', background: 'var(--bg3)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div dangerouslySetInnerHTML={{ __html: q.svg }} style={{ width: '100%' }} />
            </div>
          )}

          {q.type && q.type !== 'multiple_choice' && (
            <div style={{ marginBottom: '12px' }}>
              <span className="badge badge-neon-glow" style={{ background: 'var(--primary-bg)', color: 'var(--primary)' }}>
                {({'fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ Doğru / Yanlış','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap','multi_true_false':'📋✓✗ Çoklu D/Y — Maarif','table_fill':'🗂️ Tablo Doldurma — Maarif'} as Record<string,string>)[q.type]}
              </span>
            </div>
          )}

          <p style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.6, marginBottom: '2rem', color: 'var(--text)' }}>{q.q}</p>

          {/* ── 1. ÇOKTAN SEÇMELİ ── */}
          {(!q.type || q.type === 'multiple_choice') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(q.opts || []).map((opt, i) => {
                let bg = 'var(--bg3)', border = 'var(--border)', color = 'var(--text)'
                if (chosen !== null) {
                  if (i === q.ans) { bg = 'var(--green-bg)'; border = 'var(--green)'; color = 'var(--green)' }
                  else if (i === chosen) { bg = 'var(--red-bg)'; border = 'var(--red)'; color = 'var(--red)' }
                }
                return (
                  <button key={i} onClick={() => onSelectAnswer(i)} disabled={chosen !== null} className="btn"
                    style={{ textAlign: 'left', width: '100%', padding: '14px 18px', borderRadius: 'var(--radius)', border: `2px solid ${border}`, background: bg, color, fontSize: '14px', cursor: chosen !== null ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                    <span style={{ fontWeight: 800, marginRight: '8px', opacity: 0.6 }}>{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── 2. DOĞRU / YANLIŞ ── */}
          {q.type === 'true_false' && (
            <div style={{ display: 'flex', gap: '16px' }}>
              {[{label: '✓ Doğru', val: 0}, {label: '✗ Yanlış', val: 1}].map(opt => {
                const isChosen = chosen === opt.val
                const isCorrect = opt.val === q.ans
                const showResult = chosen !== null
                return (
                  <button key={opt.val} onClick={() => onSelectAnswer(opt.val)} disabled={chosen !== null} className="btn"
                    style={{ flex: 1, padding: '20px', borderRadius: 'var(--radius)', fontSize: '16px', fontWeight: 800,
                      border: `2px solid ${showResult && isCorrect ? 'var(--green)' : showResult && isChosen && !isCorrect ? 'var(--red)' : 'var(--border)'}`,
                      background: showResult && isCorrect ? 'var(--green-bg)' : showResult && isChosen && !isCorrect ? 'var(--red-bg)' : 'var(--bg3)',
                      color: showResult && isCorrect ? 'var(--green)' : showResult && isChosen && !isCorrect ? 'var(--red)' : 'var(--text2)',
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
                disabled={chosen !== null} className="input" placeholder="Cevabınızı buraya uçurun..."
                style={{ border: `2px solid ${chosen !== null ? (answers[answers.length-1]?.correct ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, background: chosen !== null ? (answers[answers.length-1]?.correct ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)' }} />
              {chosen === null && (
                <button className="btn btn-primary" onClick={onFillSubmit} disabled={!fillInput.trim() || checkingAnswer} style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}>
                  Kilitle ve Gönder 🚀
                </button>
              )}
              {chosen !== null && (
                <div style={{ marginTop: '12px', fontSize: '14px', fontWeight: 700, color: answers[answers.length-1]?.correct ? 'var(--green)' : 'var(--red)' }}>
                  {answers[answers.length-1]?.correct ? '🎉 Kusursuz! Doğru cevap.' : `💡 Doğru cevap: "${q.blank || q.opts?.[q.ans]}"`}
                </div>
              )}
            </div>
          )}

          {/* ── 4. KISA CEVAP ── */}
          {q.type === 'short_answer' && (
            <div>
              <textarea value={shortInput} onChange={e => setShortInput(e.target.value)} disabled={chosen !== null} className="input" placeholder="Düşüncelerini buraya dök..." rows={3} />
              {chosen === null && (
                <button className="btn btn-primary" onClick={onFillSubmit} disabled={!shortInput.trim() || checkingAnswer} style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}>
                  Fikrimi Gönder 💬
                </button>
              )}
              {chosen !== null && (
                <div className="tldr-card" style={{ marginTop: '14px' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>⚡ Örnek İdeal Cevap:</strong> {q.opts?.[q.ans] || q.blank}
                </div>
              )}
            </div>
          )}

          {/* ── 5. EŞLEŞTİRME ── */}
          {q.type === 'matching' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kavram</div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tanım</div>
                {(q.pairs || []).map((pair: any, i: number) => {
                  const userShuffledIdx = matchAnswer[i]
                  const isAnswered = chosen !== null && userShuffledIdx !== undefined
                  const isCorrect = isAnswered && shuffledIndexMap[userShuffledIdx] === i
                  return (
                    <Fragment key={i}>
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--primary-bg)', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>
                        {pair.left}
                      </div>
                      <select value={userShuffledIdx ?? ''}
                        onChange={e => setMatchAnswer(prev => ({ ...prev, [i]: Number(e.target.value) }))}
                        disabled={chosen !== null} className="input"
                        style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: `2px solid ${isAnswered ? (isCorrect ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, background: isAnswered ? (isCorrect ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)' }}>
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
                  disabled={Object.keys(matchAnswer).length < (q.pairs || []).length} style={{ width: '100%', justifyContent: 'center' }}>
                  Bağlantıları Kur 🔗
                </button>
              )}
              {chosen !== null && (
                <div className="tldr-card" style={{ marginTop: '12px' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '6px' }}>🔑 Doğru Eşleşme Haritası:</strong>
                  {(q.pairs || []).map((p: any, i: number) => (
                    <div key={i} style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text2)' }}>• {p.left} <span style={{color: 'var(--accent)'}}>➔</span> {p.right}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 6. SIRALAMA ── */}
          {q.type === 'ordering' && (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>Öğeleri doğru sıraya koy:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {orderAnswer.map((item, i) => {
                  const isCorrect = chosen !== null && (q.correctOrder || []).indexOf(q.items?.indexOf(item) ?? i) === i
                  return (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: 'var(--radius)', border: `2px solid ${chosen !== null ? (isCorrect ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, background: chosen !== null ? (isCorrect ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)', fontSize: '14px' }}>
                      <span style={{ fontWeight: 800, color: 'var(--text4)', width: '24px' }}>{i + 1}.</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{item}</span>
                      {chosen === null && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => { if (i === 0) return; const a = [...orderAnswer]; [a[i-1], a[i]] = [a[i], a[i-1]]; setOrderAnswer(a) }} disabled={i === 0} className="btn btn-sm" style={{ padding: '4px 8px', borderRadius: '6px' }}>▲</button>
                          <button onClick={() => { if (i >= orderAnswer.length-1) return; const a = [...orderAnswer]; [a[i], a[i+1]] = [a[i+1], a[i]]; setOrderAnswer(a) }} disabled={i >= orderAnswer.length-1} className="btn btn-sm" style={{ padding: '4px 8px', borderRadius: '6px' }}>▼</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {chosen === null && (
                <button className="btn btn-primary"
                  onClick={() => { const correct = orderAnswer.every((v, i) => (q.items?.indexOf(v) ?? i) === (q.correctOrder?.[i] ?? i)); onSelectAnswer(correct ? 0 : -1) }}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}>
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
                    <div key={i} style={{ padding: '14px', borderRadius: 'var(--radius)', border: `2px solid ${isAnswered ? (isCorrect ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, background: isAnswered ? (isCorrect ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)' }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: 'var(--text)' }}>{i + 1}. {s.text}</div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {[true, false].map(val => (
                          <button key={String(val)} onClick={() => { if (chosen !== null) return; setMultiTFAnswer(prev => ({ ...prev, [i]: val })) }}
                            disabled={chosen !== null} className="btn btn-sm"
                            style={{ border: `2px solid ${multiTFAnswer[i] === val ? (val ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`, background: multiTFAnswer[i] === val ? (val ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg2)', fontWeight: 700 }}>
                            {val ? '✓ Doğru' : '✗ Yanlış'}
                          </button>
                        ))}
                        {isAnswered && <span style={{ fontSize: '13px', fontWeight: 700, color: isCorrect ? 'var(--green)' : 'var(--red)', marginLeft: '6px' }}>{isCorrect ? '✓' : `✗ (${s.correct ? 'Doğru' : 'Yanlış'})`}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {chosen === null && (
                <button className="btn btn-primary"
                  onClick={() => { const correct = (q.statements || []).every((s: any, i: number) => multiTFAnswer[i] === s.correct); onSelectAnswer(correct ? 0 : -1) }}
                  disabled={(q.statements || []).some((_: any, i: number) => multiTFAnswer[i] === undefined || multiTFAnswer[i] === null)}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}>
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
                <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>Boş hücreleri doldur:</p>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr>{td?.headers?.map((h: string, i: number) => (
                        <th key={i} style={{ padding: '10px 14px', background: 'var(--primary-bg)', border: '1px solid var(--border)', fontWeight: 700, color: 'var(--primary)', textAlign: 'left' }}>{h}</th>
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
                                <td key={ci} style={{ padding: '8px', border: '1px solid var(--border)', background: chosen !== null ? (isCorrectAns ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg3)' }}>
                                  {chosen !== null ? (
                                    <span style={{ fontWeight: 700, color: isCorrectAns ? 'var(--green)' : 'var(--red)' }}>
                                      {tableFillAnswer[idx] || '—'} {!isCorrectAns && <span style={{ fontSize: '11px', display: 'block', opacity: 0.8 }}>→ {tableAnswers[idx]}</span>}
                                    </span>
                                  ) : (
                                    <input value={tableFillAnswer[idx] || ''} onChange={e => { const n = [...tableFillAnswer]; n[idx] = e.target.value; setTableFillAnswer(() => n) }} className="input"
                                      style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '13px' }} />
                                  )}
                                </td>
                              )
                            }
                            return <td key={ci} style={{ padding: '10px 14px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)' }}>{cell}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {chosen === null && (
                  <button className="btn btn-primary" onClick={() => { const allCorrect = tableAnswers.every((ans: string, i: number) => tableCellCorrect(tableFillAnswer[i] || '', ans)); onSelectAnswer(allCorrect ? 0 : -1) }} disabled={tableFillAnswer.some(t => !t?.trim())} style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}>
                    Tabloyu Gönder 🗂️
                  </button>
                )}
              </div>
            )
          })()}

          {/* Açıklama Kutusu */}
          {chosen !== null && (
            <div className="anim-pop" style={{ marginTop: '1.5rem' }}>
              <div style={{ padding: '14px 16px', borderRadius: 'var(--radius)', background: 'var(--bg3)', borderLeft: `4px solid ${chosen === q.ans ? 'var(--green)' : 'var(--red)'}`, fontSize: '14px', color: 'var(--text2)', lineHeight: 1.65, marginBottom: '1.5rem' }}>
                <strong style={{ color: chosen === q.ans ? 'var(--green)' : 'var(--red)', display: 'block', marginBottom: '4px' }}>
                  {chosen === q.ans ? '🎉 Müthiş! Doğru Cevap' : '👀 Küçük Bir Hata!'}
                </strong>
                {q.exp}
              </div>
              <button className="btn btn-neon" onClick={onNext} disabled={checkingAnswer} style={{ width: '100%', justifyContent: 'center' }}>
                {current + 1 < questions.length ? 'Sonraki Soruya Geç ➔' : 'Sonuçları Gör 🔥'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}