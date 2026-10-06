import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { generateClusterProposals } from '@/lib/misconception-cluster-run'

export const runtime = 'nodejs'
export const maxDuration = 60

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Daily: proposes clusters for expert review. Never approves or merges anything.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY tanımlı değil.' }, { status: 500 })
  try { return NextResponse.json(await generateClusterProposals(db, 4)) }
  catch (err) {
    console.error('[cron/misconception-clusters]', err)
    return NextResponse.json({ error: 'Öneriler üretilemedi.' }, { status: 500 })
  }
}
