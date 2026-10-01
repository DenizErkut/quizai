'use client'

import { useCallback, useEffect, useState } from 'react'

type Item = {
  key: string; source: 'bank' | 'sessions'; recordId: string; index: number | null
  question: { q?: string; opts?: string[]; exp?: string; learningObjectiveId?: string | null; learningObjectiveCode?: string | null; objectiveMappingStatus?: string }
  subject: string; grade: string; topic: string
}
type Candidate = { id: string; objective_code: string; title: string; topic: string | null }

export default function ObjectiveMappingReview() {
  const [source, setSource] = useState<'bank' | 'sessions'>('bank')
  const [reviewState, setReviewState] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Item | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateMessage, setCandidateMessage] = useState('')
  const [objectiveId, setObjectiveId] = useState('')
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/objective-mapping-review?source=${source}&page=${page}&reviewState=${reviewState}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Sorular yüklenemedi.')
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sorular yüklenemedi.') }
    finally { setLoading(false) }
  }, [source, page, reviewState])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/objective-mapping-review?source=${source}&page=${page}&reviewState=${reviewState}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Sorular yüklenemedi.')
        setItems(data.items || [])
        setTotal(data.total || 0)
      })
      .catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Sorular yüklenemedi.') })
    return () => controller.abort()
  }, [source, page, reviewState])

  const loadCandidates = useCallback(async (item: Item, term = '') => {
    const params = new URLSearchParams({ mode: 'candidates', subject: item.subject, grade: item.grade, topic: item.topic })
    if (term) params.set('search', term)
    setCandidateLoading(true)
    setCandidateMessage('')
    try {
      const response = await fetch(`/api/admin/objective-mapping-review?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kazanımlar yüklenemedi.')
      setCandidates(data.candidates || [])
      setCandidateMessage(data.candidates?.length ? `${data.candidates.length} kazanım bulundu.` : 'Bu sınıf ve ders için eşleşen kazanım bulunamadı.')
    } catch (error) { setCandidateMessage(error instanceof Error ? error.message : 'Kazanımlar yüklenemedi.') }
    finally { setCandidateLoading(false) }
  }, [])

  function select(item: Item) {
    setSelected(item)
    setObjectiveId(item.question.learningObjectiveId || '')
    setSearch('')
    setReason('')
    setMessage('')
    setCandidates([])
    setCandidateMessage('')
    void loadCandidates(item)
  }

  async function save(reject = false) {
    if (!selected) return
    if (!reject && !objectiveId) { setMessage('Önce bir kazanım seçin.'); return }
    if (reason.trim().length < 3) { setMessage('En az 3 karakterlik bir inceleme notu yazın.'); return }
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/objective-mapping-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: selected.source, recordId: selected.recordId, index: selected.index, objectiveId: reject ? null : objectiveId, reason }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Eşleştirme kaydedilemedi.')
      setMessage(`Kaydedildi. Güncellenen öğrenme olayı: ${data.updatedEvents}.`)
      setSelected(null)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Eşleştirme kaydedilemedi.') }
    finally { setSaving(false) }
  }

  return <div className="card anim-up" style={{ padding: 24 }}>
    <h2 style={{ fontSize: 20, marginBottom: 6 }}>🎯 Geçmiş Soruların Kazanım Eşleştirmesi</h2>
    <p style={{ color: 'var(--text2)', marginBottom: 16 }}>Adaylar yalnızca öneridir. Seçilen kazanım insan onayıyla kaydedilir; ders ve sınıf uyumu ayrıca denetlenir.</p>
    <p style={{ color: 'var(--text2)', marginBottom: 16 }}>Soru havuzundaki onay gelecekteki kullanım için kaydedilir. Geçmiş öğrenci sonuçlarını güncellemek için aynı sorunun “Geçmiş testler” kaydı ayrıca incelenmelidir.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
      <button className={`btn btn-sm ${source === 'bank' ? 'btn-primary' : ''}`} onClick={() => { setSource('bank'); setPage(1); setSelected(null) }}>Soru havuzu</button>
      <button className={`btn btn-sm ${source === 'sessions' ? 'btn-primary' : ''}`} onClick={() => { setSource('sessions'); setPage(1); setSelected(null) }}>Geçmiş testler</button>
      <button className="btn btn-sm" onClick={() => void load()}>↻ Yenile</button>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
      {([['pending', 'Bekleyenler'], ['approved', 'Onaylananlar'], ['rejected', 'Reddedilenler']] as const).map(([key, label]) =>
        <button key={key} className={`btn btn-sm ${reviewState === key ? 'btn-primary' : ''}`} onClick={() => { setReviewState(key); setPage(1); setSelected(null); setMessage('') }}>{label}</button>
      )}
      <span style={{ alignSelf: 'center', color: 'var(--text2)' }}>{total} soru</span>
    </div>
    {message && <p role="status" style={{ color: message.startsWith('Kaydedildi') ? 'var(--green)' : 'var(--red)', marginBottom: 12 }}>{message}</p>}
    {loading ? <p>Yükleniyor…</p> : <div style={{ display: 'grid', gap: 8 }}>
      {items.map(item => <div key={item.key}>
        <button type="button" onClick={() => selected?.key === item.key ? setSelected(null) : select(item)} aria-expanded={selected?.key === item.key} className="card-sm" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderColor: selected?.key === item.key ? 'var(--accent)' : undefined }}>
          <div style={{ fontWeight: 600 }}>{item.question.q || 'Soru metni yok'}</div>
          <small>{item.grade} · {item.subject} · {item.topic} · {item.question.learningObjectiveCode || 'Eşleşmemiş'}{item.question.objectiveMappingStatus === 'human_approved' ? ' · İnsan onaylı' : item.question.objectiveMappingStatus === 'human_rejected' ? ' · Reddedildi' : ''}</small>
        </button>
        {selected?.key === item.key && <div style={{ border: '1px solid var(--border)', borderTop: 0, borderRadius: '0 0 16px 16px', padding: 18 }}>
          <h3 style={{ marginBottom: 8 }}>Soru incelemesi</h3>
          <p>{selected.question.q}</p>
          {Array.isArray(selected.question.opts) && <ol>{selected.question.opts.map((option, index) => <li key={index}>{option}</li>)}</ol>}
          {selected.question.exp && <p style={{ color: 'var(--text2)' }}>Açıklama: {selected.question.exp}</p>}
          <p style={{ marginTop: 10 }}>Mevcut bağ: {selected.question.learningObjectiveCode || 'Yok'}</p>
          <label style={{ display: 'block', marginTop: 12 }}>Kazanım kodu veya açıklamasında ara</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Örn. MAT.5 veya veri" />
            <button className="btn btn-sm" disabled={candidateLoading} onClick={() => void loadCandidates(selected, search)}>Ara</button>
          </div>
          <small role="status" style={{ display: 'block', marginTop: 6, color: 'var(--text2)' }}>{candidateLoading ? 'Kazanımlar aranıyor…' : candidateMessage}</small>
          <label style={{ display: 'block', marginTop: 12 }}>Onaylanacak kazanım</label>
          <select className="input" value={objectiveId} onChange={event => setObjectiveId(event.target.value)}>
            <option value="">— Kazanım seç —</option>
            {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.objective_code} · {candidate.title}</option>)}
            {objectiveId && !candidates.some(candidate => candidate.id === objectiveId) && <option value={objectiveId}>Mevcut kazanım ({selected.question.learningObjectiveCode || objectiveId})</option>}
          </select>
          <label style={{ display: 'block', marginTop: 12 }}>İnceleme notu (zorunlu)</label>
          <textarea className="input" value={reason} onChange={event => setReason(event.target.value)} placeholder="Soru bu kazanımı nasıl ölçüyor veya neden reddediliyor?" style={{ width: '100%', minHeight: 72 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" disabled={saving} onClick={() => void save(false)}>Kazanımı onayla ve bağla</button>
            <button className="btn" disabled={saving} onClick={() => void save(true)}>Eşleştirmeyi reddet / kaldır</button>
          </div>
        </div>}
      </div>)}
      {!items.length && <p>Bu sayfada soru bulunamadı.</p>}
    </div>}
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Önceki</button>
      <span style={{ alignSelf: 'center' }}>Sayfa {page}</span>
      <button className="btn btn-sm" disabled={page * 20 >= total} onClick={() => setPage(value => value + 1)}>Sonraki →</button>
    </div>
  </div>
}
