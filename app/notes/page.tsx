'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Note {
  id: string
  content: string
  created_at: string
  updated_at: string
}

export default function NotesPage() {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [editContent, setEditContent] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('user_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (data) setNotes(data)
      setLoading(false)
    }
    load()
  }, [])

  async function addNote() {
    if (!newNote.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('user_notes')
      .insert({ user_id: user.id, content: newNote.trim() })
      .select().single()
    if (data) setNotes(prev => [data, ...prev])
    setNewNote('')
    setShowAdd(false)
    setSaving(false)
  }

  async function updateNote(id: string) {
    if (!editContent.trim()) return
    setSaving(true)
    await supabase.from('user_notes')
      .update({ content: editContent.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, content: editContent.trim(), updated_at: new Date().toISOString() } : n))
    setEditingId(null)
    setSaving(false)
  }

  async function deleteNote(id: string) {
    await supabase.from('user_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '2rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Notlarım</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Ders notlarım</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            Notların haftalık gelişim planı oluştururken yapay zeka tarafından dikkate alınır.
          </p>
        </div>

        {/* Bilgi kutusu */}
        <div className="card anim-up-1" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)', background: 'var(--accent-bg)' }}>
          <p style={{ fontSize: '13px', color: 'var(--accent)', lineHeight: 1.7, margin: 0 }}>
            💡 Buraya ders notlarını, çalışmak istediğin konuları veya zorlandığın alanları yazabilirsin. Plan oluştururken AI bu notları okuyarak sana daha kişisel bir plan hazırlar.
          </p>
        </div>

        {/* Not ekleme */}
        {showAdd ? (
          <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--accent)' }}>Yeni not</div>
            <textarea
              autoFocus
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Notunu buraya yaz... (örn: Kesirler konusunu anlamadım, özellikle bölme işlemi. Geometride açılar konusunu çalışmam lazım.)"
              style={{
                width: '100%', minHeight: '120px', padding: '10px 12px',
                borderRadius: '10px', border: '1.5px solid var(--border)',
                fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: 1.7,
                color: 'var(--text)', background: 'var(--bg2)', resize: 'vertical',
                boxSizing: 'border-box', outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="btn btn-primary" onClick={addNote} disabled={saving || !newNote.trim()}
                style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Kaydet'}
              </button>
              <button className="btn" onClick={() => { setShowAdd(false); setNewNote('') }}
                style={{ justifyContent: 'center' }}>
                İptal
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary anim-up-1"
            onClick={() => setShowAdd(true)}
            style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }}>
            + Yeni not ekle
          </button>
        )}

        {/* Notlar listesi */}
        {notes.length === 0 && !showAdd ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📝</div>
            <h3 className="serif" style={{ fontSize: '18px', marginBottom: '0.5rem' }}>Henüz not yok</h3>
            <p style={{ color: 'var(--text2)', fontSize: '13px' }}>İlk notunu ekle, AI planını ona göre kişiselleştirsin.</p>
          </div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="card" style={{ marginBottom: '0.75rem' }}>
              {editingId === note.id ? (
                <>
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    style={{
                      width: '100%', minHeight: '100px', padding: '10px 12px',
                      borderRadius: '10px', border: '1.5px solid var(--accent)',
                      fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: 1.7,
                      color: 'var(--text)', background: 'var(--bg2)', resize: 'vertical',
                      boxSizing: 'border-box', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button className="btn btn-primary" onClick={() => updateNote(note.id)} disabled={saving}
                      style={{ flex: 1, justifyContent: 'center' }}>
                      {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '💾 Kaydet'}
                    </button>
                    <button className="btn" onClick={() => setEditingId(null)}
                      style={{ justifyContent: 'center' }}>İptal</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)', margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>
                    {note.content}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      {formatDate(note.updated_at)}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: '6px' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        ✏️ Düzenle
                      </button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--red)', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: '6px' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        🗑️ Sil
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}

        {notes.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text3)', marginTop: '1rem' }}>
            {notes.length} not · Planını yenilediğinde AI bu notları dikkate alır
          </p>
        )}
      </div>
    </main>
  )
}
