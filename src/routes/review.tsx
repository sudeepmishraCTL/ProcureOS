import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SubTabs } from "@/components/AppShell";
import { EmptyState, Metric, Pill } from "@/components/bits";
import { EvidenceDrawer, type EvidenceTarget } from "@/components/EvidenceDrawer";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { logEvent } from "@/lib/procure.functions";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Needs Your Review · ProcureOS" },
      {
        name: "description",
        content:
          "Anything the system could not read with certainty is shown here for you to confirm, instead of being guessed at quietly.",
      },
      { property: "og:title", content: "Needs Your Review · ProcureOS" },
      { property: "og:description", content: "Confirm the supplier values the system was not sure about." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [target, setTarget] = useState<EvidenceTarget | null>(null);

  const flagged = data?.quotes.filter((q) => q.requires_review && q.status === "extracted") ?? [];
  const conflicts = data?.quotes.filter((q) => q.status === "extracted" && q.conflict_note) ?? [];
  const unmatched = data?.unmatched ?? [];
  const unknownCurrency = data?.quotes.filter((q) => q.original_currency === "UNKNOWN").length ?? 0;
  /** A line with no quote row at all. Rows that exist but could not be normalized stay in the flagged list above. */
  const notQuoted =
    data?.vendors.flatMap((v) =>
      data.lineItems
        .filter((li) => !data.quotes.some((q) => q.vendor_id === v.id && q.line_item_id === li.id))
        .map((li) => ({ vendor: v, lineItem: li })),
    ) ?? [];

  const confirm = async (quoteId: string, sku: string, vendor: string) => {
    await supabase.from("quotes").update({ requires_review: false, confidence: "high" }).eq("id", quoteId);
    await logEvent({
      data: { actor: "Sudeep Mishra", event: "Value confirmed", detail: `${vendor} · ${sku} confirmed by Sudeep Mishra` },
    });
    toast.success(`${sku} confirmed`, { description: "Recorded in the audit trail" });
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Needs Your Review"
        description="The system will not guess. Anything unclear in a supplier's file is listed here for you to confirm."
      />
      <SubTabs />

      <main className="flex-1 space-y-5 px-6 py-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Prices to confirm" value={flagged.length} tone={flagged.length ? "warning" : "positive"} sub="The supplier's wording was unclear" />
          <Metric label="Suppliers who sent two different prices" value={conflicts.length} tone={conflicts.length ? "warning" : "positive"} sub="Same supplier, two files" />
          <Metric label="Supplier lines we could not match" value={unmatched.length} tone={unmatched.length ? "warning" : "positive"} sub="Priced, but we are not sure which item it is" />
          <Metric label="Items with no price" value={notQuoted.length} sub="Never counted as free" />
          <Metric label="Prices with no currency stated" value={unknownCurrency} tone={unknownCurrency ? "warning" : "positive"} sub={`Rate used elsewhere: ₹${data?.rfx.fx_rate ?? 0} per US dollar`} />
        </section>

        {conflicts.length > 0 && (
          <section>
            <div className="mb-2.5 text-[13px] font-semibold text-foreground">
              A supplier sent two different prices for the same item
            </div>
            <p className="mb-2 text-[11.5px] text-muted-foreground">
              We keep the newer file as the price in use, and show you the earlier one so nothing changes behind
              your back.
            </p>
            <div className="panel divide-y divide-border">
              {conflicts.map((q) => {
                const v = data!.vendors.find((x) => x.id === q.vendor_id);
                const li = data!.lineItems.find((x) => x.id === q.line_item_id);
                return (
                  <div key={q.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="size-4 text-warning-foreground" />
                      <span className="text-[13px] font-semibold text-foreground">
                        {v?.short_name} · {li?.sku}
                      </span>
                      <Pill tone="warning">file {q.version ?? 2}</Pill>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <Field label="Earlier file">
                        <span className="num">
                          {q.previous_value == null ? "Not clear" : inr(Number(q.previous_value))}
                        </span>
                        <div className="text-[11px] text-muted-foreground">{q.previous_source ?? "earlier document"}</div>
                      </Field>
                      <Field label="Latest file (the one we use)">
                        <span className="num font-semibold">
                          {q.normalized_value == null ? "Not clear" : inr(q.normalized_value)}
                        </span>
                        <div className="text-[11px] text-muted-foreground">{q.source_ref ?? ""}</div>
                      </Field>
                      <Field label="Difference">
                        <span className="num">
                          {q.previous_value != null && q.normalized_value != null
                            ? inr(q.normalized_value - Number(q.previous_value))
                            : "n/a"}
                        </span>
                      </Field>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">{q.conflict_note}</p>
                    {v && li && (
                      <button
                        onClick={() => setTarget({ quote: q, vendor: v, lineItem: li })}
                        className="rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-secondary"
                      >
                        See where this came from
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {unmatched.length > 0 && (
          <section>
            <div className="mb-2.5 text-[13px] font-semibold text-foreground">
              Supplier priced something we could not match to your list
            </div>
            <div className="panel divide-y divide-border">
              {unmatched.map((u) => {
                const v = data!.vendors.find((x) => x.id === u.vendor_id);
                return (
                  <div key={u.id} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{v?.short_name}</span>
                      <Pill tone="warning">
                        {u.suggested_sku ? `might be ${u.suggested_sku}` : "we are not sure which item this is"}
                      </Pill>
                      {u.stated_price && <span className="num text-[12px] text-muted-foreground">{u.stated_price}</span>}
                    </div>
                    <div className="text-[12.5px] italic text-foreground">&ldquo;{u.original_text}&rdquo;</div>
                    {u.reason && <div className="text-[11.5px] text-muted-foreground">{u.reason}</div>}
                    <div className="text-[11.5px] text-muted-foreground">
                      This price is left out of every comparison until you tell us which item it belongs to.
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {flagged.length === 0 ? (
          <EmptyState
            title="Nothing needs your review"
            description="Either the supplier files have not been read yet, or every unclear value has already been confirmed. When something is unclear, it will appear here with what the supplier wrote and why we were unsure."
          />
        ) : (
          <section className="space-y-3">
            {flagged.map((q) => {
              const v = data!.vendors.find((x) => x.id === q.vendor_id)!;
              const li = data!.lineItems.find((x) => x.id === q.line_item_id)!;
              return (
                <article key={q.id} className="panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-warning-foreground" />
                        <span className="text-[13px] font-semibold text-foreground">
                          {v.short_name} · {li.sku}
                        </span>
                        <Pill tone="warning">{(q.issue_type ?? "wording unclear").replace(/_/g, " ")}</Pill>
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{li.description}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTarget({ quote: q, vendor: v, lineItem: li })}
                        className="rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary"
                      >
                        See where this came from
                      </button>
                      <button
                        onClick={() => confirm(q.id, li.sku, v.short_name)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                      >
                        <Check className="size-3.5" /> This price is correct
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Field label="What the supplier wrote">
                      <span className="italic">&ldquo;{q.original_text ?? "-"}&rdquo;</span>
                    </Field>
                    <Field label="How we made it comparable">
                      <span className="num">{q.normalization_note ?? "Used as written, nothing converted"}</span>
                    </Field>
                    <Field label="Price used for comparison">
                      <span className="num font-semibold">
                        {q.normalized_value == null ? "Not clear yet" : `${inr(q.normalized_value)} per piece`}
                      </span>
                    </Field>
                  </div>
                  {q.issue_note && (
                    <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-foreground">
                      {q.issue_note}
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {notQuoted.length > 0 && (
          <section>
            <div className="mb-2.5 text-[13px] font-semibold text-foreground">
              Items a supplier did not quote
            </div>
            <p className="mb-2 text-[11.5px] text-muted-foreground">
              These are never treated as free. They are simply left out of that supplier's total.
            </p>
            <div className="panel divide-y divide-border">
              {notQuoted.slice(0, 40).map(({ vendor, lineItem }) => (
                <div key={`${vendor.id}-${lineItem.id}`} className="flex items-center justify-between px-4 py-2">
                  <div className="text-[12.5px] text-foreground">
                    <span className="num text-muted-foreground">{lineItem.sku}</span> · {lineItem.description}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted-foreground">{vendor.short_name}</span>
                    <Pill tone="warning">No price given</Pill>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {data && <EvidenceDrawer target={target} data={data} onClose={() => setTarget(null)} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
      <div className="label-xs">{label}</div>
      <div className="mt-1 text-[12.5px] text-foreground">{children}</div>
    </div>
  );
}
