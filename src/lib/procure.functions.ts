import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Constraints } from "./procure-math";
import type { ContentPart } from "./ai.server";

type ExtractedRow = {
  sku: string;
  original_text: string;
  original_value: number | null;
  original_currency: string;
  original_unit: string;
  normalized_value: number | null;
  normalization_note: string;
  confidence: "high" | "medium" | "low";
  requires_review: boolean;
  issue_type: string | null;
  issue_note: string | null;
  source_ref: string | null;
};

type UnmatchedRow = {
  original_text: string;
  stated_price?: string | null;
  suggested_sku?: string | null;
  match_confidence?: string;
  reason?: string | null;
};

const EXTRACTION_SYSTEM = `You are a procurement document extraction engine for ProcureOS.
You receive ONE raw vendor response document (it may be a spreadsheet dump, a PDF text layer, a Word document, noisy OCR of a photographed rate card, or a free-text email) and the buyer's RFx line items.

Your job: extract each vendor price, match it to an RFx line item, and normalize it to INR per single piece.

HARD RULES
- Never invent a price. If the vendor did not quote a line item, omit that SKU entirely.
- If the vendor quotes per pack (e.g. "Rs 4,200 / 100 pieces"), divide correctly and record the arithmetic in normalization_note.
- If the vendor quotes in USD, convert using the supplied FX rate and record "USD 0.51 x 83.10 = INR 42.38" style working in normalization_note.
- If the pack size is UNKNOWN or ambiguous (e.g. "per box" with no piece count, a smudged/illegible unit, an "approx" price), do NOT guess the conversion: set normalized_value to your best literal reading ONLY if the unit is a single piece, otherwise set normalized_value to null, confidence "low", requires_review true, and explain in issue_note.
- CURRENCY: only state a currency the document actually shows (a symbol, a code, or explicit wording). If a number carries no currency marker anywhere in the document, set original_currency to "UNKNOWN", normalized_value to null, confidence "low", requires_review true, issue_type "currency_unknown". Never assume INR just because the buyer is Indian.
- Prices stated as "same as last year" / referenced from an attached table are acceptable if the table gives an explicit number; set confidence "medium" and say so in normalization_note.
- Approximate or negotiable prices: confidence "medium" or "low" and requires_review true.
- original_text must be the vendor's literal wording for that line, copied from the document.
- UNMATCHED LINES: if the vendor prices something you cannot confidently map to exactly one RFx SKU (different wording, a product not in the catalogue, or two plausible SKUs), do NOT force it into the quotes array. Put it in "unmatched" with your best guess SKU (or null) and the reason. Never map a line to a SKU you are not confident about.

Return ONLY a JSON object, no prose:
{"quotes":[...],"unmatched":[...]}
Each quotes element:
{"sku","original_text","original_value","original_currency","original_unit","normalized_value","normalization_note","confidence","requires_review","issue_type","issue_note","source_ref"}
issue_type is one of: null, "unit_ambiguous", "currency_conversion", "currency_unknown", "low_ocr_confidence", "approximate_price", "inferred_from_prior_contract".
Each unmatched element:
{"original_text","stated_price","suggested_sku","match_confidence","reason"}
match_confidence is "medium" (a likely but unconfirmed match) or "low" (no credible match).`;

