'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import GradeSubjectFilter, { type GradeSubjectOption, type GradeSubjectValue } from './GradeSubjectFilter'

interface Version { id: string; code: string; title: string; status: string; authority: string; country: string | null; state: string | null; city: string | null }
interface Objective {
  id: string; objective_code: string; title: string; level: string; grade: string; subject: string; unit: string | null; topic: string | null
  verification_status: string; lifecycle_status: string; is_active: boolean; source_type: string; source_reference: string | null; version: Version | null
}
interface Facets { countries: string[]; states: string[]; cities: string[] }
interface Detail {
  objective: Record<string, unknown> & { id: string; objective_code: string; title: string; source_reference: string | null }
  version: Version | null
  revisions: Array<{ id: string; revision_number: number; revision_status: string; title: string; change_reason: string; created_at: string }>
  audit: Array<{ id: number; action: string; reason: string; created_at: string }>
  usage: Record<string, number> | null
  usageError: string | null
}
interface EditState { id: string; code: string; title: string; sourceReference: string; reason: string; busy: boolean; error: string }
interface DeleteState { id: string; code: string; title: string; confirm: string; reason: string; busy: boolean; error: string; usage: Record<string, number> | null; loading: boolean }

const USAGE_LABELS: Record<string, string> = {
  learning_events: 'Öğrenme olayı', student_mastery: 'Öğrenci yetkinlik kaydı', learning_gain_measurements: 'Öğrenme kazancı ölçümü',
  learning_transfer_checks: 'Transfer kontrolü', verified_learning_cycles: 'Doğrulanmış öğrenme döngüsü', education_eval_benchmark_items: 'Eğitim değerlendirme (benchmark) kaydı',
  education_eval_ai_question_items: 'Eğitim değerlendirme (AI soru) kaydı', question_bank: 'Soru havuzundaki soru', exam_booklets: 'Kitapçık referansı',
  replaced_by_references: 'Yerine geçtiği kazanım', graph_prerequisites: 'Öğrenme grafiği ön koşulu',
}
const ACTION_LABELS: Record<string, string> = { create: 'oluşturuldu', draft_revision: 'taslak revizyon', publish_revision: 'revizyon yayınlandı', supersede: 'yerine yenisi geçti', retire: 'emekli edildi', reactivate: 'yeniden etkinleştirildi', edit: 'düzenlendi' }
const dateText = (value: unknown) => { const date = new Date(String(value || '')); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('tr-TR') }
const fieldText = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value))

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div onClick={event => event.stopPropagation()} style={{ background: 'var(--bg)', color: 'var(--text)', borderRadius: 14, border: '1px solid var(--border)', width: 'min(720px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Kapat">✕</button>
      </div>
      {children}
    </div>
  </div>
}

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['tr'], { type: 'region' }) : null
const countryName = (code: string) => { try { return regionNames?.of(code) || code } catch { return code } }
const scopeText = (scope: { country: string | null; state: string | null; city: string | null } | null) =>
  scope ? [scope.country ? countryName(scope.country) : '', scope.state, scope.city].filter(Boolean).join(' / ') : '—'
const statusColor = (status: string) => status === 'active' ? '#15803d' : status === 'draft' ? '#b45309' : '#6b7280'

