import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, SubTabs } from "@/components/AppShell";
import { EmptyState, Metric, Pill } from "@/components/bits";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { computeScenarios, qualityPass, vendorCoverage, type Constraints } from "@/lib/procure-math";
import { saveScenario } from "@/lib/procure.functions";
import { inr, inrShort } from "@/lib/format";

export const Route = createFileRoute("/scenarios")({
  head: () => ({
    meta: [
      { title: "Compare Purchase Options · ProcureOS" },
      {
        name: "description",
        content:
          "Try out different ways of buying, such as using fewer suppliers or only those who met your requirements, and see instantly what each choice costs you.",
      },
      { property: "og:title", content: "Compare Purchase Options · ProcureOS" },
      { property: "og:description", content: "See what each way of buying would cost before you commit." },
    ],
  }),
  component: ScenarioLab,
});

function ScenarioLab() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [c, setC] = useState<Constraints>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const baseline = useMemo(() => (data ? computeScenarios(data) : null), [data]);
  const scenario = useMemo(
    () => (data ? computeScenarios(data, { ...c, excludeVendors: excluded }) : null),
    [data, c, excluded],
  );
  const pass = data ? qualityPass(data) : {};

  const coverageDropped = useMemo(() => {
    if (!data || !c.minCoverage) return [];
    const cov = vendorCoverage(data);
    return data.vendors
      .filter((v) => (cov[v.id]?.pct ?? 0) < (c.minCoverage ?? 0))
      .map((v) => v.short_name);
  }, [data, c.minCoverage]);

  const save = async () => {
    if (!scenario) return;
    setBusy(true);
    try {
      await saveScenario({
        data: {
          name: name.trim() || `Scenario ${new Date().toLocaleString("en-IN")}`,
          constraints: { ...c, excludeVendors: excluded } as Record<string, unknown>,
          result: {
            total: scenario.splitTotal,
            eligibleVendors: scenario.eligibleVendors,
            unpricedLines: scenario.unpricedLines,
            savingsVsSingle: scenario.savingsVsSingle,
          },
        },
      });
      toast.success("Option saved", { description: "Added to your activity history" });
      refresh();
    } catch (e) {
      toast.error("We could not save this option", { description: "Please try again in a moment." });
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (data && data.quotes.length === 0) {
    return (
      <>
        <PageHeader
          title="Compare Purchase Options"
          description="Try different ways of buying and see what each one costs"
        />
        <SubTabs />
        <main className="flex-1 px-6 py-5">
          <EmptyState
            title="No prices to compare yet"
            description="This page works out what different buying choices would cost, so it needs supplier prices first. Open Supplier Replies and ask the system to read the supplier files."
          />
        </main>
      </>
    );
  }

  const delta = (scenario?.splitTotal ?? 0) - (baseline?.splitTotal ?? 0);

  return (
    <>
      <PageHeader
        title="Compare Purchase Options"
        description="Change the rules below and see instantly what each way of buying would cost"
      />
      <SubTabs />

      <main className="flex-1 space-y-5 px-6 py-5">
        <section className="panel p-4">
          <div className="label-xs mb-3">Your rules for this option</div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Toggle
                label="Only use suppliers who met my requirements"
                checked={!!c.excludeFailedQuality}
                onChange={(v) => setC((s) => ({ ...s, excludeFailedQuality: v }))}
              />
              <Toggle
                label="Include prices we are not fully certain about"
                checked={!!c.includeLowConfidence}
                onChange={(v) => setC((s) => ({ ...s, includeLowConfidence: v }))}
              />
            </div>

            <div>
              <div className="label-xs mb-1.5">Buy from at most this many suppliers</div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() =>
                      setC((s) => {
                        const { maxVendors, ...rest } = s;
                        return maxVendors === n ? rest : { ...rest, maxVendors: n };
                      })
                    }
                    className={`num h-7 w-8 rounded border text-[12px] transition-colors ${
                      c.maxVendors === n
                        ? "border-primary/40 bg-accent text-accent-foreground"
                        : "border-border bg-surface text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="label-xs mb-1.5">Leave out particular suppliers</div>
              <div className="flex flex-wrap gap-1.5">
                {data?.vendors.map((v) => {
                  const off = excluded.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() =>
                        setExcluded((s) => (off ? s.filter((x) => x !== v.id) : [...s, v.id]))
                      }
                      className={`rounded border px-2 py-1 text-[11.5px] transition-colors ${
                        off
                          ? "border-destructive/30 bg-danger-soft text-destructive line-through"
                          : "border-border bg-surface text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {v.short_name}
                      {!pass[v.id]?.pass && " ⚠"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="label-xs mb-1.5">
                Only use suppliers who priced at least {c.minCoverage ?? 0}% of your items
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={c.minCoverage ?? 0}
                onChange={(e) => setC((s) => ({ ...s, minCoverage: Number(e.target.value) }))}
                className="w-full accent-[var(--primary)]"
              />
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                {coverageDropped.length
                  ? `This leaves out ${coverageDropped.join(", ")}, who priced too few of your items`
                  : "Every supplier clears this"}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <input
                className="w-full rounded border border-border bg-surface-muted px-2 py-1.5 text-[12.5px] text-foreground outline-none focus:border-primary/60"
                placeholder="Give this option a name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button
                onClick={save}
                disabled={busy || !scenario}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save this option"}
              </button>
            </div>
          </div>

          {!!data?.scenarios.length && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="label-xs mb-1.5">Options you saved earlier</div>
              <div className="flex flex-wrap gap-2">
                {data.scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      const { excludeVendors, ...rest } = (s.constraints ?? {}) as Constraints;
                      setExcluded(excludeVendors ?? []);
                      setC(rest);
                      setName(s.name);
                    }}
                    className="rounded border border-border bg-surface px-2.5 py-1 text-left text-[11.5px] text-muted-foreground hover:bg-secondary"
                  >
                    <span className="text-foreground">{s.name}</span> ·{" "}
                    {inrShort(Number((s.result as { total?: number } | null)?.total ?? 0))}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Cost with no rules applied"
            value={inrShort(baseline?.splitTotal ?? 0)}
            sub="Buying each item from whoever is cheapest"
          />
          <Metric
            label="Cost with your rules"
            value={inrShort(scenario?.splitTotal ?? 0)}
            tone="primary"
            sub={`${scenario?.eligibleVendors.length ?? 0} suppliers can be used`}
          />
          <Metric
            label="Difference"
            value={`${delta >= 0 ? "+" : "−"}${inrShort(Math.abs(delta))}`}
            tone={delta > 0 ? "warning" : "positive"}
            sub={delta === 0 ? "Same either way" : delta > 0 ? "Your rules cost more" : "Your rules cost less"}
          />
          <Metric
            label="Items with no usable price"
            value={scenario?.unpricedLines.length ?? 0}
            tone={(scenario?.unpricedLines.length ?? 0) > 0 ? "warning" : "positive"}
            sub={scenario?.unpricedLines.slice(0, 4).join(", ") || "Every item has a price"}
          />
        </section>

        {(scenario?.unpricedLines.length ?? 0) > 0 && (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-foreground">
            This total is incomplete, not cheap. {scenario!.unpricedLines.length} item(s), covering{" "}
            {scenario!.unpricedQuantity.toLocaleString("en-IN")} units, have no usable price from the suppliers your
            rules allow, so they are left out of the figure above rather than counted as free.
          </p>
        )}

        <section className="panel overflow-hidden">
          <div className="label-xs border-b border-border bg-surface-muted px-3 py-2">
            What you would buy from whom
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="data-grid">
              <thead className="sticky top-0 bg-surface-muted">
                <tr>
                  {["Item code", "Item", "Supplier", "Price per piece", "Without your rules", "Total for this item"].map((h) => (
                    <th key={h} className="label-xs border-b border-border px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenario?.perLine.map((l) => {
                  const b = baseline?.perLine.find((x) => x.sku === l.sku);
                  const changed = b?.vendorName !== l.vendorName;
                  return (
                    <tr key={l.sku} className="border-b border-border last:border-0">
                      <td className="num px-3 py-1.5 text-[12px] text-muted-foreground">{l.sku}</td>
                      <td className="max-w-[240px] truncate px-3 py-1.5 text-[12.5px] text-foreground">
                        {l.description}
                      </td>
                      <td className="px-3 py-1.5 text-[12.5px] text-foreground">
                        {l.vendorId ? l.vendorName : <Pill tone="warning">No usable price</Pill>}
                      </td>
                      <td className="num px-3 py-1.5 text-[12.5px] text-foreground">
                        {l.unitPrice == null ? "-" : inr(l.unitPrice)}
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-muted-foreground">
                        {changed ? <Pill tone="warning">would have been {b?.vendorName}</Pill> : "no change"}
                      </td>
                      <td className="num px-3 py-1.5 text-right text-[12.5px] text-foreground">
                        {inr(l.lineValue, 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}