export const processVendorResponse = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ responseId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { serverClient, loadDataset } = await import("./procure.server");
    const { callAI, parseJSON } = await import("./ai.server");
    const sb = serverClient();

    const { data: resp } = await sb
      .from("vendor_responses")
      .select("*")
      .eq("id", data.responseId)
      .maybeSingle();
    if (!resp) throw new Error("Vendor response not found");

    const ds = await loadDataset(sb);
    const vendor = ds.vendors.find((v) => v.id === resp.vendor_id);

    const catalogue = ds.lineItems
      .map((l) => `${l.sku} | ${l.description} | qty ${l.quantity} ${l.unit}`)
      .join("\n");

    const prompt = `RFx: ${ds.rfx.code}: ${ds.rfx.name}
Target currency: INR. Target unit: 1 piece. FX rate: 1 USD = ${ds.rfx.fx_rate} INR. 1 EUR = ${(Number(ds.rfx.fx_rate) * 1.08).toFixed(2)} INR.
Source document type: ${resp.source_type}. File: ${resp.source_file}. Response type: ${resp.response_type ?? "Quote / RFQ Response"}.

RFX LINE ITEMS
${catalogue}

VENDOR DOCUMENT (${vendor?.name})
-----
${resp.raw_content}
-----`;

    const parts: ContentPart[] = [{ type: "text", text: prompt }];
    if (resp.image_data) {
      parts.push({ type: "text", text: "The vendor document is the attached image. Read it visually; if a value is illegible, flag it rather than guessing." });
      parts.push({ type: "image_url", image_url: { url: resp.image_data } });
    }

    const raw = await callAI([
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "user", content: resp.image_data ? parts : prompt },
    ]);

    const parsed = parseJSON<ExtractedRow[] | { quotes?: ExtractedRow[]; unmatched?: UnmatchedRow[] }>(raw);
    const rows = (Array.isArray(parsed) ? parsed : (parsed.quotes ?? [])).filter((r) => r && r.sku);
    const modelUnmatched = Array.isArray(parsed) ? [] : (parsed.unmatched ?? []);
    const bySku = Object.fromEntries(ds.lineItems.map((l) => [l.sku, l]));

    /** Lines the model priced but could not map to a catalogue SKU stay visible instead of being dropped. */
    const unmatched: UnmatchedRow[] = [
      ...modelUnmatched.filter((u) => u && u.original_text),
      ...rows
        .filter((r) => !bySku[r.sku])
        .map((r) => ({
          original_text: r.original_text ?? r.sku,
          stated_price: r.original_value != null ? `${r.original_currency ?? ""} ${r.original_value}`.trim() : null,
          suggested_sku: r.sku ?? null,
          match_confidence: "low",
          reason: `Model returned SKU "${r.sku}", which is not in the RFx catalogue`,
        })),
    ];

    const payload = rows
      .filter((r) => bySku[r.sku])
      .map((r) => {
        const currency = (r.original_currency ?? "").trim().toUpperCase() || "UNKNOWN";
        const unknownCurrency = currency === "UNKNOWN" || currency === "NONE" || currency === "?";
        return {
          rfx_id: ds.rfx.id,
          vendor_id: resp.vendor_id,
          vendor_response_id: resp.id,
          line_item_id: bySku[r.sku]!.id,
          original_text: r.original_text ?? null,
          original_value: r.original_value ?? null,
          original_currency: unknownCurrency ? "UNKNOWN" : currency,
          original_unit: r.original_unit ?? "piece",
          normalized_value: unknownCurrency ? null : (r.normalized_value ?? null),
          normalized_currency: "INR",
          normalized_unit: "piece",
          normalization_note: unknownCurrency
            ? "No currency stated in the document, so no conversion was applied"
            : (r.normalization_note ?? null),
          confidence: unknownCurrency
            ? "low"
            : ["high", "medium", "low"].includes(r.confidence)
              ? r.confidence
              : "medium",
          requires_review: unknownCurrency || Boolean(r.requires_review) || r.normalized_value == null,
          issue_type: unknownCurrency ? "currency_unknown" : (r.issue_type ?? null),
          issue_note: unknownCurrency
            ? "Currency not stated by the vendor. Needs review before this price can be compared."
            : (r.issue_note ?? null),
          status: "extracted",
          source_ref: r.source_ref ?? resp.source_file,
        };
      });

    /** One vendor can only hold one active quote per line, so keep the first row per line item. */
    const seenLines = new Set<string>();
    const deduped = payload.filter((p) => {
      if (seenLines.has(p.line_item_id)) return false;
      seenLines.add(p.line_item_id);
      return true;
    });
    payload.length = 0;
    payload.push(...deduped);

    let conflicts = 0;
    if (payload.length) {
      const { data: prior } = await sb
        .from("quotes")
        .select("id, line_item_id, normalized_value, version, source_ref, status")
        .eq("vendor_id", resp.vendor_id)
        .eq("status", "extracted")
        .in("line_item_id", payload.map((p) => p.line_item_id));

      const priorByLine = Object.fromEntries((prior ?? []).map((p) => [p.line_item_id, p]));

      const versioned = payload.map((p) => {
        const old = priorByLine[p.line_item_id];
        if (!old) return { ...p, version: 1, conflict_note: null, previous_value: null, previous_source: null };
        const changed =
          old.normalized_value != null &&
          p.normalized_value != null &&
          Math.abs(Number(old.normalized_value) - Number(p.normalized_value)) > 0.001;
        if (changed) conflicts += 1;
        return {
          ...p,
          version: (old.version ?? 1) + 1,
          previous_value: old.normalized_value,
          previous_source: old.source_ref ?? null,
          conflict_note: changed
            ? `Conflicting price. Earlier submission (${old.source_ref ?? "previous document"}) quoted INR ${Number(
                old.normalized_value,
              ).toFixed(2)}; this submission (${resp.source_file}) quotes INR ${Number(p.normalized_value).toFixed(2)}. Latest version is in use.`
            : null,
        };
      });

      /** Earlier quotes are kept as a superseded version rather than deleted, so the history stays auditable. */
      if (prior?.length) {
        await sb
          .from("quotes")
          .update({ status: "superseded", superseded_at: new Date().toISOString() })
          .in("id", prior.map((p) => p.id));
      }

      const { error } = await sb.from("quotes").insert(versioned);
      if (error) throw new Error(error.message);
    }

    if (unmatched.length) {
      await sb.from("unmatched_lines").insert(
        unmatched.map((u) => ({
          rfx_id: ds.rfx.id,
          vendor_id: resp.vendor_id,
          vendor_response_id: resp.id,
          original_text: String(u.original_text).slice(0, 600),
          stated_price: u.stated_price ?? null,
          suggested_sku: u.suggested_sku && bySku[u.suggested_sku] ? u.suggested_sku : null,
          match_confidence: ["medium", "low"].includes(u.match_confidence ?? "") ? u.match_confidence : "low",
          reason: u.reason ?? null,
          status: "open",
        })),
      );
    }

    const reviewCount = payload.filter((p) => p.requires_review).length;
    const confidence =
      payload.length === 0
        ? 0
        : Math.round(
            ((payload.length - reviewCount * 0.55) / ds.lineItems.length) * 100 * 10,
          ) / 10;

    await sb
      .from("vendor_responses")
      .update({
        processed_at: new Date().toISOString(),
        extraction_confidence: Math.max(0, Math.min(100, confidence)),
        extraction_notes: `${payload.length}/${ds.lineItems.length} lines extracted, ${reviewCount} require review${
          conflicts ? `, ${conflicts} conflicting with an earlier submission` : ""
        }${unmatched.length ? `, ${unmatched.length} line(s) could not be matched` : ""}`,
      })
      .eq("id", resp.id);

    const fxLines = payload.filter(
      (p) => (p.original_currency ?? "INR") !== "INR" && p.original_currency !== "UNKNOWN",
    ).length;
    const packLines = payload.filter(
      (p) =>
        p.original_value != null &&
        p.normalized_value != null &&
        Math.abs(p.original_value - p.normalized_value) > 0.01 &&
        (p.original_currency ?? "INR") === "INR",
    ).length;

    await sb.from("audit_log").insert([
      {
        rfx_id: ds.rfx.id,
        actor: "ProcureOS AI",
        event: `Extracted ${vendor?.short_name ?? "vendor"} response`,
        detail: `${resp.source_type} · ${resp.source_file} · ${payload.length}/${ds.lineItems.length} lines read · ${reviewCount} flagged for review`,
      },
      {
        rfx_id: ds.rfx.id,
        actor: "ProcureOS AI",
        event: `Normalized ${vendor?.short_name ?? "vendor"} prices to INR/piece`,
        detail: `${packLines} pack-size conversion(s), ${fxLines} currency conversion(s) at ₹${ds.rfx.fx_rate}/USD, ${payload.filter((p) => p.normalized_value == null).length} value(s) left unresolved`,
      },
    ]);

    if (conflicts || unmatched.length) {
      await sb.from("audit_log").insert({
        rfx_id: ds.rfx.id,
        actor: "ProcureOS AI",
        event: `Flagged ${vendor?.short_name ?? "vendor"} submission for buyer review`,
        detail: `${conflicts} price(s) conflict with an earlier submission (previous versions kept, latest in use), ${unmatched.length} priced line(s) could not be matched to an RFx item`,
      });
    }

    return {
      vendor: vendor?.short_name ?? "",
      extracted: payload.length,
      review: reviewCount,
      conflicts,
      unmatched: unmatched.length,
      confidence: Math.max(0, Math.min(100, confidence)),
    };
  });

