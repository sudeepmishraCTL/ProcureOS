import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Check, HelpCircle, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SubTabs } from "@/components/AppShell";
import { Metric, Pill } from "@/components/bits";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { qualityPass, statusOf } from "@/lib/procure-math";
import { evaluateQuestionnaire } from "@/lib/procure.functions";

export const Route = createFileRoute("/questionnaire")({
  head: () => ({
    meta: [
      { title: "Supplier Requirements · ProcureOS" },
      {
        name: "description",
        content:
          "Check each supplier against the requirements you set, answered from what they actually sent you, with their own words quoted as proof.",
      },
      { property: "og:title", content: "Supplier Requirements · ProcureOS" },
      { property: "og:description", content: "Who met your requirements, answered from the files suppliers sent." },
    ],
  }),
  component: QuestionnairePage,
});

const STATUS: Record<string, { label: string; tone: "positive" | "warning" | "danger" | "default"; Icon: typeof Check }> = {
  pass: { label: "Meets it", tone: "positive", Icon: Check },
  partial: { label: "Partly", tone: "warning", Icon: AlertTriangle },
  fail: { label: "Does not meet", tone: "danger", Icon: X },
  not_answered: { label: "Did not answer", tone: "default", Icon: HelpCircle },
};

function QuestionnairePage() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [busy, setBusy] = useState(false);
  const pass = data ? qualityPass(data) : {};

  const questions = data?.questions.length
    ? data.questions
    : [...new Set(data?.questionnaire.map((q) => q.question) ?? [])].map((question, i) => ({
        id: `v${i}`,
        question,
        guidance: null,
        mandatory: true,
        sort_order: i,
      }));
  const passing = Object.values(pass).filter((p) => p.pass).length;
  const aiRows = data?.questionnaire.filter((q) => q.source === "ai").length ?? 0;

  const run = async () => {
    setBusy(true);
    const t = toast.loading("Reading every supplier's file against the requirements you set…");
    try {
      const res = await evaluateQuestionnaire({ data: {} });
      refresh();
      toast.success("Checked every supplier against your requirements", {
        id: t,
        description: res.evaluated
          .map(
            (v) =>
              `${v.vendor}: meets ${v.pass} · partly ${v.partial} · does not meet ${v.fail} · did not answer ${v.unanswered}`,
          )
          .join("\n"),
      });
    } catch (e) {
      toast.error("We could not finish checking the supplier files", {
        id: t,
        description: "Try again, or open the supplier's file and check it manually.",
      });
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Supplier Requirements"
        description="Whether each supplier meets what you asked for, answered from the files they sent"
        actions={
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Check supplier requirements
          </button>
        }
      />
      <SubTabs />

      <main className="flex-1 space-y-5 px-6 py-5">
        <section className="grid gap-3 sm:grid-cols-4">
          <Metric
            label="Requirements you set"
            value={questions.length}
            sub={`${questions.filter((q) => q.mandatory).length} must be met`}
          />
          <Metric
            label="Suppliers who met them all"
            value={passing}
            tone="positive"
            sub={`out of ${data?.vendors.length ?? 0}`}
          />
          <Metric
            label="Suppliers who fell short"
            value={(data?.vendors.length ?? 0) - passing}
            tone="warning"
            sub={
              Object.entries(pass)
                .filter(([, p]) => !p.pass)
                .map(([id]) => data?.vendors.find((v) => v.id === id)?.short_name)
                .join(", ") || "None"
            }
          />
          <Metric
            label="Answers read from supplier files"
            value={aiRows}
            sub={aiRows ? "Taken from what they wrote" : "Starting example answers"}
          />
        </section>

        <section className="panel overflow-hidden">
          <div className="overflow-auto">
            <table className="data-grid">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="label-xs border-b border-r border-border px-3 py-2 text-left font-medium">
                    What you asked for
                  </th>
                  {data?.vendors.map((v) => (
                    <th key={v.id} className="label-xs border-b border-border px-3 py-2 text-left font-medium">
                      {v.short_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-b border-border align-top last:border-0">
                    <td className="border-r border-border px-3 py-2 text-[12.5px] text-foreground">
                      {q.question}
                      {q.mandatory && (
                        <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                          must be met
                        </span>
                      )}
                    </td>
                    {data?.vendors.map((v) => {
                      const row = data.questionnaire.find((r) => r.vendor_id === v.id && r.question === q.question);
                      const st = STATUS[statusOf(row)] ?? STATUS["not_answered"]!;
                      const Icon = st.Icon;
                      const tone =
                        st.tone === "positive"
                          ? "text-positive"
                          : st.tone === "warning"
                            ? "text-warning"
                            : st.tone === "danger"
                              ? "text-destructive"
                              : "text-muted-foreground";
                      return (
                        <td key={v.id} className="px-3 py-2">
                          <div className="flex items-start gap-1.5">
                            <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
                            <div className="space-y-1">
                              <span className="block text-[12px] text-foreground">
                                {row?.response ?? "The supplier did not cover this in their file"}
                              </span>
                              {row?.evidence && (
                                <span className="block border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                                  “{row.evidence}”
                                </span>
                              )}
                              {row && (row.status ?? "") !== "not_answered" && (
                                <span
                                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                                    row.verification === "verified"
                                      ? "bg-positive-soft text-positive"
                                      : "bg-warning-soft text-warning-foreground"
                                  }`}
                                  title={row.verification_note ?? undefined}
                                >
                                  {row.verification === "verified"
                                    ? "proof attached"
                                    : "supplier says so, no proof attached"}
                                </span>
                              )}
                              {row?.verification_note && (
                                <span className="block text-[10.5px] text-muted-foreground">
                                  {row.verification_note}
                                </span>
                              )}
                              {row?.source_ref && (
                                <span className="block text-[10.5px] text-muted-foreground">{row.source_ref}</span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-surface-muted">
                  <td className="border-r border-border px-3 py-2 text-[12.5px] font-semibold text-foreground">
                    Overall
                  </td>
                  {data?.vendors.map((v) => {
                    const r = pass[v.id];
                    return (
                      <td key={v.id} className="space-y-1 px-3 py-2">
                        {r?.pass ? (
                          <Pill tone="positive">Meets your requirements</Pill>
                        ) : (
                          <Pill tone="danger">Does not meet your requirements</Pill>
                        )}
                        {!!r?.failed.length && (
                          <div className="text-[10.5px] text-destructive">{r.failed.length} not met</div>
                        )}
                        {!!r?.unanswered.length && (
                          <div className="text-[10.5px] text-warning">{r.unanswered.length} not answered</div>
                        )}
                        {!!r?.partial.length && (
                          <div className="text-[10.5px] text-muted-foreground">{r.partial.length} partly met</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          A supplier falls short when they miss, or never answer, something you marked as <strong>must be met</strong>.
          No answer is never counted as a yes. A green badge means they attached proof, such as a certificate. An amber
          badge means they simply told you so, which is worth confirming before you commit. You set these requirements
          in Your Request. Suppliers who fall short are still shown here: in Compare Purchase Options you can tick
          &ldquo;only suppliers who met my requirements&rdquo; to see what insisting on them costs you.
        </p>
      </main>
    </>
  );
}
