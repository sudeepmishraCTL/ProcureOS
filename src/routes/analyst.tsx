import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SubTabs } from "@/components/AppShell";
import { Pill } from "@/components/bits";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { askAnalyst, type AnalystAnswer } from "@/lib/procure.functions";

export const Route = createFileRoute("/analyst")({
  head: () => ({
    meta: [
      { title: "Ask the AI Analyst · ProcureOS" },
      {
        name: "description",
        content:
          "Ask a question about this purchase in plain English and get a clear answer worked out from the supplier prices, with the numbers and sources shown.",
      },
      { property: "og:title", content: "Ask the AI Analyst · ProcureOS" },
      {
        property: "og:description",
        content: "Plain English answers about supplier prices, with the working shown.",
      },
    ],
  }),
  component: AnalystPage,
});

const SUGGESTED = [
  "Which supplier is cheapest overall?",
  "What is the cheapest option using only suppliers who met my requirements?",
  "Buy each item from whoever is cheapest",
  "Leave out suppliers who did not meet my requirements",
  "Which prices should I check before deciding?",
  "Are any prices unusually high or low?",
  "How much do I save by using more than one supplier?",
  "Balance price against whether the supplier met my requirements",
  "What did you assume when working this out?",
];

function AnalystPage() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: AnalystAnswer }>>([]);

  const ask = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setQuestion("");
    try {
      const a = (await askAnalyst({ data: { question: q } })) as AnalystAnswer;
      setHistory((h) => [{ q, a }, ...h]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const noQuotes = data && data.quotes.length === 0;

  return (
    <>
      <PageHeader
        title="Ask the AI Analyst"
        description="Ask anything about this purchase. Every answer is worked out from the supplier prices on file."
      />
      <SubTabs />

      <main className="flex-1 space-y-4 px-6 py-5">
        <section className="panel p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex items-center gap-2"
          >
            <Sparkles className="size-4 shrink-0 text-primary" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="For example: which supplier is cheapest, and what would I give up by choosing them?"
              className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Ask
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={loading}
                className="rounded border border-border bg-surface-muted px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {noQuotes && (
          <div className="panel border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] text-warning-foreground">
            There are no supplier prices on file yet, so there is nothing to answer questions about. Open Supplier
            Responses and ask the system to read the supplier files first.
          </div>
        )}

        {loading && (
          <div className="panel flex items-center gap-2 px-4 py-3 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Working through the supplier prices…
          </div>
        )}

        {history.map((item, i) => (
          <AnswerCard key={i} question={item.q} answer={item.a} />
        ))}
      </main>
    </>
  );
}

