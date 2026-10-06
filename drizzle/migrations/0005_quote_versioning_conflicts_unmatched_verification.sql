ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS vendor_response_id uuid REFERENCES public.vendor_responses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS conflict_note text,
  ADD COLUMN IF NOT EXISTS previous_value numeric,
  ADD COLUMN IF NOT EXISTS previous_source text;

ALTER TABLE public.questionnaire_responses
  ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_note text;

CREATE TABLE IF NOT EXISTS public.unmatched_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  vendor_response_id uuid REFERENCES public.vendor_responses(id) ON DELETE CASCADE,
  original_text text NOT NULL,
  stated_price text,
  suggested_sku text,
  match_confidence text NOT NULL DEFAULT 'low',
  reason text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unmatched_lines TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unmatched_lines TO authenticated;
GRANT ALL ON public.unmatched_lines TO service_role;

ALTER TABLE public.unmatched_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo open unmatched_lines" ON public.unmatched_lines
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);