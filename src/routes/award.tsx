import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gavel, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { ConfidenceDot, EmptyState, Metric, Pill } from "@/components/bits";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { computeScenarios, qualityPass } from "@/lib/procure-math";
import { approveAward } from "@/lib/procure.functions";
import { inr, inrShort, qty } from "@/lib/format";

export const Route = createFileRoute("/award")({
  head: () => ({
    meta: [
      { title: "Purchase Recommendation · ProcureOS" },
      {
        name: "description",
        content:
          "A recommended plan for what to buy from which supplier, with the reason for every choice, and nothing finalised until you confirm the open questions.",
      },
      { property: "og:title", content: "Purchase Recommendation · ProcureOS" },
      { property: "og:description", content: "What to buy from whom, and why, with your sign off required." },
    ],
  }),
  component: AwardPage,
});

function AwardPage() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [complianceOnly, setComplianceOnly] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const scen = useMemo(
    () => (data && data.quotes.length ? computeScenarios(data, { excludeFailedQuality: complianceOnly }) : null),
    [data, complianceOnly],
  );
  const baseline = useMemo(() => (data && data.quotes.length ? computeScenarios(data) : null), [data]);
  const pass = data ? qualityPass(data) : {};

  const blockers = (scen?.reviewLinesInAward.length ?? 0) + (scen?.unpricedLines.length ?? 0);
  const persisted = data?.awards.find((a) => a.status !== "revoked");
  const approved = Boolean(persisted);

  const approve = async () => {
    if (!scen) return;
    setSaving(true);
    try {
      await approveAward({
        data: {
          strategy: complianceOnly
            ? "Split across suppliers who met your requirements"
            : "Split across all suppliers",
          totalValue: scen.splitTotal,
          allocation: scen.perLine.map((l) => ({
            sku: l.sku,
            description: l.description,
            vendor: l.vendorId ? l.vendorName : null,
            quantity: l.quantity,
            unitPrice: l.unitPrice ?? null,
            lineValue: l.lineValue,
            reason: l.reason,
          })),
          acknowledgedItems: [...scen.reviewLinesInAward, ...scen.unpricedLines],
          notes: `Saves ${inrShort(scen.savingsVsSingle)} compared with buying everything from ${scen.cheapestSingle?.vendor ?? "-"}`,
        },
      });
      toast.success("Purchase plan finalised", { description: "Saved, and recorded in your activity history" });
      refresh();
    } catch (e) {
      toast.error("We could not save your decision", { description: "Please try again in a moment." });
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (data && data.quotes.length === 0) {
    return (
      <>
        <PageHeader title="Purchase Recommendation" description="What to buy from which supplier, and why" />
        <main className="flex-1 px-6 py-5">
          <EmptyState
            title="No recommendation yet"
            description="We will not suggest what to buy until the supplier files have been read and their prices made comparable. Start by reading the supplier responses."
            action={
              <Link to="/responses" className="inline-flex rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground">
                Read supplier responses
              </Link>
            }
          />
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Purchase Recommendation"
        description="Our suggested plan. Nothing is final until you confirm it."
        actions={
          <button
            onClick={() => setShowWhy((s) => !s)}
            className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
          >
            {showWhy ? "Hide explanation" : "Why this plan?"}
          </button>
        }
      />

      <main className="flex-1 space-y-5 px-6 py-5">
        {(scen?.unpricedLines.length ?? 0) > 0 && (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-foreground">
            {scen!.unpricedLines.length} item(s), covering {scen!.unpricedQuantity.toLocaleString("en-IN")} units,
            have no usable price. They are left out of the figure below rather than counted as free, so the real
            spend will be higher.
          </p>
        )}
        {(scen?.conflictLines.length ?? 0) > 0 && (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-foreground">
            For {scen!.conflictLines.length} item(s), a supplier sent two different prices (
            {scen!.conflictLines.slice(0, 5).join(", ")}). We are using the newer file. Worth settling these in Needs
            Your Review before you commit.
          </p>
        )}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="What this plan costs"
            value={inrShort(scen?.splitTotal ?? 0)}
            tone="primary"
            sub={`${scen?.perLine.filter((l) => l.vendorId).length ?? 0} of ${data?.lineItems.length ?? 0} items covered`}
          />
          <Metric
            label="You save"
            value={inrShort(scen?.savingsVsSingle ?? 0)}
            tone="positive"
            sub={`Compared with buying everything from ${scen?.cheapestSingle?.vendor ?? "-"}`}
          />
          <Metric
            label="Suppliers you would use"
            value={new Set(scen?.perLine.filter((l) => l.vendorId).map((l) => l.vendorName)).size}
            sub={scen?.eligibleVendors.join(", ")}
          />
          <Metric
            label="Open questions"
            value={blockers}
            tone={blockers ? "warning" : "positive"}
            sub={blockers ? "Confirm these before you finalise" : "Nothing outstanding"}
          />
        </section>

        <section className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
            <input
              type="checkbox"
              checked={complianceOnly}
              onChange={(e) => {
                setComplianceOnly(e.target.checked);
              }}
              className="size-3.5 accent-[var(--primary)]"
            />
            Only buy from suppliers who met your requirements
          </label>
          <div className="text-[11.5px] text-muted-foreground">
            {complianceOnly
              ? `Leaves out ${baseline?.excludedForQuality.join(", ") || "nobody"}, which costs ${inrShort(
                  (scen?.splitTotal ?? 0) - (baseline?.splitTotal ?? 0),
                )} more than buying from anyone`
              : "Suppliers who fell short of your requirements are included in this view"}
          </div>
        </section>

        {showWhy && scen && (
          <section className="panel p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <ShieldCheck className="size-4 text-primary" /> Why we suggest this
            </div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>
                · Every supplier price was converted into rupees per piece first. A price per box of 100 was divided
                by 100, and dollar prices were converted at ₹{data?.rfx.fx_rate} to the dollar, so no supplier looks
                cheaper simply because of how they wrote their quote.
              </li>
              <li>
                · Each item goes to whoever offered the lowest price we can rely on
                {complianceOnly ? ", once suppliers who fell short of your requirements are set aside" : ""}.
              </li>
              <li>
                · Prices we are not fully certain about are left out rather than assumed correct, and items with no
                usable price are left unassigned rather than estimated.
              </li>
              <li>
                · Spreading the order across suppliers saves {inrShort(scen.savingsVsSingle)} compared with buying
                everything from {scen.cheapestSingle?.vendor}.
              </li>
            </ul>
          </section>
        )}

        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-foreground">Buy from multiple suppliers</span>
              <Pill>Split award</Pill>
            </div>
            <span className="text-[11.5px] text-muted-foreground">
              Each item goes to whoever gave the lowest price we can rely on, so you are not tied to one supplier
            </span>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="data-grid">
              <thead className="sticky top-0 bg-surface-muted">
                <tr>
                  {["Item code", "Item", "Quantity", "Buy from", "Price per piece", "Why", "Total"].map((h) => (
                    <th key={h} className="label-xs border-b border-border px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scen?.perLine.map((l) => (
                  <tr key={l.sku} className="border-b border-border last:border-0">
                    <td className="num px-3 py-1.5 text-[12px] text-muted-foreground">{l.sku}</td>
                    <td className="max-w-[230px] truncate px-3 py-1.5 text-[12.5px] text-foreground">
                      {l.description}
                    </td>
                    <td className="num px-3 py-1.5 text-[12px] text-muted-foreground">{qty(l.quantity)}</td>
                    <td className="px-3 py-1.5">
                      {l.vendorId ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground">
                          <ConfidenceDot confidence={l.confidence} />
                          {l.vendorName}
                        </span>
                      ) : (
                        <Pill tone="warning">Nobody yet</Pill>
                      )}
                    </td>
                    <td className="num px-3 py-1.5 text-[12.5px] text-foreground">
                      {l.unitPrice == null ? "-" : inr(l.unitPrice)}
                    </td>
                    <td className="px-3 py-1.5 text-[11.5px] text-muted-foreground">{l.reason}</td>
                    <td className="num px-3 py-1.5 text-right text-[12.5px] text-foreground">
                      {l.lineValue ? inr(l.lineValue, 0) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {data && (
          <section className="panel p-4">
            <div className="text-[13px] font-semibold text-foreground">Before you approve</div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              A plain summary of what is settled and what is not, so nothing is hidden from you at the last step.
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px]">
              <CheckRow
                ok
                text={`${data.quotes.filter((q) => q.status === "extracted" && q.normalized_value != null && !q.requires_review).length} prices were read clearly and can be relied on`}
              />
              <CheckRow
                ok={(scen?.reviewLinesInAward.length ?? 0) === 0}
                text={
                  (scen?.reviewLinesInAward.length ?? 0) === 0
                    ? "No price in this plan needs your review"
                    : `${scen!.reviewLinesInAward.length} price(s) in this plan still need your review`
                }
              />
              <CheckRow
                ok={(scen?.unpricedLines.length ?? 0) === 0}
                text={
                  (scen?.unpricedLines.length ?? 0) === 0
                    ? "Every item on your list has a supplier"
                    : `${scen!.unpricedLines.length} item(s) were not quoted by anyone you allowed, and are left out rather than counted as free`
                }
              />
              <CheckRow
                ok={Object.values(pass).every((p) => p.pass)}
                text={
                  Object.values(pass).every((p) => p.pass)
                    ? "Every supplier met your required quality standards"
                    : `${Object.values(pass).filter((p) => !p.pass && p.failed.length).length} supplier(s) do not meet required quality standards`
                }
              />
              <CheckRow
                ok={Object.values(pass).every((p) => p.unanswered.length === 0)}
                text={
                  Object.values(pass).every((p) => p.unanswered.length === 0)
                    ? "Every supplier answered all your questions"
                    : `${Object.values(pass).filter((p) => p.unanswered.length > 0).length} supplier(s) left some of your questions unanswered`
                }
              />
              <CheckRow
                ok={(data.unmatched.length ?? 0) === 0}
                text={
                  data.unmatched.length === 0
                    ? "Every price a supplier sent was matched to one of your items"
                    : `${data.unmatched.length} priced line(s) could not be matched to your list and are left out`
                }
              />
            </ul>
          </section>
        )}

        <section
          className={`panel p-4 ${blockers && !acknowledged ? "border-warning/30 bg-warning-soft" : ""}`}
        >
          <div className="flex items-start gap-2.5">
            {blockers ? (
              <AlertTriangle className="mt-0.5 size-4 text-warning-foreground" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 text-positive" />
            )}
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-foreground">Your decision</div>
              {blockers ? (
                <>
                  <p className="mt-1 text-[12px] text-warning-foreground">
                    This plan relies on {scen?.reviewLinesInAward.length ?? 0} price(s) we are not fully certain about
                    {scen?.unpricedLines.length
                      ? `, and ${scen.unpricedLines.length} item(s) still have nobody to buy from (${scen.unpricedLines
                          .slice(0, 5)
                          .join(", ")})`
                      : ""}
                    . You need to confirm you have seen these before finalising.
                  </p>
                  {scen?.reviewLinesInAward.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {scen.reviewLinesInAward.map((sku) => (
                        <Pill key={sku} tone="warning">
                          {sku} needs your review
                        </Pill>
                      ))}
                    </div>
                  ) : null}
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="size-3.5 accent-[var(--primary)]"
                    />
                    I have looked at these and I am happy to go ahead
                  </label>
                  <Link to="/review" className="mt-1 inline-block text-[11.5px] font-medium text-primary hover:underline">
                    Open Needs Your Review →
                  </Link>
                </>
              ) : (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Nothing is outstanding. Every price in this plan was read clearly from a supplier file, and you can
                  trace each one back to the exact wording they used.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={approve}
                  disabled={approved || saving || (blockers > 0 && !acknowledged)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {blockers > 0 && !acknowledged ? <Lock className="size-3.5" /> : <Gavel className="size-3.5" />}
                  {approved ? "Purchase finalised" : saving ? "Saving…" : "Finalize purchase"}
                </button>
                {persisted && (
                  <Pill tone="positive">
                    <CheckCircle2 className="size-3" /> Finalised by {persisted.approved_by} ·{" "}
                    {inrShort(Number(persisted.total_value))} · {persisted.strategy}
                  </Pill>
                )}
                {!approved && blockers > 0 && !acknowledged && (
                  <span className="text-[11.5px] text-muted-foreground">
                    Tick the box above to continue
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-5">
          {data?.vendors.map((v) => {
            const lines = scen?.perLine.filter((l) => l.vendorName === v.short_name) ?? [];
            const value = lines.reduce((s, l) => s + l.lineValue, 0);
            return (
              <div key={v.id} className="panel px-3 py-2.5">
                <div className="truncate text-[12.5px] font-medium text-foreground">{v.short_name}</div>
                <div className="num mt-1 text-[14px] font-semibold text-foreground">{inrShort(value)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{lines.length} items from them</div>
                <div className="mt-1.5">
                  {pass[v.id]?.pass ? (
                    <Pill tone="positive">Meets requirements</Pill>
                  ) : (
                    <Pill tone="danger">Falls short</Pill>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}

function CheckRow({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-positive" />
      ) : (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
      )}
      <span className={ok ? "text-foreground" : "text-warning-foreground"}>{text}</span>
    </li>
  );
}
