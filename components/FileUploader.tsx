'use client'
import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  ext: string
  content: string
  fileType: string
  progress: number      // 0-100
  status: 'uploading' | 'done' | 'error'
  error?: string
}

interface Props {
  onFilesChange: (files: UploadedFile[]) => void
  maxFiles?: number
  maxMB?: number
  pendingFile?: File | null          // ✅ PDF araçlarından gelen dosya
  onPendingFileConsumed?: () => void
}

const CHUNK_SIZE = 3 * 1024 * 1024 // 3MB per chunk

const FILE_ICONS: Record<string, string> = {
  pdf: '📄', txt: '📝', docx: '📃', doc: '📃',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️',
  mp3: '🎵', m4a: '🎵', wav: '🎵', ogg: '🎵',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function FileUploader({ onFilesChange, maxFiles = 5, maxMB = 20, pendingFile, onPendingFileConsumed }: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ✅ PDF araçlarından gelen dosyayı otomatik yükle
  useEffect(() => {
    if (pendingFile) {
      uploadFile(pendingFile)
      onPendingFileConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile])
  const supabase = createClient() as any

  const updateFile = useCallback((id: string, patch: Partial<UploadedFile>) => {
    setFiles(prev => {
      const next = prev.map(f => f.id === id ? { ...f, ...patch } : f)
      onFilesChange(next.filter(f => f.status === 'done'))
      return next
    })
  }, [onFilesChange])

  async function uploadFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`

    // Yeni dosya ekle
    const newFile: UploadedFile = {
      id, name: file.name, size: file.size, type: file.type, ext,
      content: '', fileType: '', progress: 0, status: 'uploading',
    }
    setFiles(prev => [...prev, newFile])

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = file.slice(start, end)

        const fd = new FormData()
        fd.append('chunk', chunk, file.name)
        fd.append('chunkIndex', String(i))
        fd.append('totalChunks', String(totalChunks))
        fd.append('sessionId', id)
        fd.append('ext', ext)
        fd.append('filename', file.name)

        const res = await fetch('/api/extract-file', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })

        const text = await res.text()
        let data: any
        try { data = JSON.parse(text) } catch {
          throw new Error('Sunucu hatası. Tekrar deneyin.')
        }

        if (!res.ok) {
          const msg = data?.message || data?.error || 'Yükleme hatası.'
          throw new Error(msg)
        }

        if (data.status === 'chunk_received') {
          // Upload progress: 0-80
          updateFile(id, { progress: data.progress })
        } else if (data.status === 'complete') {
          // Hata kontrolü — route başarıyla döndü ama içerik hatası var
          if (data.error) {
            throw new Error(data.message || data.error)
          }
          // Claude işleme: 80-100
          updateFile(id, { progress: 95 })
          await new Promise(r => setTimeout(r, 300))
          updateFile(id, {
            progress: 100,
            status: 'done',
            content: data.content,
            fileType: data.type,
          })
        }
      }
    } catch (e: any) {
      updateFile(id, { status: 'error', error: e.message, progress: 0 })
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    const arr = Array.from(fileList)
    const remaining = maxFiles - files.filter(f => f.status !== 'error').length
    const toUpload = arr.slice(0, remaining)

    for (const file of toUpload) {
      if (file.size > maxMB * 1024 * 1024) {
        const id = `err_${Date.now()}`
        setFiles(prev => [...prev, {
          id, name: file.name, size: file.size, type: file.type,
          ext: file.name.split('.').pop() || '', content: '', fileType: '',
          progress: 0, status: 'error',
          error: `${formatSize(file.size)} — maksimum ${maxMB}MB`,
        }])
        continue
      }
      await uploadFile(file)
    }
  }

  function removeFile(id: string) {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== id)
      onFilesChange(next.filter(f => f.status === 'done'))
      return next
    })
  }

  const canAdd = files.filter(f => f.status !== 'error').length < maxFiles

  return (
    <div style={{ marginTop: '6px' }}>
      {/* Drop zone */}
      {canAdd && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '18px', borderRadius: '10px', textAlign: 'center', cursor: 'pointer',
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            background: dragging ? 'var(--accent-bg)' : 'var(--bg2)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-bg)' }}
          onMouseLeave={e => { if (!dragging) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' } }}
        >
          <div style={{ fontSize: '22px', marginBottom: '5px' }}>📎</div>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>
            Dosya sürükle veya tıkla
            {files.length > 0 && ` (${files.filter(f => f.status !== 'error').length}/${maxFiles})`}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>
            PDF · TXT · DOCX · JPG · PNG · MP3 · M4A · WAV
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
            Maks. {maxMB}MB/dosya · {maxFiles} dosyaya kadar
          </div>
          <input
            ref={inputRef} type="file" multiple style={{ display: 'none' }}
            accept=".pdf,.txt,.docx,.doc,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.wav,.ogg"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>
      )}

      {/* Dosya listesi */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {files.map(f => (
            <div key={f.id} style={{
              padding: '10px 12px', borderRadius: '10px',
              border: `1.5px solid ${f.status === 'error' ? 'rgba(220,38,38,0.3)' : f.status === 'done' ? 'rgba(22,163,74,0.3)' : 'var(--accent)'}`,
              background: f.status === 'error' ? 'var(--red-bg)' : f.status === 'done' ? 'var(--green-bg)' : 'var(--accent-bg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* İkon */}
                <span style={{ fontSize: '20px', flexShrink: 0 }}>
                  {f.status === 'error' ? '⚠️' : f.status === 'done' ? '✅' : FILE_ICONS[f.ext] || '📄'}
                </span>

                {/* Dosya bilgisi */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '2px', color: f.status === 'error' ? 'var(--red)' : f.status === 'done' ? 'var(--green)' : 'var(--accent)' }}>
                    {f.status === 'error' && (f.error || 'Hata')}
                    {f.status === 'done' && `✓ ${f.content.split(' ').length} kelime · ${formatSize(f.size)}`}
                    {f.status === 'uploading' && `${formatSize(f.size)} yükleniyor...`}
                  </div>

                  {/* Progress bar */}
                  {f.status === 'uploading' && (
                    <div style={{ marginTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--accent)', marginBottom: '3px' }}>
                        <span>
                          {f.progress < 80 ? 'Yükleniyor...' : f.progress < 100 ? 'Analiz ediliyor...' : 'Tamamlandı'}
                        </span>
                        <span style={{ fontWeight: 600 }}>{f.progress}%</span>
                      </div>
                      <div style={{ height: '4px', borderRadius: '99px', background: 'rgba(91,76,245,0.2)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '99px',
                          background: 'var(--accent)',
                          width: `${f.progress}%`,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Kaldır butonu */}
                <button onClick={() => removeFile(f.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '15px', flexShrink: 0, padding: '2px' }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
