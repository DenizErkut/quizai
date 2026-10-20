// Tarayıcı tarafı: kurum kodundan kurum adını çözer (boş string = bulunamadı). Tabloya doğrudan erişilmez.
export async function lookupInstitutionName(code: string): Promise<string> {
  const clean = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{8}$/.test(clean)) return ''
  try {
    const res = await fetch(`/api/institution/lookup?code=${encodeURIComponent(clean)}`)
    if (!res.ok) return ''
    const data = await res.json()
    return typeof data?.name === 'string' ? data.name : ''
  } catch {
    return ''
  }
}

// Oturumlu kullanıcıyı kuruma öğrenci olarak ekler (sunucu doğrular: kod, tek kurum kuralı, kendi hesabı).
export async function joinInstitution(accessToken: string, code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/institution/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ institution_code: code.trim().toUpperCase() }),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: typeof data?.error === 'string' ? data.error : undefined }
  } catch {
    return { ok: false }
  }
}
