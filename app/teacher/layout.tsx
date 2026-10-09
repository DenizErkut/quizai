import TeacherKnowledgeTestShortcut from '@/components/teacher/TeacherKnowledgeTestShortcut'
import TeacherPlanBanner from '@/components/teacher/TeacherPlanBanner'

export default function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <TeacherKnowledgeTestShortcut />
      <TeacherPlanBanner />
      {children}
    </>
  )
}