/** Registers an uploaded (or pasted) vendor submission, then hands it to the same extraction pipeline. */
export const ingestVendorResponse = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        vendorId: z.string().optional(),
        newVendorName: z.string().optional(),
        responseType: z.string(),
        files: z
          .array(
            z.object({
              name: z.string(),
              kind: z.string(),
              text: z.string().default(""),
              imageDataUrl: z.string().optional(),
            }),
          )
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { serverClient } = await import("./procure.server");
    const sb = serverClient();

    const { activeRfx } = await import("./procure.server");
    const rfx = await activeRfx(sb);
    if (!rfx) throw new Error("No RFx found");

    let vendorId = data.vendorId;
    let vendorName = "";
    if (!vendorId) {
      const name = (data.newVendorName ?? "").trim();
      if (!name) throw new Error("Choose an existing vendor or enter a new vendor name");
      const { count } = await sb
        .from("vendors")
        .select("id", { count: "exact", head: true })
        .eq("rfx_id", rfx.id);
      const { data: created, error } = await sb
        .from("vendors")
        .insert({
          rfx_id: rfx.id,
          name,
          short_name: name.split(/\s+/)[0]!.slice(0, 14),
          status: "Responded",
          sort_order: (count ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      vendorId = created.id;
      vendorName = created.name;
    } else {
      const { data: v } = await sb.from("vendors").select("name").eq("id", vendorId).maybeSingle();
      vendorName = v?.name ?? "Vendor";
    }

    const rows = data.files.map((f) => ({
      rfx_id: rfx.id,
      vendor_id: vendorId!,
      source_type: f.kind,
      source_file: f.name,
      raw_content: f.text || "[No text layer, document read visually from the attached image]",
      image_data: f.imageDataUrl ?? null,
      response_type: data.responseType,
      is_demo: false,
    }));

    const { data: inserted, error } = await sb.from("vendor_responses").insert(rows).select("id, source_file, vendor_id");
    if (error) throw new Error(error.message);

    await sb.from("audit_log").insert({
      rfx_id: rfx.id,
      actor: "Sudeep Mishra",
      event: `Uploaded ${data.responseType.toLowerCase()} for ${vendorName}`,
      detail: data.files.map((f) => `${f.name} (${f.kind})`).join(", "),
    });

    return { vendorName, responses: inserted ?? [] };
  });

/**
 * Removes one supplier file and everything read out of it: prices, answers to your
 * questions, unmatched lines and the stored original. Lets a buyer re-upload a
 * corrected file without touching the other suppliers.
 */
export const deleteVendorResponse = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ responseId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { serverClient } = await import("./procure.server");
    const sb = serverClient();

    const { data: resp } = await sb
      .from("vendor_responses")
      .select("id, rfx_id, vendor_id, source_file, file_path")
      .eq("id", data.responseId)
      .maybeSingle();
    if (!resp) throw new Error("That supplier file no longer exists");

    const { data: vendor } = await sb.from("vendors").select("name").eq("id", resp.vendor_id).maybeSingle();

    await sb.from("quotes").delete().eq("vendor_response_id", resp.id);
    await sb.from("unmatched_lines").delete().eq("vendor_response_id", resp.id);

    // Any remaining files from this supplier in this event.
    const { data: others } = await sb
      .from("vendor_responses")
      .select("id")
      .eq("rfx_id", resp.rfx_id)
      .eq("vendor_id", resp.vendor_id)
      .neq("id", resp.id);

    if (!others || others.length === 0) {
      await sb.from("quotes").delete().eq("rfx_id", resp.rfx_id).eq("vendor_id", resp.vendor_id);
      await sb.from("unmatched_lines").delete().eq("rfx_id", resp.rfx_id).eq("vendor_id", resp.vendor_id);
      await sb
        .from("questionnaire_responses")
        .delete()
        .eq("rfx_id", resp.rfx_id)
        .eq("vendor_id", resp.vendor_id);
      await sb.from("vendors").update({ status: "Awaiting response" }).eq("id", resp.vendor_id);
    }

    if (resp.file_path) {
      await sb.storage.from("vendor-files").remove([resp.file_path]);
    }
    await sb.from("vendor_responses").delete().eq("id", resp.id);

    await sb.from("audit_log").insert({
      rfx_id: resp.rfx_id,
      actor: "Sudeep Mishra",
      event: `Removed a supplier file for ${vendor?.name ?? "a supplier"}`,
      detail: `${resp.source_file} and everything read from it were deleted`,
    });

    return { ok: true, vendor: vendor?.name ?? "Supplier", file: resp.source_file };
  });

