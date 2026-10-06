import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function serverClient(): SupabaseClient {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import type { Dataset, LineItem, Vendor, Quote, QuestionDef } from "./procure-math";
export type { Dataset } from "./procure-math";

export async function activeRfx(sb: SupabaseClient) {
  const { data } = await sb
    .from("rfx")
    .select("*")
    .order("is_active", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function loadDataset(sb: SupabaseClient): Promise<Dataset> {
  const rfx = await activeRfx(sb);
  if (!rfx) throw new Error("No RFx found");
  const [li, ve, qu, qr, qq] = await Promise.all([
    sb.from("line_items").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    sb.from("vendors").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    sb.from("quotes").select("*").eq("rfx_id", rfx.id),
    sb.from("questionnaire_responses").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    sb.from("questionnaire_questions").select("*").eq("rfx_id", rfx.id).order("sort_order"),
  ]);
  return {
    rfx: rfx as Dataset["rfx"],
    lineItems: (li.data ?? []) as LineItem[],
    vendors: (ve.data ?? []) as Vendor[],
    quotes: (qu.data ?? []) as Quote[],
    questionnaire: (qr.data ?? []) as Dataset["questionnaire"],
    questions: (qq.data ?? []) as QuestionDef[],
  };
}
