
CREATE TABLE public.rfx (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  fx_rate numeric NOT NULL DEFAULT 83.10,
  status text NOT NULL DEFAULT 'Responses Received',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfx TO anon, authenticated;
GRANT ALL ON public.rfx TO service_role;
ALTER TABLE public.rfx ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open rfx" ON public.rfx FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  sku text NOT NULL,
  description text NOT NULL,
  quantity integer NOT NULL,
  unit text NOT NULL DEFAULT 'piece',
  delivery_requirement text,
  specifications text,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_items TO anon, authenticated;
GRANT ALL ON public.line_items TO service_role;
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open line_items" ON public.line_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text NOT NULL,
  status text NOT NULL DEFAULT 'Responded',
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO anon, authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open vendors" ON public.vendors FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.vendor_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_file text NOT NULL,
  raw_content text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  extraction_confidence numeric,
  extraction_notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_responses TO anon, authenticated;
GRANT ALL ON public.vendor_responses TO service_role;
ALTER TABLE public.vendor_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open vendor_responses" ON public.vendor_responses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  line_item_id uuid NOT NULL REFERENCES public.line_items(id) ON DELETE CASCADE,
  original_text text,
  original_value numeric,
  original_currency text,
  original_unit text,
  normalized_value numeric,
  normalized_currency text DEFAULT 'INR',
  normalized_unit text DEFAULT 'piece',
  normalization_note text,
  confidence text NOT NULL DEFAULT 'high',
  confidence_score numeric,
  issue_type text,
  issue_note text,
  requires_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'extracted',
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, line_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO anon, authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open quotes" ON public.quotes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  question text NOT NULL,
  response text NOT NULL,
  pass_fail boolean NOT NULL,
  evidence text,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questionnaire_responses TO anon, authenticated;
GRANT ALL ON public.questionnaire_responses TO service_role;
ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open questionnaire" ON public.questionnaire_responses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  actor text NOT NULL DEFAULT 'Sudeep Mishra',
  event text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO anon, authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open audit" ON public.audit_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.analyst_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyst_answers TO anon, authenticated;
GRANT ALL ON public.analyst_answers TO service_role;
ALTER TABLE public.analyst_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open analyst" ON public.analyst_answers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfx_id uuid NOT NULL REFERENCES public.rfx(id) ON DELETE CASCADE,
  strategy text NOT NULL,
  total_value numeric NOT NULL,
  allocation jsonb NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by text NOT NULL DEFAULT 'Buyer'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.awards TO anon, authenticated;
GRANT ALL ON public.awards TO service_role;
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open awards" ON public.awards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