/** Restores the seeded 5-vendor / 30-line demo so the flow can be replayed from scratch. */
export const resetDemoData = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clearExtractions: z.boolean().default(true) }).parse(d))
  .handler(async ({ data }) => {
    const { serverClient } = await import("./procure.server");
    const sb = serverClient();
    const { activeRfx } = await import("./procure.server");
    const rfx = await activeRfx(sb);
    if (!rfx) throw new Error("No RFx found");

    await sb.from("vendor_responses").delete().eq("rfx_id", rfx.id).eq("is_demo", false);

    const { data: demoVendorIds } = await sb
      .from("vendor_responses")
      .select("vendor_id")
      .eq("rfx_id", rfx.id);
    const keep = new Set((demoVendorIds ?? []).map((r) => r.vendor_id));
    const { data: vendors } = await sb.from("vendors").select("id").eq("rfx_id", rfx.id);
    const drop = (vendors ?? []).map((v) => v.id).filter((id) => !keep.has(id));
    if (drop.length) await sb.from("vendors").delete().in("id", drop);

    if (data.clearExtractions) {
      await sb.from("quotes").delete().eq("rfx_id", rfx.id);
      await sb
        .from("vendor_responses")
        .update({ processed_at: null, extraction_confidence: null, extraction_notes: null })
        .eq("rfx_id", rfx.id);
    }

    await sb.from("audit_log").insert({
      rfx_id: rfx.id,
      actor: "Sudeep Mishra",
      event: "Loaded demo vendor responses",
      detail: "Seeded 5 vendor submissions restored; extractions cleared for a fresh run",
    });

    return { ok: true };
  });

const ANALYST_SYSTEM = `You are a business analyst helping a smart business buyer in India who is NOT a procurement specialist. This is a purchase worth crores, so be professional and precise, but speak plain English.

HOW TO WRITE
- Never use em dashes. Use commas, colons or full stops.
- Never use procurement jargon. Banned words and phrases: RFx, RFQ, normalization, normalized, extraction, line item, UOM, MOQ, incoterms, lead time, qualification, compliance, compliant, award, allocation, optimizer, coverage, anomaly, vendor. Say instead: request, made comparable, read from their file, item, unit, minimum order, delivery terms, delivery time, met your requirements, purchase plan, what to buy from whom, how much of your list they priced, unusual price, supplier.
- Never show model scores, percentages of confidence, or internal field names. Say "clear", "mostly clear" or "not fully certain".
- Write as if explaining to a capable colleague who has never bought packaging before.

WHAT TO ANSWER FROM
Use ONLY the supplied data and the figures already calculated for you. Reuse those numbers exactly. Never invent a number.

BE CLEAR ABOUT WHAT KIND OF STATEMENT YOU ARE MAKING
- A fact is something a supplier actually wrote. Say "PackRight quoted ...".
- A calculation is something worked out from those facts. Say "Worked out from ...".
- An assumption is something you had to take for granted. Put it in "assumptions", never in the headline.
- Where you are not sure, say so instead of rounding it into a confident answer.
- If the question cannot be answered simply, challenge it kindly. For example, "who is cheapest" depends on whether
  the buyer wants one supplier or several, and on items nobody priced. Say that first, then give the best answer.

HONESTY RULES
- Never quietly fill in a missing price. Say plainly that the supplier did not quote that item, and that it is not counted as free.
- When a price had to be converted from another currency, or from a box or bundle price, say so.
- Always say what you assumed, and point out any price in your recommendation that was not fully clear.

Return ONLY JSON:
{
 "headline": "the short answer, one sentence",
 "metrics": [{"label":"What this plan costs","value":"INR 11.72L","tone":"primary|positive|warning|neutral"}],
 "body": "2 to 4 sentences of plain English explanation",
 "allocation": [{"vendor":"PackPro","lines":11,"value":"INR 4.21L"}],
 "caveats": ["things worth checking before you decide"],
 "assumptions": ["what I assumed"],
 "calculation": ["step 1 ...","step 2 ..."],
 "evidence": [{"sku":"SKU-005","vendor":"BoxMate","original":"Rs 4,200 per 100 pieces","normalized":"INR 42.00 per piece","confidence":"high"}]
}
Write money as "INR 11.72L" for large totals and "INR 42.00" for a price per piece. Keep every list short and useful, at most 6 entries.`;

