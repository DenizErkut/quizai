// app/api/institution/import-grades/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { commitGradeImport, ImportRow } from '@/lib/grades-import'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()
  if (!instUser) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const body = await req.json()
  const { label, sourceFilename, rows } = body as { label: string; sourceFilename?: string; rows: ImportRow[] }

  if (!label?.trim()) return NextResponse.json({ error: 'Etiket (import adı) zorunlu.' }, { status: 400 })
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'İçe aktarılacak satır yok.' }, { status: 400 })

  try {
    const result = await commitGradeImport({
      scope: 'institution',
      institutionId: instUser.institution_id,
      uploadedBy: user.id,
      label: label.trim(),
      sourceFilename,
      rows,
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'İçe aktarma başarısız.' }, { status: 500 })
  }
}
