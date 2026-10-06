export type LineItem = {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  delivery_requirement: string | null;
  specifications: string | null;
  sort_order: number;
};

export type Vendor = { id: string; name: string; short_name: string; sort_order: number };

export type Quote = {
  id: string;
  vendor_id: string;
  line_item_id: string;
  normalized_value: number | null;
  original_text: string | null;
  original_unit: string | null;
  original_currency: string | null;
  confidence: string;
  requires_review: boolean;
  status: string;
  issue_type: string | null;
  issue_note: string | null;
  normalization_note: string | null;
  original_value: number | null;
  source_ref: string | null;
  version?: number | null;
  conflict_note?: string | null;
  previous_value?: number | null;
  previous_source?: string | null;
  vendor_response_id?: string | null;
  superseded_at?: string | null;
};

export type QuestionDef = {
  id: string;
  question: string;
  guidance: string | null;
  mandatory: boolean;
  sort_order: number;
};

/** pass | partial | fail | not_answered */
export type QuestionnaireRow = {
  vendor_id: string;
  question: string;
  response: string;
  pass_fail: boolean;
  status?: string | null;
  evidence?: string | null;
  source?: string | null;
  confidence?: string | null;
  source_ref?: string | null;
  verification?: string | null;
  verification_note?: string | null;
};

export type Dataset = {
  rfx: {
    id: string;
    code: string;
    name: string;
    category: string;
    currency: string;
    fx_rate: number;
    status: string;
    created_at: string;
    description?: string | null;
    due_date?: string | null;
    is_active?: boolean | null;
    event_type?: string | null;
    payment_terms?: string | null;
    quote_validity_days?: number | null;
    tax_treatment?: string | null;
    delivery_location?: string | null;
    incoterms?: string | null;
    lead_time?: string | null;
    quality_cert_required?: boolean | null;
    questionnaire_required?: boolean | null;
    docs_required?: boolean | null;
    min_experience?: string | null;
    sent_at?: string | null;
  };
  lineItems: LineItem[];
  vendors: Vendor[];
  quotes: Quote[];
  questionnaire: QuestionnaireRow[];
  questions: QuestionDef[];
};

export type Constraints = {
  excludeFailedQuality?: boolean;
  excludeVendors?: string[];
  maxVendors?: number;
  includeLowConfidence?: boolean;
  /** Drop vendors quoting fewer than this share (0-100) of the RFx lines. */
  minCoverage?: number;
  /** Restrict the scenario to a subset of SKUs. */
  onlySkus?: string[];
};

export function statusOf(row: QuestionnaireRow | undefined): string {
  if (!row) return "not_answered";
  if (row.status) return row.status;
  return row.pass_fail ? "pass" : "fail";
}

export type QualityResult = {
  pass: boolean;
  failed: string[];
  partial: string[];
  unanswered: string[];
};

/** A vendor qualifies when no MANDATORY criterion is failed or unanswered. */
export function qualityPass(d: Dataset): Record<string, QualityResult> {
  const map: Record<string, QualityResult> = {};
  const defs: Array<{ question: string; mandatory: boolean }> = d.questions?.length
    ? d.questions.map((q) => ({ question: q.question, mandatory: q.mandatory }))
    : [...new Set(d.questionnaire.map((q) => q.question))].map((question) => ({
        question,
        mandatory: true,
      }));

  for (const v of d.vendors) {
    const failed: string[] = [];
    const partial: string[] = [];
    const unanswered: string[] = [];
    for (const def of defs) {
      const row = d.questionnaire.find((q) => q.vendor_id === v.id && q.question === def.question);
      const st = statusOf(row);
      if (st === "fail") failed.push(def.question);
      else if (st === "partial") partial.push(def.question);
      else if (st === "not_answered") unanswered.push(def.question);
    }
    const mandatory = new Set(defs.filter((x) => x.mandatory).map((x) => x.question));
    const blocking = [...failed, ...unanswered].filter((q) => mandatory.has(q));
    map[v.id] = { pass: blocking.length === 0, failed, partial, unanswered };
  }
  return map;
}

export function vendorCoverage(d: Dataset) {
  const total = d.lineItems.length || 1;
  const map: Record<string, { quoted: number; pct: number; review: number }> = {};
  for (const v of d.vendors) {
    const rows = d.quotes.filter((q) => q.vendor_id === v.id && q.normalized_value != null);
    map[v.id] = {
      quoted: rows.length,
      pct: Math.round((rows.length / total) * 100),
      review: d.quotes.filter((q) => q.vendor_id === v.id && q.requires_review).length,
    };
  }
  return map;
}

export type Allocation = {
  sku: string;
  description: string;
  quantity: number;
  vendorId: string | null;
  vendorName: string;
  unitPrice: number | null;
  lineValue: number;
  confidence: string;
  reason: string;
};

