import { NextRequest,NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { authorizedReviewTeacher,loadInterventionReviewQueue,INTERVENTION_REVIEW_POLICY } from '@/lib/intervention-review'

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const dynamic='force-dynamic'

export async function GET(req:NextRequest) {
  const user=await getAuthedUser(req)
  if(!user)return NextResponse.json({error:'Oturum gerekli.'},{status:401})
  const classroomId=req.nextUrl.searchParams.get('classroomId')||'',studentId=req.nextUrl.searchParams.get('studentId')||''
  if(!UUID.test(classroomId)||!UUID.test(studentId))return NextResponse.json({error:'Sınıf ve öğrenci gerekli.'},{status:400})
  try {
    const teacherId=await authorizedReviewTeacher(db,user.id,classroomId,studentId)
    if(!teacherId)return NextResponse.json({error:'Bu öğrenci ve sınıf için yetki yok.'},{status:403})
    return NextResponse.json({items:await loadInterventionReviewQueue(db,user.id,teacherId,classroomId,studentId)})
  } catch {return NextResponse.json({error:'Çalışma incelemeleri alınamadı.'},{status:503})}
}

export async function POST(req:NextRequest) {
  const user=await getAuthedUser(req)
  if(!user)return NextResponse.json({error:'Oturum gerekli.'},{status:401})
  const body=await req.json().catch(()=>null)
  const note=typeof body?.note==='string'?body.note.trim():''
  if(!UUID.test(body?.classroomId||'')||!UUID.test(body?.studentId||'')||!UUID.test(body?.practiceId||'')
    ||!['continue','needs_followup'].includes(body?.decision)||note.length<10||note.length>1000
    ||typeof body?.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.fingerprint))
    return NextResponse.json({error:'İnceleme kararı ve 10–1000 karakterlik gerekçe gerekli.'},{status:400})
  try {
    const teacherId=await authorizedReviewTeacher(db,user.id,body.classroomId,body.studentId)
    if(!teacherId)return NextResponse.json({error:'Bu öğrenci ve sınıf için yetki yok.'},{status:403})
    const items=await loadInterventionReviewQueue(db,user.id,teacherId,body.classroomId,body.studentId)
    const item=items.find(row=>row.practiceId===body.practiceId)
    if(!item)return NextResponse.json({error:'İncelenecek çalışma bulunamadı.'},{status:404})
    if(item.fingerprint!==body.fingerprint)return NextResponse.json({error:'Çalışma içeriği değişti; listeyi yenileyerek yeniden inceleyin.'},{status:409})
    const {error}=await db.from('agent_decision_audit').insert({
      actor_id:user.id,agent_name:INTERVENTION_REVIEW_POLICY,policy_version:INTERVENTION_REVIEW_POLICY,
      input_summary:{student_id:body.studentId,classroom_id:body.classroomId,teacher_id:teacherId,cycle_id:item.cycleId,
        objective_id:item.objectiveId,practice_id:item.practiceId,fingerprint:item.fingerprint},
      decision_summary:{decision:body.decision,note,review_kind:'intervention_workflow_only'},
    })
    if(error)throw error
    return NextResponse.json({saved:true,note:'Çalışma incelemesi kaydedildi; öğrenme doğrulaması veya test puanı değiştirilmedi.'})
  } catch {return NextResponse.json({error:'İnceleme kaydedilemedi; tekrar deneyin.'},{status:503})}
}
