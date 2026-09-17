'use client'
// components/admin/CoachUsage.tsx — Pratium Koç, admin "Koç Kullanımı" paneli.
//
// 17 Eylül 2026 — Deniz'in isteği: koç için operasyonel rakamlar (kaç
// kullanıcı, günlük mesaj, günlük maliyet, özel tarih aralığı, kullanıcı
// listesi) tek başına kendi sekmesinde görünsün — önceden CoachAnalytics
// (adoption/engagement/click-through oranları) Müfredat Yönetimi
// sekmesinin içine gömülüydü, kendi yeri yoktu. Bu bileşen
// app/api/admin/coach-usage/route.ts'i besliyor; CoachAnalytics ile aynı
// yerde (bkz. app/admin/page.tsx, tab: 'coach-usage') gösteriliyor ki tüm
// koç verisi tek ekranda olsun.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface DailyRow { date: string; messages: number; cost_usd: number }
interface UserRow { user_id: string; name: string | null; plan: string | null; grade: string | null; messages_in_range: number; last_message_at: string | null }
interface CoachUsageData {
  generated_at: string
  all_time: { total_coach_users: number; total_cost_usd: number }
  today: { date: string; messages: number; cost_usd: number; active_users: number }
  range: { start: string; end: string; messages: number; cost_usd: number; active_users: number; avg_cost_per_message_usd: number | null; daily: DailyRow[]; users_truncated: boolean }
  users: UserRow[]
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function fmtUsd(v: number | null): string {
  if (v === null) return '—'
  return `$${v.toFixed(v < 1 ? 4 : 2)}`
}
function planLabel(plan: string | null): string {
  if (!plan) return 'free'
  return plan
}

export default function CoachUsage() {
  const [data, setData] = useState<CoachUsageData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [start, setStart] = useState(daysAgoISO(6))
  const [end, setEnd] = useState(todayISO())

  async function load(s = start, e = end) {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) { setError('Oturum bulunamadı.'); setLoading(false); return }
      const params = new URLSearchParams({ start: s, end: e })
      const res = await fetch(`/api/admin/coach-usage?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Koç kullanım verileri alınamadı.'); setLoading(false); return }
      setData(json)
    } catch {
      setError('Bağlantı hatası.')
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const quickRanges: { label: string; days: number }[] = [
    { label: 'Son 7 gün', days: 6 },
    { label: 'Son 30 gün', days: 29 },
    { label: 'Son 90 gün', days: 89 },
  ]

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--primary)' }}>🎓 Koç Kullanımı — kullanıcı, mesaj ve maliyet</strong>
        <button className="btn btn-sm" onClick={() => void load()} disabled={loading}>{loading ? 'Yükleniyor…' : 'Yenile'}</button>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}

      {data && (
        <>
          {/* Üst rakamlar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 14 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Koç kullanan kullanıcı (tüm zamanlar)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{data.all_time.total_coach_users}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bugünkü mesaj sayısı ({data.today.date})</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{data.today.messages}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bugünkü maliyet</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{fmtUsd(data.today.cost_usd)}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bugün aktif kullanıcı</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{data.today.active_users}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Tüm zamanlar toplam maliyet</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{fmtUsd(data.all_time.total_cost_usd)}</div>
            </div>
          </div>

          {/* Özel tarih aralığı */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>📅 Özel tarih aralığı</strong>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
              <button className="btn btn-sm btn-primary" onClick={() => void load(start, end)} disabled={loading}>Uygula</button>
              {quickRanges.map(qr => (
                <button key={qr.label} className="btn btn-sm" onClick={() => { const s = daysAgoISO(qr.days); const e = todayISO(); setStart(s); setEnd(e); void load(s, e) }}>
                  {qr.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, fontSize: 12 }}>
              <div>Mesaj sayısı ({data.range.start} → {data.range.end})<br /><strong>{data.range.messages}</strong></div>
              <div>Maliyet<br /><strong>{fmtUsd(data.range.cost_usd)}</strong></div>
              <div>Aktif kullanıcı<br /><strong>{data.range.active_users}</strong></div>
              <div>Mesaj başına ort. maliyet<br /><strong>{data.range.avg_cost_per_message_usd === null ? '—' : `$${data.range.avg_cost_per_message_usd.toFixed(6)}`}</strong></div>
            </div>

            {data.range.daily.length > 0 && (
              <div style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px' }}>Tarih</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px' }}>Mesaj</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px' }}>Maliyet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.range.daily.map(d => (
                      <tr key={d.date} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px' }}>{d.date}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{d.messages}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{fmtUsd(d.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Kullanıcı listesi */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 13 }}>👤 Aralıktaki kullanıcılar ({data.users.length}{data.range.users_truncated ? ', ilk 500 gösteriliyor' : ''})</strong>
            {data.users.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Bu aralıkta koçu kullanan kimse yok.</div>
            ) : (
              <div style={{ marginTop: 10, maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg2)' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px' }}>Kullanıcı</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px' }}>Plan</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px' }}>Sınıf</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px' }}>Mesaj</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px' }}>Son mesaj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map(u => (
                      <tr key={u.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px' }}>{u.name || <span style={{ color: 'var(--text3)' }}>{u.user_id.slice(0, 8)}…</span>}</td>
                        <td style={{ padding: '5px 10px' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                            background: planLabel(u.plan) === 'free' ? 'rgba(148,163,184,0.15)' : 'rgba(168,85,247,0.12)',
                            color: planLabel(u.plan) === 'free' ? 'var(--text3)' : '#a855f7',
                          }}>
                            {planLabel(u.plan)}
                          </span>
                        </td>
                        <td style={{ padding: '5px 10px' }}>{u.grade || '—'}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right' }}>{u.messages_in_range}</td>
                        <td style={{ padding: '5px 10px', color: 'var(--text3)' }}>{u.last_message_at ? new Date(u.last_message_at).toLocaleString('tr-TR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