export type AppliedConstraints = {
  excludeVendors: string[];
  excludeFailedQuality: boolean;
  maxVendors: number | null;
  includeLowConfidence: boolean;
  minCoverage: number | null;
  onlySkus: string[];
  interpretation: string;
};

export type AnalystAnswer = {
  headline: string;
  metrics?: Array<{ label: string; value: string; tone?: string }>;
  body?: string;
  allocation?: Array<{ vendor: string; lines: number; value: string }>;
  caveats?: string[];
  assumptions?: string[];
  calculation?: string[];
  evidence?: Array<{ sku: string; vendor: string; original: string; normalized: string; confidence: string }>;
  appliedConstraints?: AppliedConstraints;
};

const CONSTRAINT_SYSTEM = `You translate a procurement buyer's plain-language question into machine constraints for a deterministic award optimizer.
Return ONLY JSON:
{"excludeVendors":["exact short_name"],"excludeFailedQuality":false,"maxVendors":null,"includeLowConfidence":false,"minCoverage":null,"onlySkus":["SKU-014"],"interpretation":"one short sentence describing the scenario you set up"}
Rules:
- excludeVendors must use the exact vendor short names supplied. Empty array if none named.
- excludeFailedQuality true when the buyer asks for compliant / qualified / passed-quality vendors only.
- maxVendors only when the buyer caps supplier count ("no more than 3 suppliers").
- onlySkus only when the buyer asks about specific lines (e.g. "line 14" => the SKU whose number is 14, "SKU-014"). Empty array otherwise.
- minCoverage (0-100) only when the buyer requires vendors to have quoted a minimum share of lines.
- includeLowConfidence true only if the buyer explicitly says to include unreliable / flagged values.`;