/** Deterministic sourcing maths. The analyst reasons over these computed facts. */
export function computeScenarios(d: Dataset, c: Constraints = {}) {
  const pass = qualityPass(d);
  const coverage = vendorCoverage(d);
  const vendorById = Object.fromEntries(d.vendors.map((v) => [v.id, v]));

  const droppedForCoverage = c.minCoverage
    ? d.vendors.filter((v) => (coverage[v.id]?.pct ?? 0) < c.minCoverage!).map((v) => v.short_name)
    : [];

  const eligible = d.vendors.filter(
    (v) =>
      !(c.excludeVendors ?? []).includes(v.id) &&
      (!c.excludeFailedQuality || pass[v.id]?.pass) &&
      (!c.minCoverage || (coverage[v.id]?.pct ?? 0) >= c.minCoverage),
  );

  const lineItems = c.onlySkus?.length
    ? d.lineItems.filter((l) => c.onlySkus!.includes(l.sku))
    : d.lineItems;

  const usable = (q: Quote) =>
    q.normalized_value != null &&
    q.status === "extracted" &&
    (c.includeLowConfidence || q.confidence !== "low");

  const priceOf = (vendorId: string, lineId: string) => {
    const q = d.quotes.find((x) => x.vendor_id === vendorId && x.line_item_id === lineId);
    return q && usable(q) ? q : null;
  };

  const perLine: Allocation[] = lineItems.map((li) => {
    let best: { v: Vendor; q: Quote } | null = null;
    for (const v of eligible) {
      const q = priceOf(v.id, li.id);
      if (!q) continue;
      if (!best || (q.normalized_value ?? Infinity) < (best.q.normalized_value ?? Infinity)) {
        best = { v, q };
      }
    }
    return {
      sku: li.sku,
      description: li.description,
      quantity: li.quantity,
      vendorId: best?.v.id ?? null,
      vendorName: best?.v.short_name ?? "No compliant quote",
      unitPrice: best?.q.normalized_value ?? null,
      lineValue: best ? (best.q.normalized_value ?? 0) * li.quantity : 0,
      confidence: best?.q.confidence ?? "none",
      reason: best ? "Lowest compliant quote" : "No usable quote from eligible vendors",
    };
  });

  const splitTotal = perLine.reduce((s, l) => s + l.lineValue, 0);

  const singleVendor = d.vendors
    .map((v) => {
      const lines = lineItems.map((li) => priceOf(v.id, li.id));
      const covered = lines.filter(Boolean).length;
      const total = lines.reduce(
        (s, q, i) => s + (q?.normalized_value ?? 0) * (lineItems[i]?.quantity ?? 0),
        0,
      );
      return {
        vendorId: v.id,
        vendor: v.short_name,
        covered,
        missing: lineItems.length - covered,
        total,
        qualityPass: pass[v.id]?.pass ?? false,
        failedQuestions: pass[v.id]?.failed ?? [],
        complete: covered === lineItems.length,
      };
    })
    .sort((a, b) => a.total - b.total);

  const cheapestSingleComplete = singleVendor.filter((s) => s.complete)[0] ?? singleVendor[0];

  // Max-N-vendor scenario: greedily keep the vendors carrying the most value.
  let cappedTotal = splitTotal;
  let cappedVendors = [...new Set(perLine.map((l) => l.vendorId).filter(Boolean))] as string[];
  if (c.maxVendors && cappedVendors.length > c.maxVendors) {
    const value: Record<string, number> = {};
    for (const l of perLine) if (l.vendorId) value[l.vendorId] = (value[l.vendorId] ?? 0) + l.lineValue;
    cappedVendors = Object.entries(value)
      .sort((a, b) => b[1] - a[1])
      .slice(0, c.maxVendors)
      .map(([id]) => id);
    cappedTotal = lineItems.reduce((sum, li) => {
      const prices = cappedVendors
        .map((vid) => priceOf(vid, li.id)?.normalized_value)
        .filter((p): p is number => p != null);
      return sum + (prices.length ? Math.min(...prices) * li.quantity : 0);
    }, 0);
  }

  const needsReview = d.quotes.filter((q) => q.requires_review && q.status === "extracted");
  const usedReviewLines = perLine.filter((l) => {
    if (!l.vendorId) return false;
    const li = lineItems.find((x) => x.sku === l.sku)!;
    const q = d.quotes.find((x) => x.vendor_id === l.vendorId && x.line_item_id === li.id);
    return q?.requires_review;
  });

  return {
    perLine,
    splitTotal,
    singleVendor,
    cheapestSingle: cheapestSingleComplete,
    savingsVsSingle: (cheapestSingleComplete?.total ?? 0) - splitTotal,
    cappedTotal,
    cappedVendors: cappedVendors.map((id) => vendorById[id]?.short_name ?? id),
    eligibleVendors: eligible.map((v) => v.short_name),
    excludedForQuality: d.vendors.filter((v) => !pass[v.id]?.pass).map((v) => v.short_name),
    excludedForCoverage: droppedForCoverage,
    needsReviewCount: needsReview.length,
    reviewLinesInAward: usedReviewLines.map((l) => l.sku),
    unpricedLines: perLine.filter((l) => !l.vendorId).map((l) => l.sku),
    /** Quantity sitting on lines nobody priced. These contribute INR 0 to splitTotal, so the total is incomplete, not cheap. */
    unpricedQuantity: perLine.filter((l) => !l.vendorId).reduce((s, l) => s + l.quantity, 0),
    conflictLines: d.quotes
      .filter((q) => q.status === "extracted" && q.conflict_note)
      .map((q) => d.lineItems.find((l) => l.id === q.line_item_id)?.sku ?? "")
      .filter(Boolean),
    linesConsidered: lineItems.length,
  };
}

export function coverageStats(d: Dataset) {
  const live = d.quotes.filter((q) => q.status === "extracted");
  const expected = d.lineItems.length * d.vendors.length;
  const extracted = live.filter((q) => q.normalized_value != null).length;
  const review = live.filter((q) => q.requires_review).length;
  return {
    expected,
    extracted,
    confident: extracted - review,
    review,
    missing: expected - extracted,
    conflicts: live.filter((q) => q.conflict_note).length,
    unresolved: live.filter((q) => q.normalized_value == null).length,
  };
}
