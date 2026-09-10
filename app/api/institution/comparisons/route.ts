import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!)
type Session={user_id:string;pct:number;created_at:string}
function summarize(ids:Set<string>,sessions:Session[]){const rows=sessions.filter(row=>ids.has(row.user_id));const students=new Set(rows.map(row=>row.user_id));return {student_count:students.size,test_count:rows.length,avg_pct:rows.length?Math.round(rows.reduce((sum,row)=>sum+Number(row.pct||0),0)/rows.length):null}}

export async function GET(req:NextRequest){
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return NextResponse.json({error:'Yetkisiz.'},{status:401})
  const {data:{user}}=await db.auth.getUser(token);if(!user)return NextResponse.json({error:'Oturum geçersiz.'},{status:401})
  const {data:membership}=await db.from('institution_users').select('institution_id').eq('user_id',user.id).eq('role','admin').maybeSingle();if(!membership)return NextResponse.json({error:'Yasak.'},{status:403})
  const {data:institutionUsers,error:memberError}=await db.from('institution_users').select('user_id,role').eq('institution_id',membership.institution_id).in('role',['student','teacher']).limit(10000);if(memberError)return NextResponse.json({error:'Kurum üyeleri alınamadı.'},{status:500})
  const studentIds=(institutionUsers??[]).filter(row=>row.role==='student').map(row=>row.user_id);const teacherUsers=(institutionUsers??[]).filter(row=>row.role==='teacher').map(row=>row.user_id)
  if(!studentIds.length)return NextResponse.json({classes:[],teachers:[],periods:[],privacy_threshold:3})
  const since=new Date(Date.now()-60*86_400_000).toISOString()
  const [{data:teachers},{data:sessions,error:sessionError}]=await Promise.all([db.from('teachers').select('id,user_id').in('user_id',teacherUsers.length?teacherUsers:['00000000-0000-0000-0000-000000000000']),db.from('quiz_sessions').select('user_id,pct,created_at').in('user_id',studentIds).eq('completed',true).gte('created_at',since).limit(20000)])
  if(sessionError)return NextResponse.json({error:'Test verileri alınamadı.'},{status:500})
  const teacherIds=(teachers??[]).map(row=>row.id)
  const {data:classes}=teacherIds.length?await db.from('classrooms').select('id,name,teacher_id').in('teacher_id',teacherIds).limit(1000):{data:[]}
  const classIds=(classes??[]).map(row=>row.id)
  const {data:roster}=classIds.length?await db.from('classroom_students').select('classroom_id,student_id').in('classroom_id',classIds).in('student_id',studentIds).limit(20000):{data:[]}
  const typedSessions=(sessions??[]) as Session[];const threshold=3
  const classRows=(classes??[]).map(cls=>{const ids=new Set((roster??[]).filter(row=>row.classroom_id===cls.id).map(row=>row.student_id));return {id:cls.id,name:cls.name,teacher_id:cls.teacher_id,...summarize(ids,typedSessions)}}).filter(row=>row.student_count>=threshold)
  const identities=await getIdentitiesBySupabaseIds(teacherUsers)
  const teacherRows=(teachers??[]).map(teacher=>{const owned=new Set((classes??[]).filter(cls=>cls.teacher_id===teacher.id).map(cls=>cls.id));const ids=new Set((roster??[]).filter(row=>owned.has(row.classroom_id)).map(row=>row.student_id));return {id:teacher.id,name:identities[teacher.user_id]?.full_name||'Öğretmen',...summarize(ids,typedSessions)}}).filter(row=>row.student_count>=threshold)
  const currentStart=Date.now()-30*86_400_000;const allIds=new Set(studentIds);const current=typedSessions.filter(row=>new Date(row.created_at).getTime()>=currentStart);const previous=typedSessions.filter(row=>new Date(row.created_at).getTime()<currentStart)
  return NextResponse.json({classes:classRows.sort((a,b)=>(b.avg_pct??-1)-(a.avg_pct??-1)),teachers:teacherRows.sort((a,b)=>(b.avg_pct??-1)-(a.avg_pct??-1)),periods:[{name:'Son 30 gün',...summarize(allIds,current)},{name:'Önceki 30 gün',...summarize(allIds,previous)}],privacy_threshold:threshold})
}
