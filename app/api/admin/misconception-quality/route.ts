import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function allowed(){const c=await cookies();const sb=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{get:n=>c.get(n)?.value}});const {data:{user}}=await sb.auth.getUser();if(!user)return false;const {data}=await db.from('profiles').select('is_admin').eq('id',user.id).maybeSingle();return data?.is_admin===true}
export async function GET(){if(!await allowed())return NextResponse.json({error:'Forbidden'},{status:403});const {data,error}=await db.from('misconception_false_positive_summary').select('*').order('false_positive_pct',{ascending:false});if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({items:data||[]})}
