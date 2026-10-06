ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_vendor_id_line_item_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_vendor_line_active_idx
  ON public.quotes (vendor_id, line_item_id)
  WHERE status = 'extracted';