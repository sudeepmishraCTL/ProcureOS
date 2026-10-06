import type { FullData } from "./data";

export type RfxStatus =
  | "Draft"
  | "Ready to Send"
  | "Sent"
  | "Awaiting Responses"
  | "Partially Responded"
  | "Responses Received"
  | "Processing Responses"
  | "Analysis Ready"
  | "Award Pending"
  | "Awarded";

export type RfxProgress = {
  status: RfxStatus;
  invited: number;
  responded: number;
  responses: number;
  processed: number;
  expectedLines: number;
  extracted: number;
  needsReview: number;
  missingFields: string[];
};

/**
 * The RFx lifecycle is derived from real workflow state, never picked by hand.
 * Responses, extractions, scenarios and awards all feed it.
 */
export function rfxProgress(d: FullData): RfxProgress {
  const invited = d.vendors.length;
  const respondedVendors = new Set(d.responses.map((r) => r.vendor_id));
  const responded = [...respondedVendors].filter((id) => d.vendors.some((v) => v.id === id)).length;
  const processed = d.responses.filter((r) => r.processed_at).length;
  const expectedLines = d.lineItems.length * invited;
  const live = d.quotes.filter((q) => q.status === "extracted");
  const extracted = live.filter((q) => q.normalized_value != null).length;
  const needsReview = live.filter((q) => q.requires_review).length + d.unmatched.length;

  const missingFields: string[] = [];
  if (!d.rfx.name?.trim()) missingFields.push("a name for this request");
  if (!d.rfx.category?.trim()) missingFields.push("what kind of thing you are buying");
  if (!d.rfx.currency?.trim()) missingFields.push("the currency");
  if (!d.rfx.due_date?.trim()) missingFields.push("a deadline for supplier replies");
  if (!d.rfx.description?.trim()) missingFields.push("a short description of what you are buying");
  if (d.lineItems.length === 0) missingFields.push("at least one item");
  if (d.questions.length === 0) missingFields.push("at least one supplier requirement");
  if (invited === 0) missingFields.push("at least one supplier to invite");

  const sent = Boolean(d.rfx.sent_at) || d.responses.length > 0;

  let status: RfxStatus;
  if (d.awards.length > 0) status = "Awarded";
  else if (d.scenarios.length > 0 && extracted > 0) status = "Award Pending";
  else if (d.responses.length > 0 && processed === d.responses.length) status = "Analysis Ready";
  else if (processed > 0) status = "Processing Responses";
  else if (invited > 0 && responded >= invited) status = "Responses Received";
  else if (responded > 0) status = "Partially Responded";
  else if (sent) status = "Awaiting Responses";
  else if (missingFields.length === 0) status = "Ready to Send";
  else status = "Draft";

  return {
    status,
    invited,
    responded,
    responses: d.responses.length,
    processed,
    expectedLines,
    extracted,
    needsReview,
    missingFields,
  };
}

export function statusTone(status: RfxStatus): "neutral" | "primary" | "warning" | "positive" {
  if (status === "Draft") return "neutral";
  if (status === "Awarded" || status === "Analysis Ready") return "positive";
  if (status === "Processing Responses" || status === "Award Pending") return "warning";
  return "primary";
}
