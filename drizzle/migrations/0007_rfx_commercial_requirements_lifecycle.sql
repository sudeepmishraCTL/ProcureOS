ALTER TABLE public.rfx
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'RFQ',
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS quote_validity_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tax_treatment text NOT NULL DEFAULT 'GST Extra',
  ADD COLUMN IF NOT EXISTS delivery_location text NOT NULL DEFAULT 'Pune, Maharashtra',
  ADD COLUMN IF NOT EXISTS incoterms text NOT NULL DEFAULT 'Not Applicable',
  ADD COLUMN IF NOT EXISTS lead_time text NOT NULL DEFAULT '4 weeks',
  ADD COLUMN IF NOT EXISTS quality_cert_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS questionnaire_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS docs_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_experience text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;