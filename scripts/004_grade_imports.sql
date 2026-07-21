-- 004_grade_imports.sql — MANUEL UYGULANDI (Supabase SQL Editor / MCP ile, 21.07.2026)
--
-- Kurum ve öğretmen panellerine eklenen "Not/Veri İçe Aktar" özelliği için.
-- Öğrenci eşleştirmesi mevcut profiles.class_number (kayıt sırasında
-- zorunlu doldurulan "sınıf numarası") üzerinden yapılır — yeni bir alan
-- eklemeye gerek kalmadı, bu alan zaten öğrenci okul numarasını tutuyordu.

CREATE TABLE IF NOT EXISTS grade_imports (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references institutions(id) on delete set null,
  teacher_id uuid references teachers(id) on delete set null,
  uploaded_by uuid not null,
  label text not null,               -- örn. "Mozaik TG5 - Nisan 2026"
  source_filename text,
  total_rows int not null default 0,
  matched_rows int not null default 0,
  created_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS student_grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,          -- profiles.id
  import_id uuid references grade_imports(id) on delete cascade,
  subject text not null,             -- kullanıcının import sırasında seçtiği ders/sütun adı
  value_text text not null,          -- orijinal görünüm ("18,67", "85", "AA" vb.)
  value_numeric numeric,             -- sıralama/analiz için (virgül->nokta çevrilmiş, ayrıştırılamıyorsa null)
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_student_grades_student ON student_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_import ON student_grades(import_id);
CREATE INDEX IF NOT EXISTS idx_grade_imports_institution ON grade_imports(institution_id);
CREATE INDEX IF NOT EXISTS idx_grade_imports_teacher ON grade_imports(teacher_id);

ALTER TABLE grade_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_grades ENABLE ROW LEVEL SECURITY;

-- Öğrenci kendi notlarını doğrudan görebilsin (ileride bir "notlarım" sayfası
-- yapılırsa client-side sorgu için). Yazma işlemleri sadece service-role
-- backend üzerinden (API route'lar) yapılır — RLS bunları zaten kapsam dışı
-- bırakır (service role RLS'yi atlar).
CREATE POLICY student_grades_own_select ON student_grades
  FOR SELECT USING (auth.uid() = student_id);
