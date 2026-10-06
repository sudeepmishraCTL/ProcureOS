import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Pill } from "@/components/bits";
import { useProcurement } from "@/lib/data";
import { computeScenarios, qualityPass } from "@/lib/procure-math";
import { inr, inrShort } from "@/lib/format";

export const Route = createFileRoute("/vendors")({
  head: () => ({
    meta: [
      { title: "Suppliers · ProcureOS" },
      {
        name: "description",
        content:
          "A summary of each supplier: what they sent, how much of your list they priced, whether they met your requirements, and what their total would come to.",
      },
      { property: "og:title", content: "Suppliers · ProcureOS" },
      { property: "og:description", content: "What each supplier offered and whether they met your requirements." },
    ],
  }),
  component: VendorsPage,
});

function VendorsPage() {
  const { data } = useProcurement();
  const [open, setOpen] = useState<string | null>(null);
  const scen = data && data.quotes.length ? computeScenarios(data) : null;
  const pass = data ? qualityPass(data) : {};

  const cheapestComplete = scen?.singleVendor.filter((s) => s.complete)[0];

  return (
    <>
      <PageHeader title="Suppliers" description="Who you invited, what they sent, and how they compare" />
      <main className="flex-1 space-y-3 px-6 py-5">
        {data && scen && (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-[12px] text-muted-foreground">
            No supplier is simply "the best". Below is what each one offered, how much of your list they actually
            priced, whether they met your requirements and how many of their prices still need your eye. Items a
            supplier did not price are never counted as free.
          </p>
        )}
        {data?.vendors.map((v) => {
          const resp = data.responses.find((r) => r.vendor_id === v.id);
          const quotes = data.quotes.filter((q) => q.vendor_id === v.id && q.normalized_value != null);
          const review = data.quotes.filter((q) => q.vendor_id === v.id && q.requires_review).length;
          const single = scen?.singleVendor.find((s) => s.vendorId === v.id);
          const wins = scen?.perLine.filter((l) => l.vendorId === v.id).length ?? 0;
          const avg = quotes.length
            ? quotes.reduce((s, q) => s + (q.normalized_value ?? 0), 0) / quotes.length
            : 0;
          const p = pass[v.id];
          const total = data.lineItems.length;
          const missing = data.lineItems.filter(
            (li) =>
              !data.quotes.some(
                (q) => q.vendor_id === v.id && q.line_item_id === li.id && q.normalized_value != null,
              ),
          );
          const currencies = [
            ...new Set(
              data.quotes
                .filter((q) => q.vendor_id === v.id && q.original_currency)
                .map((q) => q.original_currency as string),
            ),
          ];
          const tradeOff = buildTradeOff({
            name: v.short_name,
            quoted: quotes.length,
            total,
            review,
            qualityPass: p?.pass ?? false,
            failed: p?.failed ?? [],
            unanswered: p?.unanswered ?? [],
            myTotal: single?.total ?? 0,
            bestName: cheapestComplete?.vendor,
            bestTotal: cheapestComplete?.total,
            currencies,
          });
          const expanded = open === v.id;

          return (
            <article key={v.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold tracking-tight text-foreground">{v.name}</div>
                  <div className="num mt-0.5 text-[11px] text-muted-foreground">
                    {resp ? `Sent ${resp.source_file}` : "Has not sent anything yet"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p?.pass ? (
                    <Pill tone="positive">
                      <CheckCircle2 className="size-3" /> Meets your requirements
                    </Pill>
                  ) : (p?.unanswered.length ?? 0) > 0 && (p?.failed.length ?? 0) === 0 ? (
                    <Pill tone="warning">Quality check incomplete</Pill>
                  ) : (
                    <Pill tone="danger">
                      <XCircle className="size-3" /> Does not meet required quality standards
                    </Pill>
                  )}
                  <Pill tone={resp?.processed_at ? "primary" : "warning"}>
                    {resp?.processed_at ? "File read" : "File not read yet"}
                  </Pill>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="num text-[15px] font-semibold text-foreground">
                  {quotes.length} of {total} items quoted
                </div>
                {missing.length > 0 && (
                  <>
                    <span className="text-[12px] text-warning-foreground">
                      {missing.length} item{missing.length > 1 ? "s were" : " was"} not included in this supplier's
                      response.
                    </span>
                    <button
                      onClick={() => setOpen(expanded ? null : v.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-medium text-foreground hover:bg-secondary"
                    >
                      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      See missing items
                    </button>
                  </>
                )}
              </div>

              {expanded && missing.length > 0 && (
                <div className="mt-2 divide-y divide-border rounded-md border border-border">
                  {missing.map((li) => (
                    <div key={li.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
                      <span className="min-w-0 truncate text-foreground">
                        <span className="num text-muted-foreground">{li.sku}</span> · {li.description}
                      </span>
                      <Pill tone="warning">Not quoted</Pill>
                    </div>
                  ))}
                  <div className="px-3 py-1.5 text-[11.5px] text-muted-foreground">
                    These are left out of this supplier's total. They are never treated as zero rupees.
                  </div>
                </div>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="Needs your review" value={review} />
                <Stat label="Typical price per piece" value={avg ? inr(avg) : "-"} />
                <Stat
                  label="Total if you bought everything here"
                  value={single ? inrShort(single.total) : "-"}
                  note={single && !single.complete ? "Covers only the items they priced" : undefined}
                />
                <Stat label="Items where they are cheapest" value={wins} />
                <Stat label="They quoted in" value={currencies.length ? currencies.join(", ") : "-"} />
              </div>

              <p className="mt-3 rounded-md border border-border bg-surface-muted px-3 py-2 text-[12px] leading-relaxed text-foreground">
                {tradeOff}
              </p>

              {p && !p.pass && p.failed.length > 0 && (
                <div className="mt-2 rounded-md border border-destructive/25 bg-danger-soft px-3 py-2 text-[11.5px] text-destructive">
                  Falls short on: {p.failed.join(" · ")}. This supplier can still be viewed, but is left out of any
                  purchase option that requires all quality checks to pass.
                </div>
              )}
              {p && p.unanswered.length > 0 && (
                <div className="mt-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11.5px] text-warning-foreground">
                  Quality check incomplete: no answer given for {p.unanswered.join(" · ")}. A missing answer is not
                  read as a pass.
                </div>
              )}
            </article>
          );
        })}
      </main>
    </>
  );
}

function buildTradeOff(a: {
  name: string;
  quoted: number;
  total: number;
  review: number;
  qualityPass: boolean;
  failed: string[];
  unanswered: string[];
  myTotal: number;
  bestName?: string | undefined;
  bestTotal?: number | undefined;
  currencies: string[];
}): string {
  const parts: string[] = [];
  if (a.quoted === 0) return `${a.name} has no usable prices yet, so there is nothing to compare.`;
  if (a.bestName && a.bestTotal && a.bestName !== a.name && a.myTotal > 0) {
    const diff = a.myTotal - a.bestTotal;
    parts.push(
      diff === 0
        ? `${a.name} costs about the same as ${a.bestName} on the items they priced.`
        : diff < 0
          ? `${a.name} works out ${inrShort(Math.abs(diff))} cheaper than ${a.bestName} on the items they priced.`
          : `${a.name} works out ${inrShort(diff)} more expensive than ${a.bestName} on the items they priced.`,
    );
  } else {
    parts.push(`${a.name} priced ${a.quoted} of your ${a.total} items.`);
  }
  if (a.quoted < a.total) {
    parts.push(
      `That total does not cover ${a.total - a.quoted} item(s) they did not quote, so your real spend with them would be higher.`,
    );
  }
  if (a.review > 0) {
    parts.push(`${a.review} of their prices need your review before you rely on them.`);
  }
  if (a.currencies.includes("USD")) {
    parts.push("They quoted in US dollars, so their prices were converted into rupees for comparison.");
  }
  if (a.currencies.includes("UNKNOWN")) {
    parts.push("At least one of their prices did not say which currency it was in.");
  }
  if (!a.qualityPass) {
    parts.push(
      a.failed.length
        ? "They do not meet a required quality standard, so they are left out of options that need all checks to pass."
        : "Their quality answers are incomplete, so they are left out of options that need all checks to pass.",
    );
  }
  return parts.join(" ");
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string | undefined }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
      <div className="label-xs">{label}</div>
      <div className="num mt-1 text-[13px] font-semibold text-foreground">{value}</div>
      {note && <div className="mt-0.5 text-[10.5px] text-muted-foreground">{note}</div>}
    </div>
  );
}
