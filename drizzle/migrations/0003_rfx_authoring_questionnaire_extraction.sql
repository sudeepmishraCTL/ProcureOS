-- RFx authoring
ALTER TABLE public.rfx ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.rfx ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.rfx ADD COLUMN IF NOT EXISTS due_date text;

UPDATE public.rfx SET is_active = true
WHERE id = (SELECT id FROM public.rfx ORDER BY created_at LIMIT 1);

-- Buyer-defined questionnaire criteria
CREATE TABLE IF NOT EXISTS public.questionnaire_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  question text NOT NULL,
  guidance text,
  mandatory boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questionnaire_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questionnaire_questions TO anon;
GRANT ALL ON public.questionnaire_questions TO service_role;

ALTER TABLE public.questionnaire_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo open questionnaire_questions" ON public.questionnaire_questions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.questionnaire_questions (rfx_id, question, mandatory, sort_order)
SELECT DISTINCT ON (question) rfx_id, question, true, sort_order
FROM public.questionnaire_responses
ORDER BY question, sort_order;

-- Richer questionnaire evaluation states
ALTER TABLE public.questionnaire_responses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pass';
ALTER TABLE public.questionnaire_responses ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'seed';
ALTER TABLE public.questionnaire_responses ADD COLUMN IF NOT EXISTS confidence text;
ALTER TABLE public.questionnaire_responses ADD COLUMN IF NOT EXISTS source_ref text;

UPDATE public.questionnaire_responses
SET status = CASE WHEN pass_fail THEN 'pass' ELSE 'fail' END
WHERE status = 'pass' AND pass_fail = false;

-- Original uploaded files
ALTER TABLE public.vendor_responses ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE public.vendor_responses ADD COLUMN IF NOT EXISTS file_mime text;

-- Persisted award decisions
ALTER TABLE public.awards ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.awards ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.awards ADD COLUMN IF NOT EXISTS acknowledged_items jsonb;

-- Saved scenarios
CREATE TABLE IF NOT EXISTS public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  name text NOT NULL,
  constraints jsonb NOT NULL,
  result jsonb NOT NULL,
  created_by text NOT NULL DEFAULT 'Sudeep Mishra',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarios TO anon;
GRANT ALL ON public.scenarios TO service_role;

ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo open scenarios" ON public.scenarios
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);