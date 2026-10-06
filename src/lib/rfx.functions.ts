import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const COPILOT_ACTIONS = [
  { id: "specs", label: "Suggest missing specifications" },
  { id: "questionnaire", label: "Create supplier questionnaire" },
  { id: "terms", label: "Suggest commercial terms" },
  { id: "gaps", label: "Check RFx for missing information" },
  { id: "consistency", label: "Review line items for inconsistencies" },
  { id: "summary", label: "Summarize RFx" },
] as const;

export type CopilotAction = (typeof COPILOT_ACTIONS)[number]["id"];

const TASKS: Record<CopilotAction, string> = {
  specs:
    "List the RFx line items whose specification text is thin, missing or non-measurable, and state the specific attribute the buyer should add for each (board grade, GSM, burst strength, ply, print, dimensions, tolerance). Only reference SKUs that exist in the data.",
  questionnaire:
    "Review the existing qualification criteria and propose any additional criteria this category genuinely needs. Say clearly which criteria already exist so nothing is duplicated.",
  terms:
    "Review the global commercial requirements supplied (payment terms, validity, tax, delivery location, incoterms, lead time) and say which are appropriate, which are risky and what you would change for this category and value.",
  gaps: "Inspect the actual RFx fields supplied and list every field or requirement that is missing, blank or too vague to send to suppliers. If nothing is missing, say so plainly.",
  consistency:
    "Compare the line items against each other and flag inconsistencies: unit mismatches, duplicated or near-duplicate descriptions, quantities that look out of pattern, delivery requirements that contradict the global lead time, missing specifications.",
  summary:
    "Write a short buyer-facing summary of this sourcing event: what is being bought, volume, commercial frame, supplier requirements and current workflow state.",
};

const SYSTEM = `You help a smart business buyer write a clear request to suppliers. They are not a procurement specialist, so speak plain English.
HARD RULES
- Use only the request data supplied. Never invent items, suppliers, prices or supplier replies.
- If the data does not support a finding, say so instead of guessing.
- Be concrete and short. Name the real item codes and refer to fields by the plain English label the buyer sees, such as "delivery time", "minimum order", "payment terms", "supplier requirements".
- Never use procurement jargon. Banned: RFx, RFQ, UOM, MOQ, incoterms, lead time, qualification criteria, compliance, line item, vendor. Say instead: request, unit, minimum order, delivery terms, delivery time, supplier requirements, item, supplier.
- Never use em dashes.
- Reply as plain markdown: a one line headline, then at most 8 bullet points. No preamble.`;

export const rfxCopilot = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        action: z.enum(["specs", "questionnaire", "terms", "gaps", "consistency", "summary"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { serverClient, loadDataset } = await import("./procure.server");
    const { callAI } = await import("./ai.server");
    const sb = serverClient();
    const ds = await loadDataset(sb);
    const r = ds.rfx;

    const { count: responseCount } = await sb
      .from("vendor_responses")
      .select("id", { count: "exact", head: true })
      .eq("rfx_id", r.id);

    const context = `RFX HEADER
code: ${r.code}
name: ${r.name}
event type: ${r.event_type ?? "RFQ"}
category: ${r.category}
currency: ${r.currency}
response due: ${r.due_date || "(not set)"}
scope / supplier requirements: ${r.description || "(blank)"}

GLOBAL COMMERCIAL REQUIREMENTS
payment terms: ${r.payment_terms ?? "(blank)"}
quote validity: ${r.quote_validity_days ?? "(blank)"} days
tax: ${r.tax_treatment ?? "(blank)"}
delivery location: ${r.delivery_location ?? "(blank)"}
incoterms: ${r.incoterms ?? "(blank)"}
lead time: ${r.lead_time ?? "(blank)"}

SUPPLIER REQUIREMENTS
quality certification required: ${r.quality_cert_required ? "yes" : "no"}
supplier questionnaire required: ${r.questionnaire_required ? "yes" : "no"}
supporting documents required: ${r.docs_required ? "yes" : "no"}
minimum supplier experience: ${r.min_experience || "(not set)"}

QUALIFICATION CRITERIA (${ds.questions.length})
${ds.questions.map((q, i) => `${i + 1}. [${q.mandatory ? "mandatory" : "optional"}] ${q.question}`).join("\n") || "(none)"}

INVITED VENDORS (${ds.vendors.length}): ${ds.vendors.map((v) => v.name).join(", ") || "(none)"}
VENDOR RESPONSES RECEIVED: ${responseCount ?? 0}

LINE ITEMS (${ds.lineItems.length})
${ds.lineItems
  .map(
    (l) =>
      `${l.sku} | qty ${l.quantity} ${l.unit} | delivery: ${l.delivery_requirement || "(global)"} | spec: ${
        l.specifications || "(blank)"
      } | ${l.description}`,
  )
  .join("\n")}`;

    const answer = await callAI([
      { role: "system", content: SYSTEM },
      { role: "user", content: `${context}\n\nTASK: ${TASKS[data.action]}` },
    ]);

    return { answer };
  });

