'use client'

import { useEffect, useMemo, useState } from 'react'
import GradeSubjectFilter, { type GradeSubjectValue } from './GradeSubjectFilter'

interface Version { id: string; code: string; title: string; status: 'draft' | 'active' | 'retired'; academic_year_start: number; academic_year_end: number }
interface Objective { id: string; objective_code: string; title: string; subject: string; grade: string; topic: string; lifecycle_status: string; is_active: boolean; curriculum_version_id: string }
interface Target { topic_node_id: string; topic: string; grade: string; level: string; unit: string; subject: string }
interface PreparedRevision { objective_id: string; curriculum_version_id: string; revision_status: 'draft' }

const PAGE_SIZE = 50
const gradeNumber = (value: string) => value.match(/\d+/)?.[0] || ''

function canonical(value: string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
}

export default function CurriculumLifecycleManager() {
  const [versions, setVersions] = useState<Version[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [preparedRevisions, setPreparedRevisions] = useState<PreparedRevision[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1)
  const [newTitle, setNewTitle] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [revisionVersion, setRevisionVersion] = useState<Record<string, string>>({})
  const [revisionTarget, setRevisionTarget] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<GradeSubjectValue>({ grade: '', subject: '' })
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  async function load() {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/learning-objective-lifecycle')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Müfredat yaşam döngüsü yüklenemedi.')
      setVersions(data.versions || []); setObjectives(data.objectives || []); setTargets(data.targets || [])
      setPreparedRevisions(data.preparedRevisions || [])
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function createVersion() {
    setBusy(true); setMessage('')
    try {
      const end = newYear + 1
      const response = await fetch('/api/admin/curriculum-versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        code: `MEB-${newYear}-${end}`, title: newTitle || `${newYear}–${end} MEB Müfredatı`, authority: 'MEB', yearStart: newYear,
        effectiveFrom: `${newYear}-09-01`, effectiveTo: `${end}-08-31`, sourceReference: 'Admin kontrollü müfredat sürümü',
      }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Sürüm oluşturulamadı.')
      setMessage('✅ Yeni müfredat taslak olarak oluşturuldu; etkinleştirilene kadar öğrencilere yansımaz.'); await load()
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  async function activate(version: Version) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/curriculum-versions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: version.id, action: 'activate' }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Sürüm etkinleştirilemedi.')
      setMessage(`✅ ${version.title} etkinleştirildi.`); await load()
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  async function transition(objective: Objective, action: 'retire' | 'reactivate') {
    const reason = reasons[objective.id]?.trim() || ''
    if (reason.length < 3) return setMessage('❌ Yaşam döngüsü işlemi için kısa bir gerekçe yazın.')
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-objective-lifecycle', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectiveId: objective.id, action, reason }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
      setMessage(`✅ ${objective.objective_code} yaşam döngüsü güncellendi.`); await load()
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  async function prepareRevision(objective: Objective) {
    const versionId = revisionVersion[objective.id] || ''
    const topicNodeId = revisionTarget[objective.id] || ''
    const reason = reasons[objective.id]?.trim() || ''
    if (!versionId) return setMessage('❌ Önce revizyonun hazırlanacağı taslak müfredatı seçin.')
    if (!topicNodeId) return setMessage(`❌ ${objective.subject} · ${objective.grade} için doğrulanmış konu hedefi seçin.`)
    if (reason.length < 3) return setMessage('❌ Değişiklik gerekçesi zorunludur; en az 3 karakter yazın.')
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-objective-lifecycle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        objectiveId: objective.id, curriculumVersionId: versionId, title: objective.title,
        topicNodeId, reason,
      }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Revizyon hazırlanamadı.')
      setMessage(`✅ ${objective.objective_code} için yeni müfredat revizyonu hazırlandı.`); await load()
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }

  const drafts = versions.filter(version => version.status === 'draft')
  const filterOptions = useMemo(() => {
    const byGrade = new Map<string, Set<string>>()
    for (const objective of objectives) {
      const grade = gradeNumber(objective.grade)
      if (!grade) continue
      if (!byGrade.has(grade)) byGrade.set(grade, new Set())
      byGrade.get(grade)!.add(objective.subject)
    }
    return [...byGrade.keys()].sort((a, b) => Number(a) - Number(b)).map(grade => ({ grade, subjects: [...byGrade.get(grade)!].sort((a, b) => a.localeCompare(b, 'tr')) }))
  }, [objectives])
  const filteredObjectives = useMemo(() => {
    const term = canonical(search)
    return objectives.filter(objective =>
      (!filter.grade || gradeNumber(objective.grade) === filter.grade) &&
      (!filter.subject || canonical(objective.subject) === canonical(filter.subject)) &&
      (!term || canonical(`${objective.objective_code} ${objective.title} ${objective.topic}`).includes(term)))
  }, [objectives, filter, search])
  const shownObjectives = filteredObjectives.slice(0, visible)
  return <div className="card" style={{ marginTop: '16px' }}>
    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>🗓️ Müfredat Sürümleri ve Kazanım Yaşam Döngüsü</div>
    <div style={{ fontSize: '12px', color: 'var(--text3)', margin: '4px 0 12px' }}>Yeni sürümler taslakta hazırlanır. Eski testlerin kazanım geçmişi değişmeden korunur.</div>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <input type="number" value={newYear} onChange={event => setNewYear(Number(event.target.value))} aria-label="Başlangıç yılı" style={{ width: 110 }} />
      <input value={newTitle} onChange={event => setNewTitle(event.target.value)} placeholder="Sürüm başlığı (isteğe bağlı)" />
      <button className="btn btn-sm" disabled={busy} onClick={createVersion}>Yeni taslak sürüm</button>
      <button className="btn btn-sm" disabled={busy} onClick={load}>Yenile</button>
    </div>
    {message && <div style={{ marginTop: 10, fontSize: 12, color: message.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{message}</div>}
    <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
      {versions.map(version => {
        const activeObjectives = objectives.filter(objective => objective.is_active && objective.lifecycle_status === 'active')
        const preparedIds = new Set(preparedRevisions.filter(revision => revision.curriculum_version_id === version.id).map(revision => revision.objective_id))
        const missingCount = activeObjectives.filter(objective => !preparedIds.has(objective.id)).length
        return <div key={version.id} style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
          <strong>{version.title}</strong> · {version.status === 'active' ? 'aktif' : version.status === 'draft' ? 'taslak' : 'arşiv'}
          {version.status === 'draft' && <>
            <button className="btn btn-sm" disabled={busy || missingCount > 0} onClick={() => activate(version)} style={{ marginLeft: 8 }}>Hazırsa etkinleştir</button>
            <span style={{ marginLeft: 8, color: missingCount > 0 ? '#dc2626' : '#16a34a' }}>
              {missingCount > 0 ? `${missingCount} aktif kazanımın revizyonu eksik` : 'Tüm aktif kazanımlar hazır'}
            </span>
          </>}
        </div>
      })}
    </div>
    {objectives.length > 0 && <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
      <strong style={{ fontSize: 13 }}>Kazanımlar</strong>
      <GradeSubjectFilter options={filterOptions} value={filter} count={`${filteredObjectives.length} / ${objectives.length} kazanım`}
        onChange={next => { setFilter(next); setVisible(PAGE_SIZE) }} />
      <input className="input" value={search} onChange={event => { setSearch(event.target.value); setVisible(PAGE_SIZE) }} placeholder="Kod, başlık veya konuda ara" aria-label="Kazanım ara" />
      {!filteredObjectives.length && <p style={{ fontSize: 12, color: 'var(--text3)' }}>Bu filtreyle eşleşen kazanım yok.</p>}
      {shownObjectives.map(objective => <div key={objective.id} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
        <div><strong>{objective.objective_code}</strong> · {objective.title} · {objective.lifecycle_status}</div>
        <div style={{ color: 'var(--text3)', marginTop: 3 }}>{objective.subject} → {objective.topic} · {objective.grade}</div>
        <input value={reasons[objective.id] || ''} onChange={event => setReasons(current => ({ ...current, [objective.id]: event.target.value }))} placeholder="Zorunlu: değişiklik gerekçesi (en az 3 karakter)" style={{ marginTop: 7, width: '100%' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
          {objective.is_active
            ? <button className="btn btn-sm" disabled={busy} onClick={() => transition(objective, 'retire')}>Emekliye ayır</button>
            : <button className="btn btn-sm" disabled={busy} onClick={() => transition(objective, 'reactivate')}>Yeniden etkinleştir</button>}
          {drafts.length > 0 && <>
            <select value={revisionVersion[objective.id] || ''} onChange={event => setRevisionVersion(current => ({ ...current, [objective.id]: event.target.value }))}>
              <option value="">— Yeni müfredat —</option>{drafts.map(version => <option key={version.id} value={version.id}>{version.code}</option>)}
            </select>
            <select value={revisionTarget[objective.id] || ''} onChange={event => setRevisionTarget(current => ({ ...current, [objective.id]: event.target.value }))}>
              <option value="">— Aynı ders ve sınıftaki konu hedefi —</option>{targets.filter(target =>
                canonical(target.grade) === canonical(objective.grade) && canonical(target.subject) === canonical(objective.subject)
              ).map(target => <option key={target.topic_node_id} value={target.topic_node_id}>{target.subject} → {target.unit} → {target.topic}</option>)}
            </select>
            <button className="btn btn-sm" disabled={busy} onClick={() => prepareRevision(objective)}>Revizyon hazırla</button>
          </>}
        </div>
      </div>)}
      {filteredObjectives.length > visible && <button type="button" className="btn btn-sm" onClick={() => setVisible(count => count + PAGE_SIZE)}>
        Daha fazla göster ({Math.min(PAGE_SIZE, filteredObjectives.length - visible)} / kalan {filteredObjectives.length - visible})
      </button>}
    </div>}
  </div>
}
