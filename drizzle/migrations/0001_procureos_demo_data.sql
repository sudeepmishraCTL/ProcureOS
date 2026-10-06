
WITH new_rfx AS (
  INSERT INTO public.rfx (code, name, category, currency, fx_rate, status)
  VALUES ('RFx-2026-014', 'Corrugated Packaging — FY27 Sourcing Event', 'Packaging', 'INR', 83.10, 'Responses Received')
  RETURNING id
),
base(ord, sku, descr, qty, del, spec, price) AS (
  VALUES
  (1,'SKU-001','3-Ply Corrugated Box — Small',25000,'Weekly, 4 week lead time','3-ply, 120 GSM kraft, 200x150x100mm',18.40),
  (2,'SKU-002','3-Ply Corrugated Box — Medium',22000,'Weekly, 4 week lead time','3-ply, 120 GSM kraft, 300x220x150mm',24.60),
  (3,'SKU-003','3-Ply Corrugated Box — Large',18000,'Fortnightly, 4 week lead time','3-ply, 140 GSM kraft, 450x300x200mm',33.10),
  (4,'SKU-004','5-Ply Corrugated Box — Small',16000,'Weekly, 5 week lead time','5-ply, 150 GSM, 200x150x100mm',29.80),
  (5,'SKU-005','5-Ply Corrugated Box — Medium',21000,'Weekly, 5 week lead time','5-ply, 150 GSM, 350x250x180mm',41.50),
  (6,'SKU-006','5-Ply Corrugated Box — Large',14000,'Fortnightly, 5 week lead time','5-ply, 180 GSM, 500x350x250mm',56.20),
  (7,'SKU-007','Heavy Duty 5-Ply Box',9000,'Monthly, 6 week lead time','5-ply, 200 GSM, edge crush 44 ECT',72.40),
  (8,'SKU-008','Printed Corrugated Box',12000,'Monthly, 6 week lead time','3-ply, 2-colour flexo print',38.90),
  (9,'SKU-009','Die-Cut Box',8000,'Monthly, 6 week lead time','3-ply die-cut, self-locking base',44.30),
  (10,'SKU-010','E-commerce Shipping Box',40000,'Weekly, 3 week lead time','3-ply, tear strip, 250x200x120mm',21.70),
  (11,'SKU-011','Pizza Shipping Carton',15000,'Weekly, 4 week lead time','E-flute, grease resistant liner',26.50),
  (12,'SKU-012','Folding Carton',30000,'Weekly, 4 week lead time','300 GSM duplex board, glued',12.90),
  (13,'SKU-013','Partition Box',7000,'Monthly, 6 week lead time','5-ply with 6-cell kraft partitions',63.80),
  (14,'SKU-014','Kraft Mailer',50000,'Weekly, 3 week lead time','E-flute kraft mailer, peel seal',14.20),
  (15,'SKU-015','Export Carton',11000,'Monthly, 7 week lead time','5-ply, ISPM-15 compliant markings',68.40),
  (16,'SKU-016','Double-Wall Carton',9500,'Monthly, 6 week lead time','Double wall BC flute, 32 ECT',59.60),
  (17,'SKU-017','Moisture Resistant Box',6500,'Monthly, 6 week lead time','Wax-free moisture barrier coating',74.10),
  (18,'SKU-018','Automotive Component Box',5200,'Monthly, 8 week lead time','5-ply, 250 GSM, 40kg load rating',96.30),
  (19,'SKU-019','Electronics Packaging Box',13000,'Fortnightly, 5 week lead time','Anti-static liner, foam insert slot',52.80),
  (20,'SKU-020','Pharmaceutical Transport Box',7800,'Monthly, 7 week lead time','GMP compliant, tamper evident seal',81.90),
  (21,'SKU-021','Retail Display Box',10500,'Monthly, 6 week lead time','4-colour print, shelf-ready design',47.60),
  (22,'SKU-022','Flat-Pack Carton',26000,'Weekly, 4 week lead time','3-ply, flat shipped, auto-lock base',19.80),
  (23,'SKU-023','Small Parcel Box',45000,'Weekly, 3 week lead time','3-ply, 180x140x90mm',16.30),
  (24,'SKU-024','Medium Parcel Box',33000,'Weekly, 3 week lead time','3-ply, 280x200x140mm',23.40),
  (25,'SKU-025','Large Parcel Box',19000,'Fortnightly, 4 week lead time','3-ply, 400x300x200mm',31.60),
  (26,'SKU-026','Industrial Packaging Box',4300,'Monthly, 8 week lead time','7-ply, 60kg load rating',128.50),
  (27,'SKU-027','Custom Die-Cut Carton',6100,'Monthly, 7 week lead time','Bespoke die, 3-ply, matte lamination',58.20),
  (28,'SKU-028','Printed Retail Carton',14500,'Monthly, 6 week lead time','350 GSM, 5-colour offset print',36.70),
  (29,'SKU-029','Reinforced Shipping Carton',8700,'Monthly, 6 week lead time','5-ply with corner reinforcement',66.90),
  (30,'SKU-030','Export Grade Carton',10200,'Monthly, 7 week lead time','5-ply, humidity resistant, export spec',71.30)
),
ins_items AS (
  INSERT INTO public.line_items (rfx_id, sku, description, quantity, unit, delivery_requirement, specifications, sort_order)
  SELECT r.id, b.sku, b.descr, b.qty, 'piece', b.del, b.spec, b.ord
  FROM base b CROSS JOIN new_rfx r
  RETURNING id
),
vend(ord, name, short_name, factor) AS (
  VALUES
  (1,'PackPro Industries','PackPro',1.00),
  (2,'BoxMate Solutions','BoxMate',0.965),
  (3,'CorrugateX','CorrugateX',1.015),
  (4,'EcoBox Packaging','EcoBox',1.055),
  (5,'PrimePack Industries','PrimePack',0.945)
),
ins_vendors AS (
  INSERT INTO public.vendors (rfx_id, name, short_name, status, sort_order)
  SELECT r.id, v.name, v.short_name, 'Responded', v.ord
  FROM vend v CROSS JOIN new_rfx r
  RETURNING id, short_name
),
p AS (
  SELECT b.ord, b.sku, b.descr, b.qty,
    round((b.price * 1.00 * (1 + ((b.ord * 7) % 11 - 5)::numeric / 100))::numeric, 2) AS packpro,
    round((b.price * 0.965 * (1 + ((b.ord * 5) % 9 - 4)::numeric / 100))::numeric, 2) AS boxmate,
    round((b.price * 1.015 * (1 + ((b.ord * 3) % 7 - 3)::numeric / 100))::numeric, 2) AS corrugatex,
    round((b.price * 1.055 * (1 + ((b.ord * 11) % 13 - 6)::numeric / 100))::numeric, 2) AS ecobox,
    round((b.price * 0.945 * (1 + ((b.ord * 13) % 15 - 7)::numeric / 100))::numeric, 2) AS primepack
  FROM base b
),
docs AS (
  SELECT
    'PackPro' AS short_name,
    'XLSX' AS source_type,
    'PackPro_RateCard_FY27.xlsx' AS source_file,
    'PACKPRO INDUSTRIES — QUOTATION SHEET (Sheet1: FY27 Rates)' || chr(10) ||
    'RFx: RFx-2026-014 | Currency: INR | Basis: per piece, ex-works Bhiwandi' || chr(10) ||
    'SKU | Item | Annual Qty | Rate' || chr(10) ||
    (SELECT string_agg(format('%s | %s | %s pcs | INR %s /piece', sku, descr, qty, packpro), chr(10) ORDER BY ord) FROM p) || chr(10) ||
    'Freight: included up to 200 km. Payment: 45 days.' AS raw_content
  UNION ALL
  SELECT 'BoxMate', 'PDF', 'BoxMate_Quote.pdf',
    'BoxMate Solutions Pvt Ltd' || chr(10) || 'Commercial Offer — Corrugated Packaging FY27 (Page 1 of 3)' || chr(10) ||
    'All rates INR. Rates marked /100 pcs are quoted per hundred pieces as per our standard pack.' || chr(10) ||
    (SELECT string_agg(
        CASE WHEN ord % 5 = 0
          THEN format('%s  %s ....... Rs %s / 100 pieces', sku, descr, to_char(boxmate*100, 'FM999999.00'))
          ELSE format('%s  %s ....... Rs %s per piece', sku, descr, boxmate) END,
        chr(10) ORDER BY ord)
     FROM p WHERE sku NOT IN ('SKU-017','SKU-023','SKU-028')) || chr(10) ||
    'Note: SKU-017, SKU-023 and SKU-028 are outside our current manufacturing scope and are not quoted.' || chr(10) ||
    'Freight extra at actuals. Validity 60 days.'
  UNION ALL
  SELECT 'CorrugateX', 'DOCX', 'CorrugateX_Response.docx',
    'CorrugateX — Response to RFx-2026-014' || chr(10) ||
    'Note: Our export division quotes selected lines in USD. Balance lines in INR.' || chr(10) ||
    (SELECT string_agg(
        CASE WHEN ord % 4 = 1
          THEN format('%s — %s: $%s / unit', sku, descr, to_char(corrugatex/83.10, 'FM990.00'))
          ELSE format('%s — %s: Rs. %s per piece', sku, descr, corrugatex) END,
        chr(10) ORDER BY ord) FROM p) || chr(10) ||
    'USD lines to be converted at prevailing RBI reference rate on PO date.'
  UNION ALL
  SELECT 'EcoBox', 'IMAGE', 'EcoBox_RateCard_photo.jpg',
    '[OCR TEXT — photographed rate card, moderate image noise]' || chr(10) ||
    'ECOBOX PACKAGING :: FY27 RATE CARD (recycled kraft)' || chr(10) ||
    (SELECT string_agg(
        CASE
          WHEN ord = 5 THEN format('%s  %s   RS 4,000 / BOX', sku, upper(descr))
          WHEN ord = 13 THEN format('%s  %s   ~RS %s (approx, subject to board cost)', sku, upper(descr), ecobox)
          WHEN ord = 26 THEN format('%s  %s   RS %s / ??  [smudged]', sku, upper(descr), ecobox)
          ELSE format('%s  %s   RS %s /PC', sku, upper(descr), ecobox) END,
        chr(10) ORDER BY ord) FROM p) || chr(10) ||
    'ALL RATES EX WORKS. GST EXTRA. *handwritten: rates negotiable on annual commit*'
  UNION ALL
  SELECT 'PrimePack', 'EMAIL', 'PrimePack_reply_email.txt',
    'From: sales@primepack.in' || chr(10) || 'Subject: Re: RFx-2026-014 Corrugated Packaging FY27' || chr(10) || chr(10) ||
    'Hi Procurement team,' || chr(10) || chr(10) ||
    (SELECT format('Thanks for the enquiry. Quick numbers: 5-ply medium is Rs %s each, 5-ply small is Rs %s. 3-ply small works out to Rs %s and the e-commerce shipping box we can hold at Rs %s given the volumes.',
        (SELECT primepack FROM p WHERE ord=5), (SELECT primepack FROM p WHERE ord=4),
        (SELECT primepack FROM p WHERE ord=1), (SELECT primepack FROM p WHERE ord=10))) || chr(10) || chr(10) ||
    'Rest is broadly same as last year, per the attached FY26 contract extract below:' || chr(10) ||
    (SELECT string_agg(format('%s %s - Rs %s', sku, descr, primepack), chr(10) ORDER BY ord)
       FROM p WHERE ord NOT IN (1,4,5,10,11,30)) || chr(10) || chr(10) ||
    'We are not bidding the pizza carton this year and the export grade carton is on hold pending board supply.' || chr(10) ||
    'Freight extra. Happy to discuss.' || chr(10) || 'Regards, Anil'
)
, ins_resp AS (
  INSERT INTO public.vendor_responses (rfx_id, vendor_id, source_type, source_file, raw_content)
  SELECT r.id, iv.id, d.source_type, d.source_file, d.raw_content
  FROM docs d
  JOIN ins_vendors iv ON iv.short_name = d.short_name
  CROSS JOIN new_rfx r
  RETURNING id
),
q(qord, question) AS (
  VALUES
  (1,'ISO 9001 certification?'),
  (2,'Minimum 3 years manufacturing experience?'),
  (3,'Monthly production capacity above required volume?'),
  (4,'Defect rate below 2%?'),
  (5,'FSC certification?'),
  (6,'Can supplier meet required delivery timeline?'),
  (7,'Do you have automated quality inspection?')
),
answers(short_name, qord, response, pass_fail, evidence) AS (
  VALUES
  ('PackPro',1,'Yes — ISO 9001:2015, valid to Mar 2028',true,'Certificate PP-ISO-9001 attached'),
  ('PackPro',2,'Yes — 18 years',true,'Company profile, page 2'),
  ('PackPro',3,'Yes — 4.2M pcs/month',true,'Capacity statement'),
  ('PackPro',4,'Yes — 0.8% trailing 12 months',true,'QA report FY26'),
  ('PackPro',5,'Yes — FSC Mix credit',true,'FSC-C114562'),
  ('PackPro',6,'Yes — 4 week standard lead time',true,'Commercial terms'),
  ('PackPro',7,'Yes — inline vision inspection',true,'Plant audit note'),
  ('BoxMate',1,'Certification renewal in progress',false,'Expired certificate dated Jan 2026'),
  ('BoxMate',2,'Yes — 7 years',true,'Company profile'),
  ('BoxMate',3,'Yes — 2.6M pcs/month',true,'Capacity statement'),
  ('BoxMate',4,'2.9% trailing 12 months',false,'QA summary sheet'),
  ('BoxMate',5,'No',false,'Questionnaire response'),
  ('BoxMate',6,'Yes — 5 week lead time',true,'Commercial terms'),
  ('BoxMate',7,'Manual sampling only',false,'Questionnaire response'),
  ('CorrugateX',1,'Yes — ISO 9001:2015',true,'Certificate CX-9001'),
  ('CorrugateX',2,'Yes — 11 years',true,'Company profile'),
  ('CorrugateX',3,'Yes — 3.1M pcs/month',true,'Capacity statement'),
  ('CorrugateX',4,'Yes — 1.4%',true,'QA report FY26'),
  ('CorrugateX',5,'Yes — FSC 100%',true,'FSC-C201884'),
  ('CorrugateX',6,'Yes — 4-6 weeks depending on line',true,'Commercial terms'),
  ('CorrugateX',7,'Yes — automated ECT testing',true,'Plant audit note'),
  ('EcoBox',1,'No — ISO 14001 only',false,'Certificate list'),
  ('EcoBox',2,'Yes — 5 years',true,'Company profile'),
  ('EcoBox',3,'1.1M pcs/month against 1.9M required',false,'Capacity statement'),
  ('EcoBox',4,'3.6%',false,'QA summary sheet'),
  ('EcoBox',5,'Yes — FSC Recycled',true,'FSC-C339110'),
  ('EcoBox',6,'Partially — 7-8 weeks on 5-ply lines',false,'Email clarification'),
  ('EcoBox',7,'No',false,'Questionnaire response'),
  ('PrimePack',1,'Yes — ISO 9001:2015',true,'Certificate PR-9001'),
  ('PrimePack',2,'Yes — 22 years',true,'Company profile'),
  ('PrimePack',3,'Yes — 3.8M pcs/month',true,'Capacity statement'),
  ('PrimePack',4,'Yes — 1.1%',true,'QA report FY26'),
  ('PrimePack',5,'Yes — FSC Mix',true,'FSC-C778210'),
  ('PrimePack',6,'Yes — 4 week lead time',true,'Commercial terms'),
  ('PrimePack',7,'Yes — automated inspection on 3 lines',true,'Plant audit note')
),
ins_q AS (
  INSERT INTO public.questionnaire_responses (rfx_id, vendor_id, question, response, pass_fail, evidence, sort_order)
  SELECT r.id, iv.id, q.question, a.response, a.pass_fail, a.evidence, q.qord
  FROM answers a
  JOIN q ON q.qord = a.qord
  JOIN ins_vendors iv ON iv.short_name = a.short_name
  CROSS JOIN new_rfx r
  RETURNING id
)
INSERT INTO public.audit_log (rfx_id, actor, event, detail)
SELECT r.id, x.actor, x.event, x.detail
FROM new_rfx r
CROSS JOIN (VALUES
  ('Sudeep Mishra','RFx created','RFx-2026-014 Corrugated Packaging — FY27 Sourcing Event, 30 line items'),
  ('System','RFx issued to vendors','5 vendors invited: PackPro, BoxMate, CorrugateX, EcoBox, PrimePack'),
  ('System','Vendor responses received','5 / 5 responses received across XLSX, PDF, DOCX, image and email formats')
) AS x(actor, event, detail);
