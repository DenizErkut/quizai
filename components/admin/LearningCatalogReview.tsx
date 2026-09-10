'use client'

import { useState } from 'react'

interface Candidate {
  dimension_key: string
  observed_label: string
  observed_subject: string
  occurrence_count: number
  student_count: number
  sample_grades: string[]
  status: 'pending' | 'mapped' | 'dismissed'
  last_seen_at: string | null
  triage_category: 'ready_review' | 'subject_missing' | 'multi_grade' | 'non_k12' | 'likely_free_text'
  priority_score: number
  suggested_unit_ids: string[]
}

interface UnitNode {
  id: string
  label: string
  subject: string
  grade: string
  level: string
}

interface EditValue { canonicalTopic: string; unitNodeId: string }

const TRIAGE_LABELS: Record<Candidate['triage_category'], string> = {
  ready_review: 'İncelemeye hazır',
  subject_missing: 'Ders bilgisi eksik',
  multi_grade: 'Çok sınıflı',
  non_k12: 'K12 dışı',
  likely_free_text: 'Serbest metin / gürültü',
}

function gradeKey(value: string) {
  return value.toLocaleLowerCase('tr-TR')
    .replace(/sinif/g, 'sınıf')
    .replace(/^(ilk\s*okul|orta\s*okul|lise|üniversite|universite)\s+/, '')
    .replace(/(\d+)\s*\.\s*sınıf/g, '$1. sınıf')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function LearningCatalogReview() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [units, setUnits] = useState<UnitNode[]>([])
  const [edits, setEdits] = useState<Record<string, EditValue>>({})
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<{ total: number; pending: number; mapped: number; dismissed: number; mappedNodeCount: number; activeTopicNodes: number; reviewCompletionPct: number; mappingRatePct: number; graphCoveragePct: number; categoryCounts: Record<string, number> } | null>(null)
  const [recentAudit, setRecentAudit] = useState<{ id: string; dimension_key: string; action: string; created_at: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function loadQueue() {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ status: 'pending', limit: '100', category })
      if (search.trim()) params.set('search', search.trim())
      const response = await fetch(`/api/admin/learning-catalog-review?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'İnceleme kuyruğu yüklenemedi.')
      setCandidates(data.candidates || [])
      setSelected(new Set())
      setUnits(data.units || [])
      setStats(data.stats || null)
      setRecentAudit(data.recentAudit || [])
      setMessage(`✅ ${data.candidates?.length || 0} kayıt gösteriliyor.`)
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`)
    } finally {
      setLoading(false)
    }
  }

  async function review(candidate: Candidate, action: 'map' | 'dismiss') {
    const edit = edits[candidate.dimension_key] || {
      canonicalTopic: candidate.observed_label,
      unitNodeId: '',
    }
    setUpdating(candidate.dimension_key); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-catalog-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensionKey: candidate.dimension_key,
          action,
          canonicalTopic: edit.canonicalTopic,
          unitNodeId: edit.unitNodeId,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
      setCandidates(current => current.filter(item => item.dimension_key !== candidate.dimension_key))
      setMessage(action === 'map'
        ? `✅ “${edit.canonicalTopic}” kataloğa ve Learning Graph'a eklendi.`
        : `✅ “${candidate.observed_label}” inceleme dışı bırakıldı.`)
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`)
    } finally {
      setUpdating(null)
    }
  }

  async function dismissSelected() {
    const keys = [...selected]
    if (!keys.length || !window.confirm(`${keys.length} aday katalog dışı bırakılsın mı?`)) return
    setLoading(true); setMessage('Toplu işlem yürütülüyor…')
    const results = await Promise.all(keys.map(dimensionKey => fetch('/api/admin/learning-catalog-review', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dimensionKey, action: 'dismiss' }),
    })))
    const succeeded = results.filter(result => result.ok).length
    await loadQueue()
    setMessage(`✅ ${succeeded}/${keys.length} aday katalog dışı bırakıldı ve audit geçmişine yazıldı.`)
    setLoading(false)
  }
  async function undo(auditId: string) {
    setLoading(true); setMessage('')
    const response = await fetch('/api/admin/learning-catalog-review', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'undo', auditId }) })
    const data = await response.json()
    await loadQueue()
    setMessage(response.ok ? '✅ Son katalog kararı güvenli biçimde geri alındı.' : `❌ ${data.error || 'Karar geri alınamadı.'}`)
    setLoading(false)
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>
        🗂️ Kanonik Konu–Ünite İnceleme Kuyruğu
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1rem' }}>
        Öğrenci testlerinde görülen konu başlıklarını doğrulanmış MEB ünitelerine bağlayın. Çok sınıflı başlıklar ayrıştırılmadan onaylanamaz.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 2fr) auto', gap: '8px', marginBottom: '12px' }}>
        <select value={category} onChange={event => setCategory(event.target.value)} aria-label="İnceleme kategorisi"
          style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }}>
          <option value="all">Tüm bekleyenler</option>
          {Object.entries(TRIAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && loadQueue()}
          placeholder="Konu başlığında ara…" aria-label="Konu ara"
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }} />
        <button onClick={loadQueue} disabled={loading} className="btn btn-sm">
          {loading ? '⏳ Yükleniyor...' : '🔄 Kuyruğu Yükle'}
        </button>
      </div>
      {stats && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 8 }}>
            {[
              ['İnceleme tamamlanma', stats.reviewCompletionPct],
              ['Katalog eşleşme', stats.mappingRatePct],
              ['Graph bağlantı kapsamı', stats.graphCoveragePct],
            ].map(([label, value]) => <div key={String(label)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 9, background: 'var(--bg2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, marginBottom: 5 }}><span>{label}</span><strong>{value}%</strong></div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Number(value))}%`, height: '100%', background: 'var(--primary)' }} /></div>
            </div>)}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span className="badge">Toplam {stats.total}</span>
          <span className="badge">Bekleyen {stats.pending}</span>
          <span className="badge">Eşleşen {stats.mapped}</span>
          <span className="badge">Katalog dışı {stats.dismissed}</span>
          <span className="badge">Aktif konu düğümü {stats.activeTopicNodes}</span>
          {Object.entries(TRIAGE_LABELS).map(([key, label]) => (
            <span key={key} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '99px', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
              {label}: {stats.categoryCounts[key] || 0}
            </span>
          ))}
          {recentAudit.length > 0 && <span className="badge">Son kararlar: {recentAudit.length}</span>}
          </div>
        </div>
      )}
      {candidates.length > 0 && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}><button className="btn btn-sm" disabled={loading || selected.size === 0} onClick={() => void dismissSelected()}>Seçilenleri katalog dışı bırak ({selected.size})</button><button className="btn btn-sm" disabled={loading} onClick={() => setSelected(new Set(candidates.map(item => item.dimension_key)))}>Tümünü seç</button></div>}
      {message && <div style={{ fontSize: '12px', marginBottom: '12px', color: message.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{message}</div>}
      {recentAudit.length > 0 && <details style={{ marginBottom:12 }}><summary style={{ cursor:'pointer',fontSize:12,fontWeight:700,color:'var(--primary)' }}>Son kararlar ve geri alma</summary><div style={{ marginTop:7 }}>{recentAudit.slice(0,8).map((audit,index)=><div key={audit.id} style={{ display:'flex',justifyContent:'space-between',gap:8,borderTop:'1px solid var(--border)',padding:'6px 0',fontSize:11 }}><span>{audit.dimension_key} · {audit.action} · {new Date(audit.created_at).toLocaleString('tr-TR')}</span>{index===0&&audit.action!=='reset'&&<button className="btn btn-sm" disabled={loading} onClick={()=>void undo(audit.id)}>Geri al</button>}</div>)}</div></details>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {candidates.map(candidate => {
          const edit = edits[candidate.dimension_key] || { canonicalTopic: candidate.observed_label, unitNodeId: '' }
          const singleGrade = candidate.sample_grades.length === 1
          const candidateGrade = singleGrade ? gradeKey(candidate.sample_grades[0]) : ''
          const matchingUnits = units.filter(unit => {
            if (!singleGrade || gradeKey(unit.grade) !== candidateGrade) return false
            return candidate.observed_subject === 'Genel'
              || unit.subject.toLocaleLowerCase('tr-TR') === candidate.observed_subject.toLocaleLowerCase('tr-TR')
          }).sort((a, b) => {
            const aSuggested = candidate.suggested_unit_ids?.indexOf(a.id) ?? -1
            const bSuggested = candidate.suggested_unit_ids?.indexOf(b.id) ?? -1
            if (aSuggested >= 0 && bSuggested < 0) return -1
            if (bSuggested >= 0 && aSuggested < 0) return 1
            if (aSuggested >= 0 && bSuggested >= 0) return aSuggested - bSuggested
            return `${a.subject} ${a.label}`.localeCompare(`${b.subject} ${b.label}`, 'tr')
          })
          return (
            <div key={candidate.dimension_key} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '13px', fontWeight: 700 }}><input type="checkbox" checked={selected.has(candidate.dimension_key)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(candidate.dimension_key); else next.delete(candidate.dimension_key); return next })} />{candidate.observed_label}</label>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{candidate.occurrence_count} soru · {candidate.student_count} öğrenci · öncelik {candidate.priority_score}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
                {candidate.observed_subject} · {candidate.sample_grades.join(', ') || 'Sınıf bilinmiyor'} · <strong>{TRIAGE_LABELS[candidate.triage_category]}</strong>
              </div>
              {!singleGrade ? (
                <div style={{ fontSize: '12px', color: '#d97706', marginBottom: '8px' }}>
                  ⚠️ Bu başlık birden fazla sınıfta kullanılmış; önce sınıf bazında ayrıştırılmalı.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(240px, 2fr)', gap: '8px', marginBottom: '8px' }}>
                  <input value={edit.canonicalTopic}
                    onChange={event => setEdits(current => ({ ...current, [candidate.dimension_key]: { ...edit, canonicalTopic: event.target.value } }))}
                    aria-label="Kanonik konu adı"
                    style={{ padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }} />
                  <select value={edit.unitNodeId}
                    onChange={event => setEdits(current => ({ ...current, [candidate.dimension_key]: { ...edit, unitNodeId: event.target.value } }))}
                    aria-label="Bağlanacak MEB ünitesi"
                    style={{ padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--primary)' }}>
                    <option value="">— Doğrulanmış MEB ünitesi seçin —</option>
                    {matchingUnits.map(unit => <option key={unit.id} value={unit.id}>{candidate.suggested_unit_ids?.includes(unit.id) ? '★ Olası · ' : ''}{unit.subject} · {unit.grade} · {unit.label}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm"
                  disabled={!singleGrade || !edit.unitNodeId || !edit.canonicalTopic.trim() || updating === candidate.dimension_key}
                  onClick={() => review(candidate, 'map')}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', opacity: (!singleGrade || !edit.unitNodeId) ? 0.5 : 1 }}>
                  ✓ Konuya ve Üniteye Bağla
                </button>
                <button className="btn btn-sm" disabled={updating === candidate.dimension_key}
                  onClick={() => review(candidate, 'dismiss')}>
                  ✕ Katalog Dışı
                </button>
              </div>
            </div>
          )
        })}
        {!loading && candidates.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '12px', padding: '12px' }}>
            Kuyruğu görmek için yükleyin veya bekleyen kayıt bulunmuyor.
          </div>
        )}
      </div>
    </div>
  )
}