export const askAnalyst = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        question: z.string().min(3),
        constraints: z
          .object({
            excludeFailedQuality: z.boolean().optional(),
            maxVendors: z.number().optional(),
            includeLowConfidence: z.boolean().optional(),
            excludeVendors: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { serverClient, loadDataset } = await import("./procure.server");
    const { computeScenarios, coverageStats, qualityPass } = await import("./procure-math");
    const { callAI, parseJSON } = await import("./ai.server");
    const sb = serverClient();
    const ds = await loadDataset(sb);

    if (ds.quotes.length === 0) {
      throw new Error("No extracted quotes yet. Run the extraction pipeline in Response Inbox first.");
    }

    const c = data.constraints ?? {};
    const base: Constraints = {};
    if (c.excludeFailedQuality !== undefined) base.excludeFailedQuality = c.excludeFailedQuality;
    if (c.maxVendors !== undefined) base.maxVendors = c.maxVendors;
    if (c.includeLowConfidence !== undefined) base.includeLowConfidence = c.includeLowConfidence;
    if (c.excludeVendors !== undefined) base.excludeVendors = c.excludeVendors;

    // Step 1: turn the plain-language question into machine constraints, then
    // re-run the deterministic optimizer under them. The model never does the maths.
    let parsed: Partial<AppliedConstraints> = {};
    try {
      parsed = parseJSON<Partial<AppliedConstraints>>(
        await callAI([
          { role: "system", content: CONSTRAINT_SYSTEM },
          {
            role: "user",
            content: `Vendors (short names): ${ds.vendors.map((v) => v.short_name).join(", ")}
SKUs: ${ds.lineItems.map((l) => l.sku).join(", ")}
Vendors failing the quality questionnaire: ${ds.vendors
              .filter((v) => !qualityPass(ds)[v.id]?.pass)
              .map((v) => v.short_name)
              .join(", ") || "none"}

BUYER QUESTION: ${data.question}`,
          },
        ]),
      );
    } catch {
      parsed = {};
    }

    const nameToId = Object.fromEntries(
      ds.vendors.map((v) => [v.short_name.toLowerCase(), v.id] as const),
    );
    const parsedExcludeIds = (parsed.excludeVendors ?? [])
      .map((n) => nameToId[String(n).toLowerCase()])
      .filter((id): id is string => Boolean(id));
    const validSkus = new Set(ds.lineItems.map((l) => l.sku));
    const parsedSkus = (parsed.onlySkus ?? []).map(String).filter((s) => validSkus.has(s));

    const applied: AppliedConstraints = {
      excludeVendors: [...new Set([...(base.excludeVendors ?? []), ...parsedExcludeIds])].map(
        (id) => ds.vendors.find((v) => v.id === id)?.short_name ?? id,
      ),
      excludeFailedQuality: Boolean(base.excludeFailedQuality || parsed.excludeFailedQuality),
      maxVendors: base.maxVendors ?? (parsed.maxVendors ? Number(parsed.maxVendors) : null),
      includeLowConfidence: Boolean(base.includeLowConfidence || parsed.includeLowConfidence),
      minCoverage: parsed.minCoverage ? Number(parsed.minCoverage) : null,
      onlySkus: parsedSkus,
      interpretation: String(parsed.interpretation ?? "No additional constraints detected in the question."),
    };

    const scenarioConstraints: Constraints = {
      excludeVendors: [...new Set([...(base.excludeVendors ?? []), ...parsedExcludeIds])],
      excludeFailedQuality: applied.excludeFailedQuality,
      includeLowConfidence: applied.includeLowConfidence,
      ...(applied.maxVendors ? { maxVendors: applied.maxVendors } : {}),
      ...(applied.minCoverage ? { minCoverage: applied.minCoverage } : {}),
      ...(parsedSkus.length ? { onlySkus: parsedSkus } : {}),
    };

    const open = computeScenarios(ds, base);
    const compliant = computeScenarios(ds, { ...base, excludeFailedQuality: true });
    const constrained = computeScenarios(ds, scenarioConstraints);
    const cover = coverageStats(ds);
    const pass = qualityPass(ds);

    const matrix = ds.lineItems.map((li) => ({
      sku: li.sku,
      item: li.description,
      qty: li.quantity,
      quotes: ds.vendors.map((v) => {
        const q = ds.quotes.find((x) => x.vendor_id === v.id && x.line_item_id === li.id);
        return {
          vendor: v.short_name,
          inr_per_piece: q?.normalized_value ?? null,
          original: q?.original_text ?? "not quoted",
          confidence: q?.confidence ?? "none",
          requires_review: q?.requires_review ?? false,
          issue: q?.issue_note ?? null,
          status: q?.status ?? "missing",
        };
      }),
    }));

    const context = {
      rfx: ds.rfx,
      quality: ds.vendors.map((v) => ({
        vendor: v.short_name,
        pass: pass[v.id]?.pass,
        failed_questions: pass[v.id]?.failed,
        unverified_claims: ds.questionnaire
          .filter((r) => r.vendor_id === v.id && r.verification === "claimed" && (r.status ?? "") === "pass")
          .map((r) => r.question),
      })),
      data_quality_warnings: {
        note: "Lines with no usable price contribute INR 0 to every total. A lower total can mean missing coverage, not a cheaper vendor. Never present a price with original_currency UNKNOWN as comparable.",
        conflicting_prices: ds.quotes
          .filter((q) => q.status === "extracted" && q.conflict_note)
          .map((q) => ({
            vendor: ds.vendors.find((v) => v.id === q.vendor_id)?.short_name,
            sku: ds.lineItems.find((l) => l.id === q.line_item_id)?.sku,
            note: q.conflict_note,
          })),
        currency_not_stated: ds.quotes
          .filter((q) => q.original_currency === "UNKNOWN")
          .map((q) => ({
            vendor: ds.vendors.find((v) => v.id === q.vendor_id)?.short_name,
            sku: ds.lineItems.find((l) => l.id === q.line_item_id)?.sku,
          })),
      },
      coverage: cover,
      computed: {
        split_award_all_vendors_total_inr: Math.round(open.splitTotal),
        split_award_quality_compliant_total_inr: Math.round(compliant.splitTotal),
        single_vendor_totals_inr: open.singleVendor.map((s) => ({
          vendor: s.vendor,
          total: Math.round(s.total),
          lines_covered: s.covered,
          quality_pass: s.qualityPass,
        })),
        cheapest_single_vendor: open.cheapestSingle?.vendor,
        savings_split_vs_cheapest_single_inr: Math.round(open.savingsVsSingle),
        quality_failed_vendors: open.excludedForQuality,
        lines_with_no_usable_quote: open.unpricedLines,
        recommended_lines_using_flagged_quotes: open.reviewLinesInAward,
        per_line_award_all_vendors: open.perLine.map((l) => ({
          sku: l.sku,
          vendor: l.vendorName,
          unit: l.unitPrice,
          value: Math.round(l.lineValue),
          confidence: l.confidence,
        })),
        per_line_award_quality_compliant: compliant.perLine.map((l) => ({
          sku: l.sku,
          vendor: l.vendorName,
          unit: l.unitPrice,
          value: Math.round(l.lineValue),
          confidence: l.confidence,
        })),
      },
      question_scenario: {
        constraints_applied: applied,
        eligible_vendors: constrained.eligibleVendors,
        lines_considered: constrained.linesConsidered,
        total_inr: Math.round(constrained.splitTotal),
        saving_vs_cheapest_single_inr: Math.round(constrained.savingsVsSingle),
        unpriced_lines: constrained.unpricedLines,
        flagged_lines_used: constrained.reviewLinesInAward,
        per_line: constrained.perLine.map((l) => ({
          sku: l.sku,
          vendor: l.vendorName,
          unit: l.unitPrice,
          value: Math.round(l.lineValue),
          confidence: l.confidence,
        })),
        by_vendor: constrained.eligibleVendors.map((name) => ({
          vendor: name,
          lines: constrained.perLine.filter((l) => l.vendorName === name).length,
          value: Math.round(
            constrained.perLine.filter((l) => l.vendorName === name).reduce((s, l) => s + l.lineValue, 0),
          ),
        })),
      },
      matrix,
    };

    const raw = await callAI([
      { role: "system", content: ANALYST_SYSTEM },
      {
        role: "user",
        content: `BUYER QUESTION: ${data.question}

The optimizer has ALREADY been re-run under the constraints derived from this question; use "question_scenario" as the primary basis for your answer and state the constraints you applied.

ACTIVE SCENARIO CONSTRAINTS: ${JSON.stringify(applied)}

DATASET (all figures already computed in INR):
${JSON.stringify(context)}`,
      },
    ]);

    const answer = { ...parseJSON<AnalystAnswer>(raw), appliedConstraints: applied };

    await sb.from("analyst_answers").insert({
      rfx_id: ds.rfx.id,
      question: data.question,
      answer: answer as never,
    });
    await sb.from("audit_log").insert({
      rfx_id: ds.rfx.id,
      actor: "ProcureOS Analyst",
      event: "Analyst question answered",
      detail: `${data.question} · scenario: ${applied.interpretation}`,
    });

    return answer;
  });

