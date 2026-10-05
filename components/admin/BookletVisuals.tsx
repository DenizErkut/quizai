'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Row = { id: string; question: { q: string; svg?: string; opts: string[]; ans: number }; review_status: string }
export default function BookletVisuals({ resourceId }: { resourceId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function request(url: string, options?: RequestInit) {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Yönetici oturumu gerekli.')
    const result = await fetch(url, { ...options, headers: { Authorization: `Bearer ${session.access_token}` } })
    const data = await result.json()
    if (!result.ok) throw new Error(data.error || 'İşlem başarısız.')
    return data
  }
  async function load() {
    setBusy(true)
    try { const data = await request(`/api/admin/booklet-visuals?resourceId=${resourceId}`); setRows(data.questions); setOpen(true) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Sorular alınamadı.') }
    finally { setBusy(false) }
  }
  async function save() {
    if (!file || !selected || !confirmed) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('resourceId', resourceId); form.append('questionId', selected); form.append('image', file); form.append('confirmed', 'true')
      await request('/api/admin/booklet-visuals', { method: 'POST', body: form })
      setMessage('Orijinal görsel soruya ve havuza kaydedildi. Önceden yapılmış testler ve kilitli benchmark görüntüleri değişmedi.')
      setConfirmed(false); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kaydedilemedi.') }
    finally { setBusy(false) }
  }
  const row = rows.find(item => item.id === selected)
  return <div style={{ marginTop: 8 }}>
    <button className="btn btn-sm" disabled={busy} onClick={() => open ? setOpen(false) : void load()}>🖼️ Soru görsellerini yönet</button>
    {open && <div className="card" style={{ marginTop: 8 }}>
      <p>PDF metin çıkarımı şekilleri otomatik taşımaz. Kitapçıktaki ilgili şekli PNG/JPEG olarak kırpıp aşağıdaki soruya bağlayın. Cevap anahtarı veya başka sorular kırpımda bulunmamalı.</p>
      <select className="input" value={selected} onChange={event => { setSelected(event.target.value); setConfirmed(false) }}>
        <option value="">Soru seç</option>{rows.map(item => <option key={item.id} value={item.id}>{item.question.svg ? '🖼️ ' : ''}{item.question.q}</option>)}
      </select>
      {row && <><p>{row.question.q}</p><ol>{row.question.opts.map((option, i) => <li key={i}>{option}{i === row.question.ans ? ' ✓ Kayıtlı cevap' : ''}</li>)}</ol>
        {row.question.svg && <img alt="Havuzdaki görsel" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(row.question.svg)}`} style={{ maxWidth: '100%', maxHeight: 300 }} />}
        <input type="file" accept="image/png,image/jpeg" onChange={event => {
          const image = event.target.files?.[0]
          setConfirmed(false)
          if (!image || image.size > 2_000_000) { setFile(null); setPreview(''); setMessage('En fazla 2 MB PNG/JPEG seçin.'); return }
          setFile(image); const reader = new FileReader(); reader.onload = () => setPreview(String(reader.result)); reader.readAsDataURL(image)
        }} />
        {preview && <img alt="Kaydedilecek orijinal görsel" src={preview} style={{ maxWidth: '100%', maxHeight: 300 }} />}
        <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Görsel bu soruya ait, eksiksiz ve okunaklı; cevap/çözüm içermiyor. Metin ve seçeneklerle eşleşmesini kontrol ettim.</label>
        <button className="btn btn-primary" disabled={busy || !file || !confirmed} onClick={() => void save()}>Görseli onayla ve soruya bağla</button>
      </>}
      {!rows.length && <p>Bu kitapçık için henüz havuza çıkarılmış soru yok. Önce kitapçığı onaylayıp işleyin.</p>}
    </div>}
    {message && <p role="status">{message}</p>}
  </div>
}
