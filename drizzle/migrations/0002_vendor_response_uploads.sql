ALTER TABLE public.vendor_responses
  ADD COLUMN IF NOT EXISTS response_type text NOT NULL DEFAULT 'Quote / RFQ Response',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_data text;