import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Paperclip, Plus, Upload, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/bits";
import { ingestFile, type IngestedFile } from "@/lib/file-extract";
import { evaluateQuestionnaire, ingestVendorResponse, processVendorResponse } from "@/lib/procure.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Vendor } from "@/lib/procure-math";

const STAGES = [
  "Reading files",
  "Registering submission",
  "Storing original files",
  "Extracting line items",
  "Normalizing units & currency",
  "Validating against RFx",
  "Reading questionnaire",
  "Creating comparison data",
];

type FileState = "queued" | "running" | "done" | "failed";
type FileStatus = { name: string; kind?: string; state: FileState; step: string; note?: string };


const RESPONSE_TYPES = [
  "Quote / RFQ Response",
  "Questionnaire",
  "Supporting Document",
  "Other",
];

type Result = { file: string; vendor: string; extracted: number; review: number; confidence: number };

export function UploadResponseDialog({
  vendors,
  onClose,
  onIngested,
}: {
  vendors: Vendor[];
  onClose: () => void;
  onIngested: () => void;
}) {
  const [vendorId, setVendorId] = useState<string>(vendors[0]?.id ?? "__new");
  const [newVendorName, setNewVendorName] = useState("");
  const [responseType, setResponseType] = useState(RESPONSE_TYPES[0]!);
  const [files, setFiles] = useState<File[]>([]);
  const [emailText, setEmailText] = useState("");
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [stage, setStage] = useState(-1);
  const [readNotes, setReadNotes] = useState<IngestedFile[]>([]);
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isNew = vendorId === "__new";
  const canRun = (files.length > 0 || emailText.trim().length > 20) && (!isNew || newVendorName.trim().length > 1);

  const upd = (name: string, patch: Partial<FileStatus>) =>
    setStatuses((list) => list.map((f) => (f.name === name ? { ...f, ...patch } : f)));

  const run = async () => {
    setPhase("running");
    setError(null);
    const emailName = "Pasted email response.txt";
    const queue: string[] = [...files.map((f) => f.name), ...(emailText.trim().length > 0 ? [emailName] : [])];
    setStatuses(queue.map((name) => ({ name, state: "queued" as FileState, step: "Waiting" })));
    let current = queue[0] ?? "";
    try {
      setStage(0);
      const ingested: IngestedFile[] = [];
      for (const f of files) {
        current = f.name;
        upd(f.name, { state: "running", step: "Reading file" });
        const parsed = await ingestFile(f);
        ingested.push(parsed);
        upd(f.name, { state: "running", step: "Read", kind: parsed.kind, note: parsed.note });
      }
      if (emailText.trim().length > 0) {
        ingested.push({ name: emailName, kind: "EMAIL", text: emailText, note: "Pasted email body" });
        upd(emailName, { state: "running", step: "Read", kind: "EMAIL", note: "Pasted email body" });
      }
      setReadNotes(ingested);

      setStage(1);
      for (const n of queue) upd(n, { step: "Registering submission" });
      const { responses, vendorName } = await ingestVendorResponse({
        data: {
          ...(isNew ? { newVendorName: newVendorName.trim() } : { vendorId }),
          responseType,
          files: ingested.map((f) => ({
            name: f.name,
            kind: f.kind,
            text: f.text,
            ...(f.imageDataUrl ? { imageDataUrl: f.imageDataUrl } : {}),
          })),
        },
      });

      // Keep the buyer's original document, not just the text we read out of it.
      setStage(2);
      for (const r of responses) {
        const original = files.find((f) => f.name === r.source_file);
        if (!original) {
          upd(r.source_file, { step: "Stored" });
          continue;
        }
        current = r.source_file;
        upd(r.source_file, { step: "Storing original file" });
        const path = `${r.id}/${original.name}`;
        const { error: upErr } = await supabase.storage
          .from("vendor-files")
          .upload(path, original, { upsert: true, contentType: original.type || "application/octet-stream" });
        if (!upErr) {
          await supabase
            .from("vendor_responses")
            .update({ file_path: path, file_mime: original.type || null })
            .eq("id", r.id);
        }
        upd(r.source_file, { step: upErr ? "Stored text only" : "Stored" });
      }

      const out: Result[] = [];
      for (let i = 0; i < responses.length; i++) {
        const r = responses[i]!;
        current = r.source_file;
        setStage(3);
        upd(r.source_file, { state: "running", step: "Extracting line items" });
        const timers = [
          setTimeout(() => {
            setStage(4);
            upd(r.source_file, { step: "Normalizing units & currency" });
          }, 1500),
          setTimeout(() => {
            setStage(5);
            upd(r.source_file, { step: "Validating against RFx" });
          }, 3000),
        ];
        const res = await processVendorResponse({ data: { responseId: r.id } });
        timers.forEach(clearTimeout);
        upd(r.source_file, { state: "done", step: `${res.extracted} lines extracted` });
        out.push({ ...res, file: r.source_file, vendor: res.vendor || vendorName });
        setResults([...out]);
      }

      // Read the qualification criteria out of the same documents.
      setStage(6);
      const vId = responses[0]?.vendor_id;
      try {
        await evaluateQuestionnaire({ data: vId ? { vendorId: vId } : {} });
      } catch {
        /* qualification stays as-is if the criteria cannot be evaluated */
      }

      setStage(STAGES.length);
      setStatuses((list) => list.map((f) => (f.state === "failed" ? f : { ...f, state: "done" as FileState })));
      setResults(out);
      setPhase("done");
      onIngested();
      toast.success(`${vendorName}: ${out.reduce((a, b) => a + b.extracted, 0)} line values extracted`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not process this response";
      upd(current, { state: "failed", step: `Failed: ${msg}` });
      setError(`${current ? `${current}: ` : ""}${msg}`);
      setPhase("form");
      onIngested();
    }
  };


  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20" onClick={phase === "running" ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-4 sm:p-8">
        <div className="panel w-full max-w-[640px] bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Add vendor response</div>
              <div className="text-[11px] text-muted-foreground">
                Files are read in the browser, then extracted and normalized by the same pipeline as the demo data
              </div>
            </div>
            <button onClick={onClose} disabled={phase === "running"} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
              <X className="size-4" />
            </button>
          </div>

          {phase !== "done" && (
            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label-xs">Vendor</span>
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-foreground"
                  >
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                    <option value="__new">+ Create new vendor…</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label-xs">Response type</span>
                  <select
                    value={responseType}
                    onChange={(e) => setResponseType(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-foreground"
                  >
                    {RESPONSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isNew && (
                <label className="block">
                  <span className="label-xs">New vendor name</span>
                  <input
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder="e.g. Shakti Packaging Pvt Ltd"
                    className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-foreground"
                  />
                </label>
              )}

              <div>
                <span className="label-xs">Files</span>
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)]);
                  }}
                  className="mt-1 cursor-pointer rounded-md border border-dashed border-border bg-surface-muted px-4 py-5 text-center transition-colors hover:border-primary/40"
                >
                  <Upload className="mx-auto size-4 text-muted-foreground" />
                  <div className="mt-1.5 text-[12.5px] text-foreground">Drop files or click to browse</div>
                  <div className="text-[11px] text-muted-foreground">
                    Excel (.xlsx/.xls), CSV, PDF, Word (.docx), images (.png/.jpg), multiple files per vendor
                  </div>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.png,.jpg,.jpeg,.txt,.eml"
                  className="hidden"
                  onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
                />
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[12px]">
                        <Paperclip className="size-3.5 text-muted-foreground" />
                        <span className="num min-w-0 flex-1 truncate text-foreground">{f.name}</span>
                        <span className="num text-[11px] text-muted-foreground">{Math.round(f.size / 1024)} KB</span>
                        <button
                          onClick={() => setFiles((list) => list.filter((_, k) => k !== i))}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="block">
                <span className="label-xs">Or paste an email response</span>
                <textarea
                  value={emailText}
                  onChange={(e) => setEmailText(e.target.value)}
                  rows={4}
                  placeholder={"Hi Sudeep, for the 5-ply medium carton we can do ₹48 each, small is ₹39. Rest same as last year. Freight extra."}
                  className="num mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] leading-relaxed text-foreground"
                />
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {phase !== "form" && (
            <div className="space-y-3 border-t border-border px-5 py-4">
              <div className="label-xs">
                {phase === "done" ? "Vendor response processed" : "Processing vendor response"}
              </div>

              <ol className="grid gap-1.5 sm:grid-cols-2">
                {STAGES.map((s, i) => {
                  const state = i < stage ? "done" : i === stage ? "active" : "pending";
                  return (
                    <li
                      key={s}
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
                      {s}
                    </li>
                  );
                })}
              </ol>

              {statuses.length > 0 && (
                <div className="divide-y divide-border rounded-md border border-border">
                  {statuses.map((f) => {
                    const note = readNotes.find((n) => n.name === f.name);
                    return (
                      <div key={f.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
                        {f.state === "done" ? (
                          <CheckCircle2 className="size-3.5 text-positive" />
                        ) : f.state === "failed" ? (
                          <AlertTriangle className="size-3.5 text-warning-foreground" />
                        ) : f.state === "running" ? (
                          <Loader2 className="size-3.5 animate-spin text-primary" />
                        ) : (
                          <span className="num w-3.5 text-center text-[10px] text-muted-foreground">·</span>
                        )}
                        {f.kind && <Pill>{f.kind}</Pill>}
                        <span className="num min-w-0 flex-1 truncate text-foreground">{f.name}</span>
                        <span
                          className={
                            f.state === "failed"
                              ? "text-warning-foreground"
                              : f.state === "done"
                                ? "text-positive-foreground"
                                : "text-muted-foreground"
                          }
                        >
                          {f.step}
                        </span>
                        {note && note.text.length > 0 && (
                          <span className="num text-[11px] text-muted-foreground">
                            {note.text.length.toLocaleString()} chars read
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}



              {results.length > 0 && (
                <div className="divide-y divide-border rounded-md border border-border">
                  {results.map((r) => (
                    <div key={r.file} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]">
                      <span className="num truncate text-foreground">{r.file}</span>
                      <span className="text-muted-foreground">
                        {r.extracted} lines extracted · {r.review} need review · {r.confidence}% confidence
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              onClick={onClose}
              disabled={phase === "running"}
              className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary disabled:opacity-40"
            >
              {phase === "done" ? "Close" : "Cancel"}
            </button>
            {phase !== "done" && (
              <button
                onClick={run}
                disabled={!canRun || phase === "running"}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {phase === "running" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                {phase === "running" ? "Processing…" : "Upload & extract"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
