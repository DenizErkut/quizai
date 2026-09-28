'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type EvalOutput = {
  id: string; benchmark_item_id: string; blind_label: string; status: 'completed' | 'error'
  answer_index: number | null; is_correct?: boolean; explanation: string; error_code?: string
  duration_ms: number; input_tokens: number; output_tokens: number; cost_usd: number
  curriculum_alignment_score: number | null; pedagogy_score: number | null
  age_appropriateness_score: number | null; safety_score: number | null; reviewer_notes: string
  reviewed_at?: string | null
  item: { ordinal: number; grade: string; subject: string; objective_code: string; objective_title: string; question_snapshot: { q: string; opts: string[] }; answer_key?: { answerIndex: number } } | null
}

type ScoreKey = 'curriculum_alignment_score' | 'pedagogy_score' | 'age_appropriateness_score' | 'safety_score'
type EvalRun = { id: string; benchmark_version: number; status: 'running' | 'completed' | 'failed'; total_items: number; completed_items: number; created_at: string; completed_at?: string | null }
type EvalSummary = { provider: string; model: string; n: number; unscoredOutputs: number; accuracy: number; meanLatencyMs: number; totalCostUsd: number; curriculumAlignment: number; pedagogy: number; ageAppropriateness: number; safety: number }
type RunnerData = { run: EvalRun | null; results: EvalOutput[]; summary: EvalSummary[] | null; progress?: { completedOutputs: number; ratedOutputs: number; totalOutputs: number; completedItems: number; failedOutputs: number; blinded: boolean }; readiness?: { benchmarkStatus: string; eligibleQuestions: number; target: number; providersConfigured: boolean } }
type Rating = Record<ScoreKey, number> & { reviewerNotes: string }

const RATING_FIELDS: Array<{ key: ScoreKey; label: string }> = [
  { key: 'curriculum_alignment_score', label: 'Kazanım uyumu' },
  { key: 'pedagogy_score', label: 'Pedagojik kalite' },
  { key: 'age_appropriateness_score', label: 'Yaş uygunluğu' },
  { key: 'safety_score', label: 'Güvenlik' },
]

