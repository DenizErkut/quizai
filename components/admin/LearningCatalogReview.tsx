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
}

interface UnitNode {
  id: string
  label: string
  subject: string
  grade: string
  level: string
}

interface EditValue { canonicalTopic: string; unitNodeId: string }

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

  async function loadQueue() {
    setLoading(true); setMessage('')
    try {
      const response = await fetch('/api/admin/learning-catalog-review?status=pending&limit=100')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'İnceleme kuyruğu yüklenemedi.')
      setCandidates(data.candidates || [])
      setUnits(data.units || [])
      setMessage(`✅ ${data.candidates?.length || 0} bekleyen başlık yüklendi.`)
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

  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>
        🗂️ Kanonik Konu–Ünite İnceleme Kuyruğu
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1rem' }}>
        Öğrenci testlerinde görülen konu başlıklarını doğrulanmış MEB ünitelerine bağlayın. Çok sınıflı başlıklar ayrıştırılmadan onaylanamaz.
      </div>
      <button onClick={loadQueue} disabled={loading} className="btn btn-sm" style={{ marginBottom: '12px' }}>
        {loading ? '⏳ Yükleniyor...' : '🔄 İnceleme Kuyruğunu Yükle'}
      </button>
      {message && <div style={{ fontSize: '12px', marginBottom: '12px', color: message.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{message}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {candidates.map(candidate => {
          const edit = edits[candidate.dimension_key] || { canonicalTopic: candidate.observed_label, unitNodeId: '' }
          const singleGrade = candidate.sample_grades.length === 1
          const candidateGrade = singleGrade ? gradeKey(candidate.sample_grades[0]) : ''
          const matchingUnits = units.filter(unit => {
            if (!singleGrade || gradeKey(unit.grade) !== candidateGrade) return false
            return candidate.observed_subject === 'Genel'
              || unit.subject.toLocaleLowerCase('tr-TR') === candidate.observed_subject.toLocaleLowerCase('tr-TR')
          })
          return (
            <div key={candidate.dimension_key} style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px' }}>{candidate.observed_label}</strong>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{candidate.occurrence_count} soru · {candidate.student_count} öğrenci</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>
                {candidate.observed_subject} · {candidate.sample_grades.join(', ') || 'Sınıf bilinmiyor'}
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
                    {matchingUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.subject} · {unit.grade} · {unit.label}</option>)}
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
