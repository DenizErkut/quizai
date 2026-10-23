'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import GradeSubjectFilter, { type GradeSubjectOption, type GradeSubjectValue } from './GradeSubjectFilter'

interface Version { id: string; code: string; title: string; status: string; authority: string; country: string | null; state: string | null; city: string | null }
interface Objective {
  id: string; objective_code: string; title: string; level: string; grade: string; subject: string; unit: string | null; topic: string | null
  verification_status: string; lifecycle_status: string; is_active: boolean; source_type: string; source_reference: string | null; version: Version | null
}
interface Facets { countries: string[]; states: string[]; cities: string[] }

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
      </div>)}
      {!busy && !objectives.length && !message && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text3)' }}>Bu süzgece uyan kazanım yok.</div>}
    </div>

    {busy && <div style={{ textAlign: 'center', padding: '1rem' }}><div className="spinner" /></div>}
    {objectives.length < total && !busy && <div style={{ textAlign: 'center', marginTop: 10 }}>
      <button type="button" className="btn btn-sm" onClick={() => load(page + 1, true)}>Daha fazla göster ({objectives.length} / {total})</button>
    </div>}
  </div>
}
