import TeacherKnowledgeTestShortcut from '@/components/teacher/TeacherKnowledgeTestShortcut'

export default function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <TeacherKnowledgeTestShortcut />
      {children}
    </>
  )
}
