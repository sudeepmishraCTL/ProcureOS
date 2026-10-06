import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader, SubTabs } from "@/components/AppShell";
import { ConfidenceDot, EmptyState, Help, Metric, Pill } from "@/components/bits";
import { EvidenceDrawer, type EvidenceTarget } from "@/components/EvidenceDrawer";
import { useProcurement } from "@/lib/data";
import { computeScenarios, coverageStats } from "@/lib/procure-math";
import { inr, inrShort, qty } from "@/lib/format";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Compare Supplier Prices · ProcureOS" },
      {
        name: "description",
        content:
          "See what every supplier offered for each item, side by side, with every price converted into the same currency and unit so the comparison is fair.",
      },
      { property: "og:title", content: "Compare Supplier Prices · ProcureOS" },
      {
        property: "og:description",
        content: "Supplier prices side by side, with the source of every number one click away.",
      },
    ],
  }),
  component: Intelligence,
});

function Intelligence() {
  const { data } = useProcurement();
  const [target, setTarget] = useState<EvidenceTarget | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const scen = useMemo(() => (data ? computeScenarios(data) : null), [data]);
  const cover = data ? coverageStats(data) : null;

  const rows = useMemo(() => {
    if (!data) return [];
    return data.lineItems.filter((li) => {
      if (!onlyIssues) return true;
      return data.quotes.some(
        (q) => q.line_item_id === li.id && (q.requires_review || q.normalized_value == null),
      );
    });
  }, [data, onlyIssues]);

  return (
    <>
      <PageHeader
        title="Compare Supplier Prices"
        description="Every supplier price converted into rupees per piece, so you compare like for like"
      />
      <SubTabs />

      <main className="flex-1 space-y-5 px-6 py-5">
        {data && data.quotes.length === 0 && (
          <EmptyState
            title="No supplier prices to compare yet"
            description="The supplier files have not been read yet, so there is nothing to compare. Open Supplier Replies and ask the system to read them, and the prices will appear here."
            action={
              <Link
                to="/responses"
                className="inline-flex rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground"
              >
                Go to Supplier Replies
              </Link>
            }
          />
        )}

        {data && scen && data.quotes.length > 0 && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Total if you buy each item from whoever is cheapest"
                value={inrShort(scen.splitTotal)}
                sub="Best price on every item, across all suppliers"
                tone="primary"
              />
              <Metric
                label="Total if you buy everything from one supplier"
                value={inrShort(scen.cheapestSingle?.total ?? 0)}
                sub={scen.cheapestSingle?.vendor}
              />
              <Metric
                label="You would save"
                value={inrShort(scen.savingsVsSingle)}
                sub="By buying from multiple suppliers instead of one"
                tone="positive"
              />
              <Metric
                label="Prices needing your review"
                value={cover?.review ?? 0}
                sub={`${scen.unpricedLines.length} items have no usable price yet`}
                tone={(cover?.review ?? 0) > 0 ? "warning" : "neutral"}
              />
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyIssues}
                  onChange={(e) => setOnlyIssues(e.target.checked)}
                  className="size-3.5 accent-[var(--primary)]"
                />
                Show only items with a problem
              </label>
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                The big number is the comparable price. Underneath is what the supplier actually wrote. Click any
                price to see where it came from.
                <Help
                  term="Comparable price"
                  what="Prices are converted into the same currency and the same unit, so a price per box and a price per piece can be compared fairly."
                  why="A supplier quoting per box of 100 can look far more expensive than one quoting per piece, when in fact it is cheaper."
                />
              </span>
            </div>

            <section className="panel overflow-hidden">
              <div className="max-h-[620px] overflow-auto">
                <table className="data-grid">
                  <thead className="sticky top-0 z-20 bg-surface-muted">
                    <tr>
                      <th className="label-xs sticky left-0 z-30 border-b border-r border-border bg-surface-muted px-3 py-2 text-left font-medium">
                        Item
                      </th>
                      <th className="label-xs border-b border-border px-3 py-2 text-right font-medium">Quantity</th>
                      {data.vendors.map((v) => (
                        <th key={v.id} className="label-xs border-b border-border px-3 py-2 text-left font-medium">
                          {v.short_name}
                        </th>
                      ))}
                      <th className="label-xs border-b border-l border-border px-3 py-2 text-left font-medium">
                        Best price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((li) => {
                      const alloc = scen.perLine.find((p) => p.sku === li.sku);
                      return (
                        <tr key={li.id} className="border-b border-border last:border-0">
                          <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2">
                            <div className="num text-[11px] text-muted-foreground">{li.sku}</div>
                            <div className="max-w-[230px] truncate text-[12.5px] text-foreground">
                              {li.description}
                            </div>
                          </td>
                          <td className="num px-3 py-2 text-right text-[12px] text-muted-foreground">
                            {qty(li.quantity)}
                          </td>
                          {data.vendors.map((v) => {
                            const q = data.quotes.find(
                              (x) => x.vendor_id === v.id && x.line_item_id === li.id,
                            );
                            const best = alloc?.vendorId === v.id;
                            return (
                              <td
                                key={v.id}
                                onClick={() => setTarget({ quote: q ?? null, vendor: v, lineItem: li })}
                                className={`cursor-pointer px-3 py-2 align-top transition-colors hover:bg-accent/60 ${
                                  best ? "bg-positive-soft/60" : ""
                                }`}
                              >
                                {!q ? (
                                  <span className="text-[12px] text-muted-foreground">Did not quote this item</span>
                                ) : q.normalized_value == null ? (
                                  <span className="text-[12px] text-warning-foreground">
                                    Needs your review
                                    <span className="block text-[10.5px] text-muted-foreground">
                                      {(q.issue_type ?? "wording unclear").replace(/_/g, " ")}
                                    </span>
                                  </span>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1.5">
                                      <ConfidenceDot confidence={q.confidence} />
                                      <span className="num text-[12.5px] font-medium text-foreground">
                                        {inr(q.normalized_value)}
                                      </span>
                                      {q.requires_review && (
                                        <AlertTriangle className="size-3 text-warning-foreground" />
                                      )}
                                      {q.conflict_note && (
                                        <span className="rounded bg-warning-soft px-1 text-[9.5px] font-medium uppercase tracking-wide text-warning-foreground">
                                          v{q.version ?? 2}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="num mt-0.5 max-w-[150px] truncate text-[10.5px] text-muted-foreground"
                                      title="What the supplier actually wrote"
                                    >
                                      Supplier said:{" "}
                                      {q.original_currency === "USD" ? "$" : q.original_currency === "UNKNOWN" ? "" : "₹"}
                                      {q.original_value?.toLocaleString("en-IN")} {q.original_unit ?? ""}
                                    </div>
                                  </>
                                )}
                              </td>
                            );
                          })}
                          <td className="border-l border-border px-3 py-2">
                            {alloc?.unitPrice == null ? (
                              <Pill tone="warning">No usable price yet</Pill>
                            ) : (
                              <>
                                <div className="num text-[12.5px] font-semibold text-foreground">
                                  {inr(alloc.unitPrice)}
                                </div>
                                <div className="text-[10.5px] text-muted-foreground">{alloc.vendorName}</div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      {data && <EvidenceDrawer target={target} data={data} onClose={() => setTarget(null)} />}
    </>
  );
}
