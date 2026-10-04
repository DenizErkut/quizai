export const lifecycleTables = ['profiles', 'quiz_sessions', 'learning_events', 'student_mastery', 'student_recommendations', 'parent_children'] as const

export function lifecycleOwnerColumn(table: typeof lifecycleTables[number]): string {
  if (table === 'profiles') return 'id'
  if (table === 'parent_children') return 'child_id'
  if (table === 'quiz_sessions') return 'user_id'
  return 'student_id'
}
