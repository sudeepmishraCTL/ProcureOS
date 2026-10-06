import { supabase } from "@/integrations/supabase/client";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Mail,
  Play,
  Plus,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Eye,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Metric, Pill, SectionTitle } from "@/components/bits";
import { UploadResponseDialog } from "@/components/UploadResponseDialog";
import { useProcurement, useRefreshProcurement, type VendorResponse } from "@/lib/data";
import { coverageStats } from "@/lib/procure-math";
import { deleteVendorResponse, processVendorResponse, resetDemoData } from "@/lib/procure.functions";

export const Route = createFileRoute("/responses")({
  head: () => ({
    meta: [
      { title: "Supplier Replies · ProcureOS" },
      {
        name: "description",
        content:
          "See what each supplier sent you, in whatever format they used, and let the system read their prices out of it.",
      },
      { property: "og:title", content: "Supplier Replies · ProcureOS" },
      {
        property: "og:description",
        content: "Upload what suppliers sent you and let the system read the prices out of it.",
      },
    ],
  }),
  component: Responses,
});

const PIPELINE = [
  "Opening the files",
  "Finding the items they priced",
  "Picking out the prices",
  "Converting currencies into rupees",
  "Converting boxes and bundles into pieces",
  "Matching their wording to your item list",
  "Checking their answers to your requirements",
  "Looking for anything odd",
  "Deciding what needs your review",
];

const ICONS: Record<string, typeof FileText> = {
  XLSX: FileSpreadsheet,
  PDF: FileText,
  DOCX: FileText,
  IMAGE: ImageIcon,
  EMAIL: Mail,
};

