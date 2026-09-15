-- Keep list requests from transferring every complete curriculum document.
ALTER TABLE public.meb_resources
  ADD COLUMN IF NOT EXISTS text_preview text
    GENERATED ALWAYS AS (left(coalesce(raw_text, ''), 200)) STORED,
  ADD COLUMN IF NOT EXISTS text_char_count integer
    GENERATED ALWAYS AS (char_length(coalesce(raw_text, ''))) STORED;

COMMENT ON COLUMN public.meb_resources.text_preview IS
  'Stored 200-character preview for lightweight resource listings.';
COMMENT ON COLUMN public.meb_resources.text_char_count IS
  'Stored raw_text character count for lightweight resource listings.';