export const logEvent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ actor: z.string().default("Sudeep Mishra"), event: z.string(), detail: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { serverClient } = await import("./procure.server");
    const sb = serverClient();
    const { activeRfx } = await import("./procure.server");
    const rfx = await activeRfx(sb);
    if (!rfx) return { ok: false };
    await sb.from("audit_log").insert({
      rfx_id: rfx.id,
      actor: data.actor,
      event: data.event,
      detail: data.detail ?? null,
    });
    return { ok: true };
  });

const QUESTIONNAIRE_SYSTEM = `You are a supplier qualification analyst for ProcureOS.
You receive the buyer's qualification criteria and EVERYTHING one vendor submitted (quotes, cover letters, certificates, emails, questionnaire replies).

For each criterion decide, using ONLY the vendor's own words:
- "pass": the document clearly satisfies the criterion.
- "fail": the document clearly contradicts the criterion.
- "partial": the vendor addresses it but with a caveat, condition or incomplete commitment.
- "not_answered": the documents say nothing about it. NEVER guess, and never mark not_answered as pass.

Separately decide how the claim is backed:
- "verified": the submission includes the supporting artefact itself (a certificate document, a certificate number with issuing body and validity, an audit report, test data).
- "claimed": the vendor asserts it in prose with no supporting artefact or reference number.
- "none": nothing was said about it.
A claim is NEVER "verified" just because it sounds credible. Saying "we are ISO 9001 certified" with no certificate, number or issuing body is "claimed".

Return ONLY a JSON array:
[{"question":"<criterion copied verbatim>","status":"pass|fail|partial|not_answered","response":"<short factual summary of what the vendor said, or 'Not addressed in submitted documents'>","evidence":"<literal quote from the document, or empty string>","confidence":"high|medium|low","verification":"verified|claimed|none","verification_note":"<what backs it, or what is missing>"}]
One element per criterion, in the order supplied.`;