export default function EducationEvalRunner() {
  const [data, setData] = useState<RunnerData | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [ratings, setRatings] = useState<Record<string, Rating>>({})
  const stopRequested = useRef(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/education-eval/run', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Education Eval durumu alınamadı.')
      setData(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const outputs = useMemo(() => data?.results || [], [data?.results])
  const reviewable = useMemo(() => outputs.filter(output => output.status === 'completed'), [outputs])
  const pages = Math.max(1, Math.ceil(reviewable.length / 10))
  const visible = reviewable.slice(page * 10, page * 10 + 10)
  const ready = data?.readiness?.benchmarkStatus === 'active' && data.readiness.eligibleQuestions === 50 && data.readiness.providersConfigured

  async function startOrContinue() {
    setBusy(true); setMessage(''); stopRequested.current = false
    try {
      let run = data?.run
      if (!run || run.status !== 'running') {
        const response = await fetch('/api/admin/education-eval/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Ölçüm başlatılamadı.')
        run = result.run
        setData(current => ({ ...(current || { run: null, results: [], summary: null }), run, readiness: current?.readiness }))
      }
      setMessage('Modeller aynı 50 soruda çalışıyor. İstersen işlemi durdurup daha sonra sürdürebilirsin.')
      while (!stopRequested.current) {
        const response = await fetch('/api/admin/education-eval/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', runId: run.id }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Soru değerlendirmesi tamamlanamadı.')
        setData(current => ({ ...(current || { run: null, results: [], summary: null }), ...result,
          run: result.run || current?.run || run, results: result.results || current?.results || [],
          progress: result.progress || { ...current?.progress, completedItems: result.completedItems,
            completedOutputs: result.completedOutputs, failedOutputs: result.failedOutputs, totalOutputs: 150 } }))
        if (result.done) { setMessage('50 soruluk kör model çalışması tamamlandı. Şimdi çıktıları model adlarını görmeden puanlayın.'); break }
        if (result.hadErrors) { setMessage(`Soru ${result.currentOrdinal} için en az bir sağlayıcı hata verdi. Hatalı çağrılar giderilip “Sürdür / hataları yinele” ile devam edilebilir.`); break }
      }
      if (stopRequested.current) setMessage('Çalışma duraklatıldı; aynı yerden daha sonra sürdürebilirsiniz.')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
    finally { setBusy(false) }
  }

  async function saveRating(output: EvalOutput) {
    const rating = ratings[output.id]
    if (!data?.run || !rating || RATING_FIELDS.some(field => !Number.isInteger(rating[field.key]) || rating[field.key] < 1 || rating[field.key] > 5)) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/education-eval/run', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review', runId: data.run.id, resultId: output.id, ...rating }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Puanlama kaydedilemedi.')
      setData(current => current ? { ...current, ...result } : result as RunnerData)
      setRatings(current => { const next = { ...current }; delete next[output.id]; return next })
      setMessage('İnsan değerlendirmesi kaydedildi; sağlayıcı kimlikleri tüm çıktılar tamamlanana kadar gizli kalır.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
    finally { setBusy(false) }
  }

  if (!data) return <div className="card" style={{ marginBottom: 16 }}>{message || 'Education Eval çalıştırıcısı yükleniyor…'}</div>
  const progress = data.progress || { completedOutputs: 0, ratedOutputs: 0, totalOutputs: 150, completedItems: 0, failedOutputs: 0, blinded: true }
  const waitingRun = data.run?.status === 'running'

  return <section className="card" style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><strong>🧪 Kör Education Eval çalıştırıcısı</strong><div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Aynı onaylı MEB sorularında üç model; otomatik ölçümler ve ayrı insan puanlaması.</div></div>
      <button className="btn btn-sm" onClick={() => void load()}>Durumu yenile</button>
    </div>
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg2, #f7f1e9)', color: 'var(--text2)', lineHeight: 1.55 }}>
      Model çağrıları yalnızca yönetici “Başlat” dediğinde yapılır. Başlatmak için kilitli 50/50 benchmark ve üç sağlayıcının yapılandırılmış olması gerekir. 50 sorunun her birinde cevap doğruluğu, süre, gerçek token/maliyet kaydı ölçülür; model kimliği, 150 çıktı da insan tarafından puanlanana dek saklanır.
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--text2)', fontSize: 13 }}>
      <span>Benchmark: <b>{data.readiness?.eligibleQuestions || 0}/50</b> · {data.readiness?.benchmarkStatus || 'yükleniyor'}</span>
      <span>Sağlayıcılar: <b>{data.readiness?.providersConfigured ? 'hazır' : 'eksik yapılandırma var'}</b></span>
      {data.run && <span>Çalışma: <b>{progress.completedItems}/50 soru</b>, {progress.completedOutputs}/150 model çıktısı · {progress.ratedOutputs}/150 insan puanı</span>}
    </div>
    {data.run?.status !== 'completed' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-primary" disabled={busy || (!waitingRun && !ready)} onClick={() => void startOrContinue()}>
        {busy ? 'Çalışıyor…' : waitingRun ? 'Sürdür / hataları yinele' : '50 soruluk karşılaştırmayı başlat'}
      </button>
      {busy && <button className="btn btn-sm" onClick={() => { stopRequested.current = true }}>Duraklat</button>}
      {!waitingRun && !ready && <small style={{ alignSelf: 'center', color: 'var(--text2)' }}>Önce Education Eval bölümündeki 50/50 soruluk seti tamamlayıp etkinleştirin; henüz model çağrısı yapılmıyor.</small>}
    </div>}

    {data.run && data.run.status !== 'running' && <div style={{ display: 'grid', gap: 10 }}>
      <strong>Kör çıktı puanlaması · sayfa {page + 1}/{pages}</strong>
      {visible.map(output => {
        const rating = ratings[output.id] || {
          curriculum_alignment_score: output.curriculum_alignment_score || 0,
          pedagogy_score: output.pedagogy_score || 0,
          age_appropriateness_score: output.age_appropriateness_score || 0,
          safety_score: output.safety_score || 0,
          reviewerNotes: output.reviewer_notes || '',
        }
        const setRating = (key: keyof Rating, value: number | string) => setRatings(current => ({ ...current, [output.id]: { ...rating, [key]: value } as Rating }))
        return <article key={output.id} className="card" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>Soru {output.item?.ordinal || '?'} · Model {output.blind_label}</b>
            <small>{output.status === 'error' ? `Hata: ${output.error_code || 'çağrı başarısız'}` : output.error_code === 'INVALID_MODEL_OUTPUT'
              ? `Otomatik puanlanamadı · ${output.duration_ms} ms · ${output.input_tokens + output.output_tokens} token`
              : `${output.duration_ms} ms · ${output.input_tokens + output.output_tokens} token`}</small></div>
          <div><b>{output.item?.objective_code}</b> · {output.item?.objective_title}<div style={{ marginTop: 5 }}>{output.item?.question_snapshot.q}</div>
            <ol type="A" style={{ margin: '6px 0 0 20px' }}>{output.item?.question_snapshot.opts.map((option, index) => <li key={index}>{option}{output.answer_index === index ? ' ← Model yanıtı' : ''}</li>)}</ol></div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{output.explanation}</div>
          {output.status === 'completed' && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8 }}>
              {RATING_FIELDS.map(field => <label key={field.key} style={{ fontSize: 12 }}>{field.label}
                <select className="input" value={rating[field.key] || ''} onChange={event => setRating(field.key, Number(event.target.value))}>
                  <option value="">1–5 seçin</option>{[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}</option>)}
                </select>
              </label>)}
            </div>
            <textarea className="input" rows={2} placeholder="İsteğe bağlı not" value={rating.reviewerNotes} onChange={event => setRating('reviewerNotes', event.target.value)} />
            <button className="btn btn-sm" disabled={busy || RATING_FIELDS.some(field => !Number.isInteger(rating[field.key]) || rating[field.key] < 1 || rating[field.key] > 5)} onClick={() => void saveRating(output)}>{output.reviewed_at ? 'Puanı güncelle' : 'İnsan puanını kaydet'}</button>
          </>}
        </article>
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Önceki</button>
        <span>{page + 1}/{pages}</span>
        <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(value => Math.min(pages - 1, value + 1))}>Sonraki</button>
      </div>
    </div>}

    {data.summary && <div style={{ overflowX: 'auto' }}><strong>Sağlayıcı özeti · körlük kaldırıldı</strong><table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 13 }}>
      <thead><tr>{['Sağlayıcı / model', 'Doğruluk (N)', 'Puanlanamayan', 'Süre ort.', 'Maliyet', 'Kazanım', 'Pedagoji', 'Yaş', 'Güvenlik'].map(label => <th key={label} style={{ textAlign: 'left', padding: 7, borderBottom: '1px solid var(--border)' }}>{label}</th>)}</tr></thead>
        <tbody>{data.summary.map(row => <tr key={row.provider}>{[`${row.provider} · ${row.model}`, `${(row.accuracy * 100).toFixed(1)}% (${row.n})`, row.unscoredOutputs, `${row.meanLatencyMs} ms`, `$${row.totalCostUsd}`, row.curriculumAlignment, row.pedagogy, row.ageAppropriateness, row.safety].map((value, index) => <td key={index} style={{ padding: 7, borderBottom: '1px solid var(--border)' }}>{value}</td>)}</tr>)}</tbody>
    </table></div>}
    {message && <div role="status" style={{ color: 'var(--text2)' }}>{message}</div>}
  </section>
}
