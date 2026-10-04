import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('tarayıcı yönetici, abonelik ve öğretmen onayı veremez', () => {
  const sql = readFileSync('supabase/migrations/20261004112943_profile_privilege_guard.sql', 'utf8')
  assert.ok(sql.includes('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated'))
  const allowed = sql.match(/GRANT UPDATE \(([\s\S]*?)\) ON public.profiles TO authenticated/)[1]
  for (const protectedColumn of ['is_admin', 'plan', 'monthly_test_count', 'daily_test_count', 'parent_code']) {
    assert.ok(!allowed.split(',').map(column => column.trim()).includes(protectedColumn))
  }
  assert.ok(sql.includes('coalesce(approved,false)=false'))
  assert.ok(sql.includes('REVOKE INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER ON public.parent_children'))
})
test('sınırsız profil keşfi yerine sahiplik, veli ve onaylı öğretmen ilişkisi gerekir', () => {
  const sql = readFileSync('supabase/migrations/20261004112943_profile_privilege_guard.sql', 'utf8')
  assert.ok(!sql.includes("auth.role()"))
  assert.ok(sql.includes('pc.parent_id=(SELECT auth.uid())'))
  assert.ok(sql.includes('t.user_id=(SELECT auth.uid()) AND t.approved'))
})
