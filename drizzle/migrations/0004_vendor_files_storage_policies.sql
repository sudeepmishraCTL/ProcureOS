CREATE POLICY "demo open vendor-files read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'vendor-files');

CREATE POLICY "demo open vendor-files insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'vendor-files');

CREATE POLICY "demo open vendor-files update" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'vendor-files') WITH CHECK (bucket_id = 'vendor-files');

CREATE POLICY "demo open vendor-files delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'vendor-files');