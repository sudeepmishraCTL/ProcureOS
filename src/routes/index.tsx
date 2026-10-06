import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Metric, Pill, SectionTitle } from "@/components/bits";
import { useProcurement } from "@/lib/data";
import { computeScenarios, coverageStats, qualityPass } from "@/lib/procure-math";
import { inrShort, dateOf, qty } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · ProcureOS sourcing control room" },
      {
        name: "description",
        content:
          "Live status of RFx-2026-014: vendor response coverage, extraction confidence, open review items and the current optimized award value.",
      },
      { property: "og:title", content: "Overview · ProcureOS sourcing control room" },
      {
        property: "og:description",
        content: "Vendor response coverage, extraction confidence and the current optimized award value.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { data, isLoading } = useProcurement();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where this purchase stands right now, from request to decision"
        actions={
          <Link
            to="/intelligence"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Compare supplier prices <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <main className="flex-1 space-y-6 px-6 py-5">
        {isLoading && <div className="text-sm text-muted-foreground">Loading your request…</div>}
        {data && <OverviewBody data={data} />}
      </main>
    </>
  );
}

function OverviewBody({ data }: { data: NonNullable<ReturnType<typeof useProcurement>["data"]> }) {
  const cover = coverageStats(data);
  const scen = computeScenarios(data);
  const compliant = computeScenarios(data, { excludeFailedQuality: true });
  const pass = qualityPass(data);
  const processed = data.responses.filter((r) => r.processed_at).length;
  const extracted = data.quotes.length > 0;

  return (
    <>
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label-xs">This purchase</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{data.rfx.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="num">{data.rfx.code}</span>
              <span>·</span>
              <span>{data.rfx.category}</span>
              <span>·</span>
              <span>Prices in {data.rfx.currency}</span>
              <span>·</span>
              <span>Started {dateOf(data.rfx.created_at ?? new Date().toISOString())}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="primary">{data.rfx.status}</Pill>
            <Pill tone={processed === data.responses.length ? "positive" : "warning"}>
              {processed} of {data.responses.length} supplier responses read
            </Pill>
          </div>
        </div>

        <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {[
            { label: "Request sent", done: data.responses.length > 0 || Boolean(data.rfx.sent_at) },
            { label: "Supplier responses received", done: data.responses.length > 0 },
            { label: "Prices compared", done: extracted },
            { label: "Issues to review", done: extracted && cover.review === 0 },
            { label: "Purchase decision", done: data.awards.length > 0 },
          ].map((s, i, arr) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span
                className={`rounded-md border px-2 py-1 ${
                  s.done
                    ? "border-positive/25 bg-positive-soft text-positive-foreground"
                    : "border-border bg-surface-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
              {i < arr.length - 1 && <ArrowRight className="size-3 text-muted-foreground" />}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Suppliers invited"
          value={data.vendors.length}
          sub={`${data.responses.length} responses received`}
        />
        <Metric
          label="Items you asked for"
          value={data.lineItems.length}
          sub={`${qty(data.lineItems.reduce((s, l) => s + l.quantity, 0))} units in total`}
        />
        <Metric
          label="Prices found"
          value={`${cover.extracted} of ${cover.expected}`}
          sub={`${cover.missing} items were not quoted`}
          tone={extracted ? "neutral" : "warning"}
        />
        <Metric
          label="Needs your review"
          value={cover.review}
          sub="Where the supplier's wording was unclear"
          tone={cover.review > 0 ? "warning" : "positive"}
        />
      </section>

      {!extracted ? (
        <section className="panel flex flex-wrap items-center justify-between gap-4 border-warning/30 bg-warning-soft p-5">
          <div className="flex items-start gap-3">
            <FileWarning className="mt-0.5 size-5 text-warning-foreground" />
            <div>
              <div className="text-[13px] font-semibold text-warning-foreground">
                Supplier files have not been read yet
              </div>
              <p className="mt-1 max-w-xl text-xs text-warning-foreground/90">
                Supplier replies are waiting: a spreadsheet, a PDF, a Word document, a
                photographed price list and an email. Ask the system to read them and it will turn every file into
                prices you can compare side by side.
              </p>
            </div>
          </div>
          <Link
            to="/responses"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to Supplier Replies <ArrowRight className="size-3.5" />
          </Link>
        </section>
      ) : (
        <section className="grid gap-3 lg:grid-cols-3">
          <Metric
            label="Cheapest if you buy everything from one supplier"
            value={inrShort(scen.cheapestSingle?.total ?? 0)}
            sub={`${scen.cheapestSingle?.vendor}, covering ${scen.cheapestSingle?.covered} items`}
          />
          <Metric
            label="If you buy from multiple suppliers"
            value={inrShort(scen.splitTotal)}
            sub={`${inrShort(scen.savingsVsSingle)} less than using one supplier`}
            tone="primary"
          />
          <Metric
            label="Using only suppliers who met your requirements"
            value={inrShort(compliant.splitTotal)}
            sub={
              scen.excludedForQuality.length
                ? `Leaves out ${scen.excludedForQuality.join(", ")}`
                : "No supplier had to be left out"
            }
            tone="positive"
          />
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle aside={<Link to="/responses" className="text-[11.5px] font-medium text-primary hover:underline">Supplier Replies</Link>}>
            What each supplier sent
          </SectionTitle>
          <div className="panel divide-y divide-border">
            {data.responses.map((r) => {
              const v = data.vendors.find((x) => x.id === r.vendor_id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-foreground">{v?.name}</div>
                    <div className="num truncate text-[11px] text-muted-foreground">{r.source_file}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill>{r.source_type}</Pill>
                    {r.processed_at ? (
                      <Pill tone="positive">
                        <CheckCircle2 className="size-3" /> Read
                      </Pill>
                    ) : (
                      <Pill tone="warning">Not read yet</Pill>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <SectionTitle aside={<Link to="/questionnaire" className="text-[11.5px] font-medium text-primary hover:underline">Supplier Requirements</Link>}>
            Who met your requirements
          </SectionTitle>
          <div className="panel divide-y divide-border">
            {data.vendors.map((v) => {
              const p = pass[v.id];
              return (
                <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-foreground">{v.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p?.pass
                        ? "Met every requirement you set"
                        : `Did not meet ${p?.failed.length} of your requirements`}
                    </div>
                  </div>
                  {p?.pass ? (
                    <Pill tone="positive">
                      <CheckCircle2 className="size-3" /> Meets requirements
                    </Pill>
                  ) : (
                    <Pill tone="danger">
                      <AlertTriangle className="size-3" /> Does not meet
                    </Pill>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
