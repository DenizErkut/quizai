-- 005_grade_notes_institution_lock.sql — Supabase'de MCP ile uygulandı, 21.07.2026
--
-- Amaç: Bir kuruma öğrenci olarak bağlı kullanıcılar artık kendi
-- grade_notes (Karne Notlarım / /notes sayfası) kayıtlarını KENDİLERİ
-- giremez/düzenleyemez — sadece görüntüleyebilir. Not girişi artık o
-- öğrenciler için SADECE kurum/öğretmen tarafından (student_grades
-- tablosuna, elle veya dosyadan içe aktararak) yapılır.
--
-- Kuruma bağlı OLMAYAN (bireysel/serbest) kullanıcılar için hiçbir şey
-- değişmedi — kendi notlarını eskisi gibi serbestçe girip düzenleyebilirler.

DROP POLICY users_own_grade_notes ON grade_notes;

CREATE POLICY grade_notes_select_own ON grade_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY grade_notes_write_unaffiliated_only ON grade_notes
  FOR ALL
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM institution_users iu
      WHERE iu.user_id = grade_notes.user_id AND iu.role = 'student'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM institution_users iu
      WHERE iu.user_id = grade_notes.user_id AND iu.role = 'student'
    )
  );
