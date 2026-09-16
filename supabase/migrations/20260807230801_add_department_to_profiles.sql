ALTER TABLE public.profiles
  ADD COLUMN department text;

COMMENT ON COLUMN public.profiles.department IS 'Üniversite öğrencileri için bölüm bilgisi. grade = universite* olan kullanıcılar için doldurulur. Dropdown seçimi veya "Diğer" seçildiğinde serbest metin olabilir.';
