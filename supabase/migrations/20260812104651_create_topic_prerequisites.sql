CREATE TABLE public.topic_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  topic text NOT NULL,
  prerequisite_topic text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(subject, topic, prerequisite_topic)
);

COMMENT ON TABLE public.topic_prerequisites IS 'Faz 10 (Learning Graph) -- bir konuyu ogrenebilmek icin once bilinmesi gereken on kosul konular. PROOF-OF-CONCEPT: su an sadece roadmap dokumaninin kendi ornegi olan Kesirler/Ondalik Sayilar (ilkokul-ortaokul matematik) icin dolduruldu -- TUM MEB mufredatini kapsayan bir taksonomi DEGIL, bu ayri ve cok daha buyuk, egitim uzmanligi gerektiren bir icerik projesi.';

ALTER TABLE public.topic_prerequisites ENABLE ROW LEVEL SECURITY;

-- Herkese acik okuma (mufredat verisi, kisisel veri degil)
CREATE POLICY "topic_prerequisites_select_all" ON public.topic_prerequisites
  FOR SELECT USING (true);

-- Roadmap'in kendi ornek diyagramindaki iliskiler (Kesirler ve Ondalik Sayilar)
INSERT INTO public.topic_prerequisites (subject, topic, prerequisite_topic) VALUES
  ('Matematik', 'Denk Kesir', 'Pay ve Payda'),
  ('Matematik', 'Kesir Karşılaştırma', 'Denk Kesir'),
  ('Matematik', 'Payda Eşitleme', 'Denk Kesir'),
  ('Matematik', 'Kesir ve Ondalık Gösterim', 'Ondalık Gösterim'),
  ('Matematik', 'Kesir ve Ondalık Gösterim', 'Pay ve Payda');
