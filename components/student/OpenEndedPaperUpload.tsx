'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { compressImage } from '@/lib/image-compress'
import { decodeQrFromFile } from '@/lib/qr-decode'
import { OE_QR_PREFIX } from '@/lib/open-ended-print'

type MySession = { id: string; subject: string; topic: string; question_index: number; graded_at: string | null }
type Image = { mediaType: 'image/jpeg'; data: string }
type Group = { key: string; sessionId: string | null; images: Image[]; text: string | null; status: 'pending' | 'read' | 'saved' | 'error'; message: string; score?: string }

// Tek yükleme: çıktı sayfalarının fotoğraf/taramaları seçilir; her sayfa QR koduyla ilgili soruya eşlenir, okunur, kontrol edilir ve puanlanır.
export default function OpenEndedPaperUpload({ sessions, onClose, onSaved }: { sessions: MySession[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT()
  const supabase = createClient()
  const [files, setFiles] = useState<File[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  const open = sessions.filter(s => !s.graded_at)
  const label = (id: string | null) => {
    const s = sessions.find(item => item.id === id)
    return s ? `${s.subject} · ${s.topic} · ${t('Soru {n}', { n: s.question_index + 1 })}` : t('Eşleşmedi')
  }
  const headers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }
  const patch = (key: string, change: Partial<Group>) => setGroups(list => list.map(g => g.key === key ? { ...g, ...change } : g))

  async function transcribe(group: Group) {
    if (!group.sessionId) return
    patch(group.key, { message: t('Okunuyor…') })
    try {
      const res = await fetch('/api/open-ended/paper', { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'transcribe', sessionId: group.sessionId, images: group.images.slice(0, 6) }) })
      const json = await res.json()
      if (!res.ok) { patch(group.key, { status: 'error', message: json.error || t('Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar dene.') }); return }
      patch(group.key, { status: 'read', text: json.text || '', message: json.legible === false ? t('Bazı yerler okunamadı; lütfen metni kontrol edip düzelt.') : '' })
    } catch { patch(group.key, { status: 'error', message: t('Bağlantı hatası, tekrar dene.') }) }
  }

  async function readAll() {
    if (!files.length) return
    setBusy('read'); setNote(t('Sayfalar QR koduna göre eşleniyor…')); setGroups([])
    const built: Group[] = []
    for (const file of files) {
      let qr: string | null = null
      try { qr = await decodeQrFromFile(file) } catch { qr = null }
      const sessionId = qr && qr.startsWith(OE_QR_PREFIX) ? qr.slice(OE_QR_PREFIX.length) : null
      const image = await compressImage(file)
      const last = built[built.length - 1]
      if (sessionId) {
        const same = built.find(g => g.sessionId === sessionId)
        if (same) same.images.push(image)
        else built.push({ key: `${sessionId}`, sessionId, images: [image], text: null, status: 'pending', message: '' })
      } else if (last) {
        last.images.push(image)   // QR'sız sayfa (cevabın devamı) önceki sayfaya eklenir
      } else {
        built.push({ key: `x${built.length}`, sessionId: null, images: [image], text: null, status: 'pending', message: t('QR okunamadı; soruyu aşağıdan seç.') })
      }
    }
    for (const g of built) {
      if (g.sessionId && !open.some(s => s.id === g.sessionId)) { g.status = 'error'; g.message = t('Bu QR bu hesapta açık bir soruya ait değil ya da zaten puanlanmış.') }
    }
    setGroups(built)
    setNote('')
    for (const g of built) if (g.sessionId && g.status === 'pending') await transcribe(g)
    setBusy('')
  }

  async function assign(group: Group, sessionId: string) {
    const next = { ...group, sessionId: sessionId || null, status: 'pending' as const, message: '' }
    patch(group.key, { sessionId: next.sessionId, status: 'pending', message: '' })
    if (sessionId) { setBusy('read'); await transcribe(next); setBusy('') }
  }

  async function saveAll() {
    setBusy('save')
    for (const g of groups) {
      if (g.status !== 'read' || g.text === null || !g.sessionId) continue
      patch(g.key, { message: t('Puanlanıyor…') })
      try {
        const res = await fetch('/api/open-ended/paper', { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'save', sessionId: g.sessionId, text: g.text }) })
        const json = await res.json()
        if (!res.ok) patch(g.key, { status: 'error', message: json.error || t('Puanlama başarısız.') })
        else patch(g.key, { status: 'saved', message: json.overallFeedback || '', score: `${json.totalEarned}/${json.totalPossible}` })
      } catch { patch(g.key, { status: 'error', message: t('Bağlantı hatası, tekrar dene.') }) }
    }
    setBusy('')
    onSaved()
  }

  const readyCount = groups.filter(g => g.status === 'read').length

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(10,20,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => !busy && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>{t('📷 Kâğıtları yükle')}</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 10px' }}>{t('Yazdığın sayfaların fotoğraflarını veya taramalarını (JPEG/PNG) birlikte seç. Her sayfa üzerindeki QR koduyla ilgili soruya otomatik eşlenir.')}</p>
        <input type="file" accept="image/*" multiple disabled={!!busy} onChange={e => { setFiles(Array.from(e.target.files || [])); setGroups([]) }} />
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={readAll} disabled={!files.length || !!busy}>{busy === 'read' ? t('Okunuyor…') : t('Sayfaları oku')}</button>
        {note && <p style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 8 }}>{note}</p>}

        {groups.map(g => (
          <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginTop: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{g.sessionId ? label(g.sessionId) : t('Soru seçilmedi')} <span style={{ fontWeight: 400, color: 'var(--text3)' }}>· {t('{n} sayfa', { n: g.images.length })}</span></div>
            {!g.sessionId && (
              <select className="input" style={{ marginTop: 6 }} value="" onChange={e => assign(g, e.target.value)} disabled={!!busy}>
                <option value="">{t('Soru seç…')}</option>
                {open.map(s => <option key={s.id} value={s.id}>{label(s.id)}</option>)}
              </select>
            )}
            {g.status === 'read' && g.text !== null && (
              <textarea className="input" rows={6} style={{ marginTop: 6 }} value={g.text} onChange={e => patch(g.key, { text: e.target.value })} />
            )}
            {g.status === 'saved' && <p style={{ margin: '6px 0 0', fontWeight: 700, color: '#0a9e90' }}>{t('Puan')}: {g.score}</p>}
            {g.message && <p style={{ margin: '6px 0 0', fontSize: 12, color: g.status === 'error' ? '#b42318' : 'var(--text2)', lineHeight: 1.5 }}>{g.message}</p>}
          </div>
        ))}

        {readyCount > 0 && (
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={saveAll} disabled={!!busy}>{busy === 'save' ? t('Puanlanıyor…') : t('Okunanları kontrol ettim, hepsini puanla ({n})', { n: readyCount })}</button>
        )}
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={onClose} disabled={!!busy}>{t('Kapat')}</button>
      </div>
    </div>
  )
}
