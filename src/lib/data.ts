import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Dataset, LineItem, Quote, QuestionDef, Vendor } from "./procure-math";

export type VendorResponse = {
  id: string;
  vendor_id: string;
  source_type: string;
  source_file: string;
  raw_content: string;
  received_at: string;
  processed_at: string | null;
  extraction_confidence: number | null;
  extraction_notes: string | null;
  response_type?: string | null;
  is_demo?: boolean | null;
  image_data?: string | null;
  file_path?: string | null;
  file_mime?: string | null;
};

export type AuditRow = {
  id: string;
  actor: string;
  event: string;
  detail: string | null;
  created_at: string;
};

export type AwardRow = {
  id: string;
  strategy: string;
  total_value: number;
  allocation: unknown;
  approved_at: string;
  approved_by: string;
  status?: string | null;
  notes?: string | null;
};

export type ScenarioRow = {
  id: string;
  name: string;
  constraints: unknown;
  result: unknown;
  created_by: string;
  created_at: string;
};

export type UnmatchedLine = {
  id: string;
  vendor_id: string;
  vendor_response_id: string | null;
  original_text: string;
  stated_price: string | null;
  suggested_sku: string | null;
  match_confidence: string;
  reason: string | null;
  status: string;
  created_at: string;
};

export type FullData = Dataset & {
  responses: VendorResponse[];
  supersededQuotes: Quote[];
  unmatched: UnmatchedLine[];
  audit: AuditRow[];
  awards: AwardRow[];
  scenarios: ScenarioRow[];
  allRfx: Array<{ id: string; code: string; name: string; is_active: boolean | null }>;
};

async function fetchAll(): Promise<FullData> {
  const { data: allRfx, error } = await supabase
    .from("rfx")
    .select("*")
    .order("is_active", { ascending: false })
    .order("created_at");
  if (error) throw error;
  const rfx = allRfx?.[0];
  if (!rfx) throw new Error("No RFx found");

  const [li, ve, qu, qr, qq, vr, au, aw, sc, um] = await Promise.all([
    supabase.from("line_items").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    supabase.from("vendors").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    supabase.from("quotes").select("*").eq("rfx_id", rfx.id),
    supabase.from("questionnaire_responses").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    supabase.from("questionnaire_questions").select("*").eq("rfx_id", rfx.id).order("sort_order"),
    supabase.from("vendor_responses").select("*").eq("rfx_id", rfx.id),
    supabase.from("audit_log").select("*").eq("rfx_id", rfx.id).order("created_at"),
    supabase.from("awards").select("*").eq("rfx_id", rfx.id).order("approved_at", { ascending: false }),
    supabase.from("scenarios").select("*").eq("rfx_id", rfx.id).order("created_at", { ascending: false }),
    supabase.from("unmatched_lines").select("*").eq("rfx_id", rfx.id).order("created_at"),
  ]);

  const allQuotes = (qu.data ?? []) as Quote[];

  return {
    rfx: rfx as FullData["rfx"],
    lineItems: (li.data ?? []) as LineItem[],
    vendors: (ve.data ?? []) as Vendor[],
    quotes: allQuotes.filter((q) => q.status !== "superseded"),
    supersededQuotes: allQuotes.filter((q) => q.status === "superseded"),
    unmatched: ((um.data ?? []) as UnmatchedLine[]).filter((u) => u.status === "open"),
    questionnaire: (qr.data ?? []) as FullData["questionnaire"],
    questions: (qq.data ?? []) as QuestionDef[],
    responses: ((vr.data ?? []) as VendorResponse[]).sort((a, b) =>
      a.source_file.localeCompare(b.source_file),
    ),
    audit: (au.data ?? []) as AuditRow[],
    awards: (aw.data ?? []) as AwardRow[],
    scenarios: (sc.data ?? []) as ScenarioRow[],
    allRfx: (allRfx ?? []) as FullData["allRfx"],
  };
}

export function useProcurement() {
  return useQuery({ queryKey: ["procurement"], queryFn: fetchAll, staleTime: 5_000 });
}

export function useRefreshProcurement() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["procurement"] });
}
