import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, Pill } from "@/components/bits";
import { useProcurement } from "@/lib/data";
import { dateOf, timeOf } from "@/lib/format";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Activity History · ProcureOS" },
      {
        name: "description",
        content:
          "A dated record of everything that happened on this purchase: files read, prices found, issues raised, and the decisions you made.",
      },
      { property: "og:title", content: "Activity History · ProcureOS" },
      { property: "og:description", content: "A dated record of everything that happened on this purchase." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { data } = useProcurement();
  const rows = [...(data?.audit ?? [])].reverse();

  return (
    <>
      <PageHeader
        title="Activity History"
        description="Everything that has happened on this purchase, newest first, with who did it"
      />
      <main className="flex-1 px-6 py-5">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing has happened yet"
            description="As soon as you send the request or a supplier file is read, every step will be recorded here with the date and who did it."
          />
        ) : (
          <div className="panel divide-y divide-border">
            {rows.map((a) => (
              <div key={a.id} className="flex gap-4 px-4 py-2.5">
                <div className="num w-32 shrink-0 text-[11px] text-muted-foreground">
                  <div>{dateOf(a.created_at)}</div>
                  <div>{timeOf(a.created_at)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-medium text-foreground">{a.event}</span>
                    <Pill tone={a.actor === "ProcureOS AI" ? "primary" : "neutral"}>{a.actor}</Pill>
                  </div>
                  {a.detail && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{a.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