function Responses() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [preview, setPreview] = useState<VendorResponse | null>(null);
  const [upload, setUpload] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState<VendorResponse | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(removing.id);
    const file = removing.source_file;
    setRemoving(null);
    try {
      const res = await deleteVendorResponse({ data: { responseId: removing.id } });
      refresh();
      toast.success(`${file} removed`, {
        description: `Everything read from ${res.vendor}'s file is gone. You can upload a new one now.`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that file");
    } finally {
      setRemoveBusy(null);
    }
  };


  const loadDemo = async () => {
    setResetting(true);
    try {
      await resetDemoData({ data: { clearExtractions: true } });
      refresh();
      toast.success("Example supplier responses loaded", {
        description: "Five sample files are ready. Choose Read supplier responses to pull the prices out of them.",
      });
    } catch (e) {
      toast.error("We could not load the example responses", { description: "Please try again in a moment." });
      console.error(e);
    } finally {
      setResetting(false);
    }
  };

  const cover = data ? coverageStats(data) : null;
  const processedCount = data?.responses.filter((r) => r.processed_at).length ?? 0;

  const run = async () => {
    if (!data) return;
    setRunning(true);
    setStep(0);
    const ticker = setInterval(() => setStep((s) => (s < PIPELINE.length - 2 ? s + 1 : s)), 1400);
    try {
      for (const r of data.responses) {
        const v = data.vendors.find((x) => x.id === r.vendor_id);
        setActiveVendor(v?.short_name ?? null);
        const res = await processVendorResponse({ data: { responseId: r.id } });
        toast.success(`${res.vendor}: prices found for ${res.extracted} items`, {
          description: res.review > 0 ? `${res.review} of them need your review` : "Nothing unclear",
        });
        refresh();
      }
      setStep(PIPELINE.length - 1);
      toast.success("All supplier files read");
    } catch (e) {
      toast.error("We could not finish reading the supplier files", {
        description: "Some prices may be missing. Try again, or open the file to check it yourself.",
      });
      console.error(e);
    } finally {
      clearInterval(ticker);
      setRunning(false);
      setActiveVendor(null);
      refresh();
    }
  };

  return (
    <>
      <PageHeader
        title="Supplier Replies"
        description={`${processedCount} of ${data?.responses.length ?? 0} supplier files read. Check anything the system could not understand.`}
        actions={
          <>
            <button
              onClick={loadDemo}
              disabled={resetting || running}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Load example responses
            </button>
            <button
              onClick={() => setUpload(true)}
              disabled={!data || running}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <Plus className="size-3.5" /> Add a supplier response
            </button>
            <button
              onClick={run}
              disabled={running || !data}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {running ? "Reading…" : processedCount > 0 ? "Read them again" : "Read supplier responses"}
            </button>
          </>
        }
      />

      {upload && data && (
        <UploadResponseDialog vendors={data.vendors} onClose={() => setUpload(false)} onIngested={refresh} />
      )}

      <main className="flex-1 space-y-6 px-6 py-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Suppliers who replied"
            value={`${new Set(data?.responses.map((r) => r.vendor_id)).size} of ${data?.vendors.length ?? 0}`}
            sub={`${data?.responses.length ?? 0} file(s) in total. A supplier can send more than one file, such as a price list and a filled questionnaire.`}
          />
          <Metric
            label="Prices you were expecting"
            value={cover?.expected ?? 0}
            sub={`${data?.lineItems.length ?? 0} items from ${data?.vendors.length ?? 0} suppliers`}
          />
          <Metric
            label="Prices read clearly"
            value={cover?.confident ?? 0}
            sub={`${cover?.review ?? 0} need your review`}
            tone="positive"
          />
          <Metric
            label="Items with no price"
            value={cover?.missing ?? 0}
            sub="The supplier did not quote these"
            tone={cover && cover.missing > 0 ? "warning" : "neutral"}
          />
        </section>

        {(running || step >= 0) && (
          <section className="panel p-5">
            <SectionTitle aside={activeVendor ? <Pill tone="primary">{activeVendor}</Pill> : undefined}>
              Reading the supplier files
            </SectionTitle>
            <ol className="grid gap-1.5 sm:grid-cols-3">
              {PIPELINE.map((label, i) => {
                const state = i < step ? "done" : i === step ? "active" : "pending";
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] ${
                      state === "done"
                        ? "border-positive/25 bg-positive-soft text-positive-foreground"
                        : state === "active"
                          ? "border-primary/30 bg-accent text-accent-foreground"
                          : "border-border bg-surface-muted text-muted-foreground"
                    }`}
                  >
                    {state === "done" ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : state === "active" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <span className="num w-3.5 text-center text-[10px]">{i + 1}</span>
                    )}
                    {label}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {data?.responses.map((r) => {
            const v = data.vendors.find((x) => x.id === r.vendor_id)!;
            const Icon = ICONS[r.source_type] ?? FileText;
            const vq = data.quotes.filter((q) => q.vendor_id === v.id);
            const review = vq.filter((q) => q.requires_review).length;
            return (
              <article key={r.id} className="panel flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-border bg-surface-muted">
                      <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">{v.name}</div>
                      <div className="num text-[11px] text-muted-foreground">{r.source_file}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.response_type ?? "Quote / RFQ Response"}
                        {r.is_demo === false ? " · uploaded" : ""}
                      </div>
                    </div>
                  </div>
                  <Pill>{r.source_type}</Pill>
                </div>

                <div className="mt-3 space-y-1.5 text-[12px]">
                  <div className="flex items-center gap-1.5 text-positive-foreground">
                    <CheckCircle2 className="size-3.5" /> Received
                  </div>
                  {r.processed_at ? (
                    <>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 className="size-3.5 text-positive" />
                        Prices found for {vq.length} of your {data.lineItems.length} items
                      </div>
                      {review > 0 && (
                        <div className="flex items-center gap-1.5 text-warning-foreground">
                          <AlertTriangle className="size-3.5" /> {review} price{review > 1 ? "s" : ""} need your review
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {(r.extraction_confidence ?? 0) >= 85
                          ? "This file was easy to read"
                          : (r.extraction_confidence ?? 0) >= 65
                            ? "This file was mostly clear"
                            : "This file was hard to read, worth a look"}
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">Not read yet</div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setPreview(r)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    <Eye className="size-3.5" /> See what they sent
                  </button>
                  <button
                    onClick={() => setRemoving(r)}
                    disabled={running || removeBusy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                  >
                    {removeBusy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Remove this file
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </main>

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="panel w-full max-w-md space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Remove this supplier file?</h2>
                <p className="num mt-0.5 text-[11px] text-muted-foreground">{removing.source_file}</p>
              </div>
              <button onClick={() => setRemoving(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              This deletes the file and everything read out of it: their prices, their answers to your questions and any
              lines that could not be matched. Other suppliers are not affected. You can upload a new file for this
              supplier straight after.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRemoving(null)}
                className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
              >
                Keep it
              </button>
              <button
                onClick={confirmRemove}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-[12.5px] font-medium text-destructive-foreground hover:opacity-90"
              >
                <Trash2 className="size-3.5" /> Remove and let me re-upload
              </button>
            </div>
          </div>
        </div>
      )}


      {preview && (
        <>
          <div className="fixed inset-0 z-40 bg-foreground/10" onClick={() => setPreview(null)} />
          <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[560px] flex-col border-l border-border bg-surface shadow-drawer">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <div className="text-[13px] font-semibold text-foreground">What the supplier sent</div>
                <div className="num text-[11px] text-muted-foreground">
                  {preview.source_file} · {preview.source_type}
                </div>
              </div>
              {preview.file_path && (
                <button
                  onClick={async () => {
                    const { data: signed } = await supabase.storage
                      .from("vendor-files")
                      .createSignedUrl(preview.file_path!, 600);
                    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
                  }}
                  className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground hover:bg-secondary"
                >
                  Open the original file
                </button>
              )}
            </div>
            {preview.image_data && (
              <img src={preview.image_data} alt={preview.source_file} className="max-h-72 w-full object-contain" />
            )}
            <pre className="num flex-1 overflow-auto whitespace-pre-wrap p-5 text-[11.5px] leading-relaxed text-muted-foreground">
              {preview.raw_content}
            </pre>
            <div className="border-t border-border px-5 py-3">
              <button
                onClick={() => setPreview(null)}
                className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
              >
                Close
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