function AnswerCard({ question, answer }: { question: string; answer: AnalystAnswer }) {
  return (
    <article className="panel overflow-hidden">
      <div className="border-b border-border bg-surface-muted px-4 py-2.5 text-[12.5px] font-medium text-foreground">
        {question}
      </div>
      <div className="space-y-4 p-4">
        <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{answer.headline}</h3>

        {answer.appliedConstraints && (
          <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
            <div className="label-xs">I recalculated using these rules</div>
            <p className="mt-1 text-[12px] text-foreground">{answer.appliedConstraints.interpretation}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {answer.appliedConstraints.excludeVendors.length > 0 && (
                <span className="rounded border border-border px-1.5 py-0.5">
                  left out {answer.appliedConstraints.excludeVendors.length} supplier(s)
                </span>
              )}
              {answer.appliedConstraints.excludeFailedQuality && (
                <span className="rounded border border-border px-1.5 py-0.5">
                  only suppliers who met your requirements
                </span>
              )}
              {answer.appliedConstraints.maxVendors != null && (
                <span className="rounded border border-border px-1.5 py-0.5">
                  at most {answer.appliedConstraints.maxVendors} suppliers
                </span>
              )}
              {answer.appliedConstraints.minCoverage != null && (
                <span className="rounded border border-border px-1.5 py-0.5">
                  supplier must have quoted at least {answer.appliedConstraints.minCoverage}% of your items
                </span>
              )}
              {answer.appliedConstraints.includeLowConfidence && (
                <span className="rounded border border-border px-1.5 py-0.5">
                  prices we are not fully certain about included
                </span>
              )}
              {answer.appliedConstraints.onlySkus.length > 0 && (
                <span className="rounded border border-border px-1.5 py-0.5">
                  {answer.appliedConstraints.onlySkus.length} item(s) only
                </span>
              )}
            </div>
          </div>
        )}


        {answer.metrics && answer.metrics.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {answer.metrics.map((m, i) => (
              <div key={i} className="rounded-md border border-border bg-surface-muted px-3 py-2">
                <div className="label-xs">{m.label}</div>
                <div className="num mt-1 text-[14px] font-semibold text-foreground">{m.value}</div>
              </div>
            ))}
          </div>
        )}

        {answer.body && <p className="text-[12.5px] leading-relaxed text-muted-foreground">{answer.body}</p>}

        {answer.allocation && answer.allocation.length > 0 && (
          <Block title="What to buy from whom">
            <table className="data-grid">
              <tbody>
                {answer.allocation.map((a, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 text-[12.5px] font-medium text-foreground">{a.vendor}</td>
                    <td className="num px-3 py-1.5 text-[12px] text-muted-foreground">{a.lines} items</td>
                    <td className="num px-3 py-1.5 text-right text-[12.5px] text-foreground">{a.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        {answer.calculation && answer.calculation.length > 0 && (
          <Block title="How I worked it out">
            <ol className="num space-y-1 px-3 py-2 text-[11.5px] text-muted-foreground">
              {answer.calculation.map((c, i) => (
                <li key={i}>
                  {i + 1}. {c}
                </li>
              ))}
            </ol>
          </Block>
        )}

        {answer.evidence && answer.evidence.length > 0 && (
          <Block title="What I used">
            <table className="data-grid">
              <thead className="bg-surface-muted">
                <tr>
                  {["Item", "Supplier", "What the supplier wrote", "Comparable price", "How sure we are"].map((h) => (
                    <th key={h} className="label-xs border-b border-border px-3 py-1.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {answer.evidence.map((e, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="num px-3 py-1.5 text-[12px] text-foreground">{e.sku}</td>
                    <td className="px-3 py-1.5 text-[12px] text-foreground">{e.vendor}</td>
                    <td className="px-3 py-1.5 text-[11.5px] italic text-muted-foreground">&ldquo;{e.original}&rdquo;</td>
                    <td className="num px-3 py-1.5 text-[12px] text-foreground">{e.normalized}</td>
                    <td className="px-3 py-1.5">
                      <Pill
                        tone={e.confidence === "high" ? "positive" : e.confidence === "medium" ? "warning" : "danger"}
                      >
                        {e.confidence === "high"
                          ? "Clear"
                          : e.confidence === "medium"
                            ? "Mostly clear"
                            : "Not fully certain"}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Block>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {answer.assumptions && answer.assumptions.length > 0 && (
            <Block title="What I assumed">
              <ul className="space-y-1 px-3 py-2 text-[11.5px] text-muted-foreground">
                {answer.assumptions.map((a, i) => (
                  <li key={i}>· {a}</li>
                ))}
              </ul>
            </Block>
          )}
          {answer.caveats && answer.caveats.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning-soft">
              <div className="label-xs border-b border-warning/20 px-3 py-1.5 text-warning-foreground">
                Things to check
              </div>
              <ul className="space-y-1 px-3 py-2 text-[11.5px] text-warning-foreground">
                {answer.caveats.map((c, i) => (
                  <li key={i}>· {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="label-xs border-b border-border bg-surface-muted px-3 py-1.5">{title}</div>
      {children}
    </div>
  );
}