/** Derives questionnaire answers from what the vendor actually submitted. */
export const evaluateQuestionnaire = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ vendorId: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { serverClient, loadDataset } = await import("./procure.server");
    const { callAI, parseJSON } = await import("./ai.server");
    const sb = serverClient();
    const ds = await loadDataset(sb);

    const criteria = ds.questions.length
      ? ds.questions
      : [...new Set(ds.questionnaire.map((q) => q.question))].map((question, i) => ({
          id: `virtual-${i}`,
          question,
          guidance: null,
          mandatory: true,
          sort_order: i,
        }));
    if (!criteria.length) throw new Error("Define at least one qualification criterion in the RFx Builder first.");

    const vendors = data.vendorId ? ds.vendors.filter((v) => v.id === data.vendorId) : ds.vendors;
    if (!vendors.length) throw new Error("Vendor not found");

    const { data: docs } = await sb
      .from("vendor_responses")
      .select("vendor_id, source_file, source_type, raw_content, image_data, response_type")
      .eq("rfx_id", ds.rfx.id);

    const summary: Array<{ vendor: string; pass: number; fail: number; partial: number; unanswered: number }> = [];

    for (const v of vendors) {
      const mine = (docs ?? []).filter((d2) => d2.vendor_id === v.id);
      if (!mine.length) continue;

      const text = mine
        .map(
          (m) =>
            `--- DOCUMENT: ${m.source_file} (${m.source_type}, ${m.response_type ?? "Quote / RFQ Response"}) ---\n${String(
              m.raw_content ?? "",
            ).slice(0, 14000)}`,
        )
        .join("\n\n");

      const prompt = `VENDOR: ${v.name}
RFX: ${ds.rfx.code}: ${ds.rfx.name}

QUALIFICATION CRITERIA
${criteria.map((q, i) => `${i + 1}. ${q.question}${q.mandatory ? " [MANDATORY]" : " [optional]"}${q.guidance ? `: ${q.guidance}` : ""}`).join("\n")}

VENDOR SUBMISSIONS
${text}`;

      const image = mine.find((m) => m.image_data)?.image_data;
      const parts: ContentPart[] = [{ type: "text", text: prompt }];
      if (image) parts.push({ type: "image_url", image_url: { url: image } });

      const rows = parseJSON<
        Array<{
          question: string;
          status: string;
          response: string;
          evidence: string;
          confidence: string;
          verification?: string;
          verification_note?: string;
        }>
      >(
        await callAI([
          { role: "system", content: QUESTIONNAIRE_SYSTEM },
          { role: "user", content: image ? parts : prompt },
        ]),
      );

      const valid = ["pass", "fail", "partial", "not_answered"];
      const payload = criteria.map((crit, i) => {
        const match =
          rows.find((r) => (r.question ?? "").trim().toLowerCase() === crit.question.trim().toLowerCase()) ??
          rows[i];
        const status = valid.includes(match?.status ?? "") ? match!.status : "not_answered";
        return {
          rfx_id: ds.rfx.id,
          vendor_id: v.id,
          question: crit.question,
          response: match?.response?.trim() || "Not addressed in submitted documents",
          status,
          pass_fail: status === "pass",
          evidence: match?.evidence || null,
          confidence: match?.confidence ?? "medium",
          verification: ["verified", "claimed", "none"].includes(match?.verification ?? "")
            ? match!.verification!
            : status === "not_answered"
              ? "none"
              : "claimed",
          verification_note: match?.verification_note ?? null,
          source: "ai",
          source_ref: mine.map((m) => m.source_file).join(", "),
          sort_order: crit.sort_order,
        };
      });

      await sb.from("questionnaire_responses").delete().eq("rfx_id", ds.rfx.id).eq("vendor_id", v.id);
      const { error } = await sb.from("questionnaire_responses").insert(payload);
      if (error) throw new Error(error.message);

      const count = (s: string) => payload.filter((p) => p.status === s).length;
      summary.push({
        vendor: v.short_name,
        pass: count("pass"),
        fail: count("fail"),
        partial: count("partial"),
        unanswered: count("not_answered"),
      });

      await sb.from("audit_log").insert({
        rfx_id: ds.rfx.id,
        actor: "ProcureOS AI",
        event: `Qualification evaluated for ${v.short_name}`,
        detail: `${criteria.length} criteria read from ${mine.length} submitted document(s): ${count("pass")} pass, ${count(
          "partial",
        )} partial, ${count("fail")} fail, ${count("not_answered")} not answered`,
      });
    }

    if (!summary.length) throw new Error("No vendor documents to evaluate. Upload or load vendor responses first.");
    return { evaluated: summary };
  });

/** Persists a buyer-approved award so the decision survives a reload. */
export const approveAward = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        strategy: z.string(),
        totalValue: z.number(),
        allocation: z.array(
          z.object({
            sku: z.string(),
            description: z.string(),
            vendor: z.string().nullable(),
            quantity: z.number(),
            unitPrice: z.number().nullable(),
            lineValue: z.number(),
            reason: z.string(),
          }),
        ),
        acknowledgedItems: z.array(z.string()).default([]),
        notes: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { serverClient, activeRfx } = await import("./procure.server");
    const sb = serverClient();
    const rfx = await activeRfx(sb);

    const vendors = [...new Set(data.allocation.map((a) => a.vendor).filter(Boolean))];
    const { data: row, error } = await sb
      .from("awards")
      .insert({
        rfx_id: rfx.id,
        strategy: data.strategy,
        total_value: data.totalValue,
        allocation: data.allocation as never,
        approved_by: "Sudeep Mishra",
        status: "approved",
        notes: data.notes ?? null,
        acknowledged_items: data.acknowledgedItems as never,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await sb.from("audit_log").insert({
      rfx_id: rfx.id,
      actor: "Sudeep Mishra",
      event: "Award approved",
      detail: `${data.strategy} · ₹${Math.round(data.totalValue).toLocaleString("en-IN")} across ${vendors.join(", ")}${
        data.acknowledgedItems.length ? ` · acknowledged ${data.acknowledgedItems.length} flagged item(s)` : ""
      }`,
    });
    return row;
  });

/** Saves a named what-if scenario from the Award Scenario Lab. */
export const saveScenario = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1),
        constraints: z.record(z.string(), z.unknown()),
        result: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { serverClient, activeRfx } = await import("./procure.server");
    const sb = serverClient();
    const rfx = await activeRfx(sb);
    const { data: row, error } = await sb
      .from("scenarios")
      .insert({
        rfx_id: rfx.id,
        name: data.name,
        constraints: data.constraints as never,
        result: data.result as never,
        created_by: "Sudeep Mishra",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await sb.from("audit_log").insert({
      rfx_id: rfx.id,
      actor: "Sudeep Mishra",
      event: "Scenario saved",
      detail: data.name,
    });
    return row;
  });