/** Records the internal release of the RFx to the invited vendors. */
export const sendRfx = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ rfxId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { serverClient } = await import("./procure.server");
    const sb = serverClient();
    const { data: rfx, error } = await sb
      .from("rfx")
      .update({ sent_at: new Date().toISOString(), status: "Awaiting Responses" })
      .eq("id", data.rfxId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { data: vendors } = await sb.from("vendors").select("id,status").eq("rfx_id", data.rfxId);
    for (const v of vendors ?? []) {
      if (v.status !== "Responded") {
        await sb.from("vendors").update({ status: "Awaiting Response" }).eq("id", v.id);
      }
    }

    await sb.from("audit_log").insert({
      rfx_id: data.rfxId,
      actor: "Sudeep Mishra",
      event: "RFx sent to vendors",
      detail: `${rfx.code} released to ${(vendors ?? []).length} invited vendors`,
    });
    return rfx;
  });

/** Keeps the stored status column aligned with the derived lifecycle state. */
export const syncRfxStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ rfxId: z.string(), status: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { serverClient } = await import("./procure.server");
    const sb = serverClient();
    await sb.from("rfx").update({ status: data.status }).eq("id", data.rfxId);
    return { ok: true };
  });

/**
 * Live FX lookup. Returns how many units of the target currency one unit of
 * the base currency buys, taken from the ECB reference feed (frankfurter.app).
 */
export const getFxRate = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ base: z.string().min(3).max(3), target: z.string().min(3).max(3).default("INR") }).parse(d),
  )
  .handler(async ({ data }) => {
    const base = data.base.toUpperCase();
    const target = data.target.toUpperCase();
    if (base === target) return { rate: 1, asOf: new Date().toISOString().slice(0, 10), source: "same currency" };

    const attempts: Array<() => Promise<{ rate: number; asOf: string; source: string } | null>> = [
      async () => {
        const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${target}`);
        if (!res.ok) return null;
        const j = (await res.json()) as { date?: string; rates?: Record<string, number> };
        const rate = j.rates?.[target];
        return rate ? { rate, asOf: j.date ?? "", source: "ECB reference rate" } : null;
      },
      async () => {
        const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
        if (!res.ok) return null;
        const j = (await res.json()) as { time_last_update_utc?: string; rates?: Record<string, number> };
        const rate = j.rates?.[target];
        return rate ? { rate, asOf: j.time_last_update_utc ?? "", source: "open exchange rates" } : null;
      },
    ];

    for (const attempt of attempts) {
      try {
        const out = await attempt();
        if (out) return out;
      } catch {
        // try the next provider
      }
    }
    throw new Error(`Could not fetch a live ${base} to ${target} rate`);
  });