/** Kazanım kaynaklarını (müfredat sürümü ve katalog) ülke/eyalet/şehir ve sınıf/ders filtresiyle gösterir. */
export default function ObjectiveSourcesBrowser() {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  const [facets, setFacets] = useState<Facets>({ countries: [], states: [], cities: [] })
  const [options, setOptions] = useState<GradeSubjectOption[]>([])
  const [total, setTotal] = useState(0)
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [country, setCountry] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [filter, setFilter] = useState<GradeSubjectValue>({ grade: '', subject: '' })
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const request = useRef(0)
  const searchTimer = useRef(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [del, setDel] = useState<DeleteState | null>(null)
  const [notice, setNotice] = useState('')

  async function fetchDetail(id: string): Promise<Detail> {
    const response = await fetch(`/api/admin/learning-objective-sources?id=${encodeURIComponent(id)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Kazanım ayrıntısı alınamadı.')
    return data as Detail
  }
  async function openDetail(id: string) {
    setDetail(null); setDetailLoading(true); setNotice('')
    try { setDetail(await fetchDetail(id)) } catch (error) { setNotice(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setDetailLoading(false) }
  }
  async function saveEdit() {
    if (!edit) return
    setEdit({ ...edit, busy: true, error: '' })
    try {
      const response = await fetch('/api/admin/learning-objective-sources', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: edit.id, title: edit.title, sourceReference: edit.sourceReference, reason: edit.reason }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kazanım güncellenemedi.')
      const result = data.result as { title: string; source_reference: string | null }
      setObjectives(current => current.map(item => item.id === edit.id ? { ...item, title: result.title, source_reference: result.source_reference } : item))
      setEdit(null); setNotice(`✅ ${edit.code} güncellendi.`)
    } catch (error) { setEdit(current => current && { ...current, busy: false, error: error instanceof Error ? error.message : 'Beklenmeyen hata' }) }
  }
  async function openDelete(objective: Objective) {
    setNotice('')
    setDel({ id: objective.id, code: objective.objective_code, title: objective.title, confirm: '', reason: '', busy: false, error: '', usage: null, loading: true })
    try {
      const info = await fetchDetail(objective.id)
      setDel(current => current && { ...current, usage: info.usage, loading: false, error: info.usageError || '' })
    } catch (error) { setDel(current => current && { ...current, loading: false, error: error instanceof Error ? error.message : 'Kullanım bilgisi alınamadı.' }) }
  }
  async function confirmDelete() {
    if (!del) return
    setDel({ ...del, busy: true, error: '' })
    try {
      const response = await fetch('/api/admin/learning-objective-sources', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: del.id, confirmCode: del.confirm, reason: del.reason }) })
      const data = await response.json()
      if (!response.ok) {
        setDel(current => current && { ...current, busy: false, error: data.error || 'Kazanım silinemedi.', usage: data.usage || current.usage })
        return
      }
      setObjectives(current => current.filter(item => item.id !== del.id)); setTotal(current => Math.max(0, current - 1)); setCatalogTotal(current => Math.max(0, current - 1))
      setDel(null); setNotice(`🗑️ ${del.code} silindi (kopyası silme kaydında saklandı).`)
    } catch (error) { setDel(current => current && { ...current, busy: false, error: error instanceof Error ? error.message : 'Beklenmeyen hata' }) }
  }
  async function retireInstead() {
    if (!del) return
    setDel({ ...del, busy: true, error: '' })
    try {
      const response = await fetch('/api/admin/learning-objective-lifecycle', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectiveId: del.id, action: 'retire', reason: del.reason }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kazanım emekli edilemedi.')
      setObjectives(current => current.map(item => item.id === del.id ? { ...item, lifecycle_status: 'retired', is_active: false } : item))
      setDel(null); setNotice(`✅ ${del.code} emekli edildi (öğrenci verileri korunur).`)
    } catch (error) { setDel(current => current && { ...current, busy: false, error: error instanceof Error ? error.message : 'Beklenmeyen hata' }) }
  }

  const load = useCallback(async (nextPage = 1, append = false) => {
    const id = ++request.current
    setBusy(true); setMessage('')
    try {
      const params = new URLSearchParams({ page: String(nextPage) })
      if (country) params.set('country', country)
      if (state) params.set('state', state)
      if (city) params.set('city', city)
      if (filter.grade) params.set('grade', filter.grade)
      if (filter.subject) params.set('subject', filter.subject)
      if (query) params.set('q', query)
      const response = await fetch(`/api/admin/learning-objective-sources?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kazanım kaynakları yüklenemedi.')
      if (id !== request.current) return
      setObjectives(current => append ? [...current, ...(data.objectives || [])] : (data.objectives || []))
      setVersions(data.versions || []); setFacets(data.facets || { countries: [], states: [], cities: [] })
      setOptions(data.filters || []); setTotal(data.total || 0); setCatalogTotal(data.catalogTotal || 0); setPage(nextPage)
    } catch (error) { if (id === request.current) setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { if (id === request.current) setBusy(false) }
  }, [country, state, city, filter.grade, filter.subject, query])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(1, false) }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const activeFilter = Boolean(country || state || city || filter.grade || filter.subject || query)
  const clearAll = () => { setCountry(''); setState(''); setCity(''); setFilter({ grade: '', subject: '' }); setSearch(''); setQuery('') }

  return <div className="card" style={{ marginBottom: '1.5rem' }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>📖 Kazanım Kaynakları</div>
    <div style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 10px' }}>
      Kataloğa yüklü kazanımları müfredat sürümüne (ülke/eyalet/şehir kapsamı) göre görüntüleyin. Konum süzgeci müfredat sürümünün kapsamına bakar.
    </div>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <select className="input" aria-label="Ülke filtresi" value={country} style={{ width: 'auto', minWidth: 160 }}
        onChange={event => { setCountry(event.target.value); setState(''); setCity(''); setObjectives([]) }}>
        <option value="">Tüm ülkeler</option>
        {facets.countries.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
      </select>
      <select className="input" aria-label="Eyalet filtresi" value={state} disabled={!country || !facets.states.length} style={{ width: 'auto', minWidth: 160 }}
        onChange={event => { setState(event.target.value); setCity(''); setObjectives([]) }}>
        <option value="">{country && !facets.states.length ? 'Eyalet kapsamı yok' : 'Tüm eyaletler/iller'}</option>
        {facets.states.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <select className="input" aria-label="Şehir filtresi" value={city} disabled={!state || !facets.cities.length} style={{ width: 'auto', minWidth: 160 }}
        onChange={event => { setCity(event.target.value); setObjectives([]) }}>
        <option value="">{state && !facets.cities.length ? 'Şehir kapsamı yok' : 'Tüm şehirler/ilçeler'}</option>
        {facets.cities.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>

    <GradeSubjectFilter options={options} value={filter} disabled={busy && !objectives.length}
      count={`${total} / ${catalogTotal} kazanım`} onChange={next => { setFilter(next); setObjectives([]) }} />
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="input" value={search} placeholder="Kod, kazanım, ünite veya konu ara…" style={{ maxWidth: 360 }}
        onChange={event => { setSearch(event.target.value); window.clearTimeout(searchTimer.current); searchTimer.current = window.setTimeout(() => { setQuery(event.target.value.trim()); setObjectives([]) }, 350) }} />
      {activeFilter && <button type="button" className="btn btn-sm" onClick={clearAll}>Tüm filtreleri temizle</button>}
    </div>

    {versions.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
      {versions.map(version => <span key={version.id} title={version.title}
        style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
        <b>{version.code}</b> · {scopeText(version)} · <span style={{ color: statusColor(version.status) }}>{version.status}</span>
      </span>)}
    </div>}

    {message && <div style={{ fontSize: 12, color: 'var(--red)', margin: '8px 0' }}>{message}</div>}
    {notice && <div style={{ fontSize: 12, margin: '8px 0', color: notice.startsWith('❌') ? 'var(--red)' : 'var(--green)' }}>{notice}</div>}

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {objectives.map(objective => <div key={objective.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <code style={{ fontSize: 12, fontWeight: 700 }}>{objective.objective_code}</code>
          <span style={{ fontSize: 13 }}>{objective.title}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <span>🌍 {scopeText(objective.version)}</span>
          <span>🎓 {objective.grade}</span>
          <span>📚 {objective.subject}</span>
          {objective.unit && <span>📖 {objective.unit}</span>}
          <span style={{ color: statusColor(objective.lifecycle_status) }}>● {objective.lifecycle_status}{objective.is_active ? '' : ' (pasif)'}</span>
          <span>{objective.verification_status === 'verified' ? '✅ doğrulandı' : objective.verification_status}</span>
          {objective.version && <span>🧾 {objective.version.code}</span>}
        </div>
        {objective.source_reference && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>{objective.source_reference}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={() => openDetail(objective.id)}>👁️ Görüntüle</button>
          <button type="button" className="btn btn-sm" onClick={() => setEdit({ id: objective.id, code: objective.objective_code, title: objective.title, sourceReference: objective.source_reference || '', reason: '', busy: false, error: '' })}>✏️ Düzenle</button>
          <button type="button" className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => openDelete(objective)}>🗑️ Sil</button>
        </div>
      </div>)}
      {!busy && !objectives.length && !message && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text3)' }}>Bu süzgece uyan kazanım yok.</div>}
    </div>

    {busy && <div style={{ textAlign: 'center', padding: '1rem' }}><div className="spinner" /></div>}
    {objectives.length < total && !busy && <div style={{ textAlign: 'center', marginTop: 10 }}>
      <button type="button" className="btn btn-sm" onClick={() => load(page + 1, true)}>Daha fazla göster ({objectives.length} / {total})</button>
    </div>}
    {(detail || detailLoading) && <Modal title="Kazanım ayrıntısı" onClose={() => { setDetail(null); setDetailLoading(false) }}>
      {detailLoading && <div style={{ textAlign: 'center', padding: '1rem' }}><div className="spinner" /></div>}
      {detail && <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div><code style={{ fontWeight: 700 }}>{detail.objective.objective_code}</code><div style={{ fontSize: 13, marginTop: 4 }}>{detail.objective.title}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 6 }}>
          {(['level', 'grade', 'subject', 'unit', 'topic', 'lifecycle_status', 'verification_status', 'is_active', 'source_type', 'valid_from', 'valid_to'] as const).map(key =>
            <div key={key}><span style={{ color: 'var(--text3)' }}>{key}: </span>{fieldText(detail.objective[key])}</div>)}
          <div><span style={{ color: 'var(--text3)' }}>Oluşturma: </span>{dateText(detail.objective.created_at)}</div>
          <div><span style={{ color: 'var(--text3)' }}>Güncelleme: </span>{dateText(detail.objective.updated_at)}</div>
        </div>
        <div><b>Müfredat sürümü:</b> {detail.version ? `${detail.version.code} · ${scopeText(detail.version)} · ${detail.version.status} · ${detail.version.authority}` : '—'}</div>
        <div><b>Kaynak referansı:</b> <span style={{ fontStyle: 'italic' }}>{fieldText(detail.objective.source_reference)}</span></div>
        <div><b>Kullanım:</b> {detail.usage
          ? (detail.usage.total ? Object.entries(detail.usage).filter(([key, value]) => key !== 'total' && value > 0).map(([key, value]) => `${USAGE_LABELS[key] || key}: ${value}`).join(' · ') : 'Hiçbir yerde kullanılmıyor (silinebilir).')
          : (detail.usageError || '—')}</div>
        <div><b>Revizyonlar ({detail.revisions.length}):</b>
          {detail.revisions.map(revision => <div key={revision.id} style={{ marginTop: 4, color: 'var(--text2)' }}>#{revision.revision_number} · {revision.revision_status} · {dateText(revision.created_at)} · {revision.change_reason}</div>)}</div>
        <div><b>Denetim kayıtları ({detail.audit.length}):</b>
          {detail.audit.map(entry => <div key={entry.id} style={{ marginTop: 4, color: 'var(--text2)' }}>{dateText(entry.created_at)} · {ACTION_LABELS[entry.action] || entry.action} · {entry.reason}</div>)}</div>
        <details><summary style={{ cursor: 'pointer' }}>Ham metadata</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(detail.objective.metadata ?? {}, null, 2)}</pre></details>
      </div>}
    </Modal>}

    {edit && <Modal title={`Kazanımı düzenle · ${edit.code}`} onClose={() => !edit.busy && setEdit(null)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <label>Kazanım metni *<textarea className="input" rows={4} value={edit.title} maxLength={1000} onChange={event => setEdit({ ...edit, title: event.target.value })} /></label>
        <label>Kaynak referansı<textarea className="input" rows={2} value={edit.sourceReference} maxLength={1000} onChange={event => setEdit({ ...edit, sourceReference: event.target.value })} /></label>
        <label>Değişiklik gerekçesi * (denetim kaydına yazılır)<input className="input" value={edit.reason} maxLength={500} placeholder="Örn. yazım hatası düzeltildi" onChange={event => setEdit({ ...edit, reason: event.target.value })} /></label>
        <div style={{ color: 'var(--text3)' }}>Kod, sınıf, ders, ünite ve konu bu ekrandan değiştirilmez; aktif revizyon ve öğrenme grafiği düğümü yeni metinle güncellenir.</div>
        {edit.error && <div style={{ color: 'var(--red)' }}>❌ {edit.error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm" disabled={edit.busy} onClick={() => setEdit(null)}>Vazgeç</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={edit.busy || edit.title.trim().length < 3 || edit.reason.trim().length < 3} onClick={saveEdit}>{edit.busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </div>
    </Modal>}

    {del && <Modal title={`Kazanımı sil · ${del.code}`} onClose={() => !del.busy && setDel(null)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div style={{ fontSize: 13 }}>{del.title}</div>
        {del.loading && <div>Kullanım kontrol ediliyor…</div>}
        {!del.loading && del.usage && del.usage.total > 0 && <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--red)', color: 'var(--red)' }}>
          <b>Bu kazanım kullanımda, silinemez.</b>
          <div style={{ marginTop: 4 }}>{Object.entries(del.usage).filter(([key, value]) => key !== 'total' && value > 0).map(([key, value]) => `${USAGE_LABELS[key] || key}: ${value}`).join(' · ')}</div>
          <div style={{ marginTop: 4, color: 'var(--text2)' }}>Öğrenci ve soru verisini korumak için kazanımı emekli edebilirsiniz (listelerden kalkar, geçmiş veri durur).</div>
        </div>}
        {!del.loading && del.usage && del.usage.total === 0 && <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
          Kazanım hiçbir yerde kullanılmıyor. Silinirse revizyonları ve öğrenme grafiği düğümü de silinir; tam bir kopyası silme kaydında saklanır. <b>Bu işlem geri alınamaz.</b>
        </div>}
        <label>Silme gerekçesi * <input className="input" value={del.reason} maxLength={500} onChange={event => setDel({ ...del, reason: event.target.value })} /></label>
        {del.usage?.total === 0 && <label>Onaylamak için kazanım kodunu yazın: <code>{del.code}</code>
          <input className="input" value={del.confirm} autoComplete="off" onChange={event => setDel({ ...del, confirm: event.target.value })} /></label>}
        {del.error && <div style={{ color: 'var(--red)' }}>❌ {del.error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" disabled={del.busy} onClick={() => setDel(null)}>Vazgeç</button>
          {del.usage && del.usage.total > 0 && <button type="button" className="btn btn-sm" disabled={del.busy || del.reason.trim().length < 3} onClick={retireInstead}>Emekli et</button>}
          {del.usage?.total === 0 && <button type="button" className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }}
            disabled={del.busy || del.reason.trim().length < 3 || del.confirm !== del.code} onClick={confirmDelete}>{del.busy ? 'Siliniyor…' : 'Kalıcı olarak sil'}</button>}
        </div>
      </div>
    </Modal>}
  </div>
}
