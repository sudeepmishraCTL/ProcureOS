import { useState } from "react";
import { FileText, Flag, X } from "lucide-react";
import { Pill } from "./bits";
import { inr } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useRefreshProcurement, type FullData } from "@/lib/data";
import { logEvent } from "@/lib/procure.functions";
import { toast } from "sonner";
import type { LineItem, Quote, Vendor } from "@/lib/procure-math";

export type EvidenceTarget = { quote: Quote | null; vendor: Vendor; lineItem: LineItem };

export function EvidenceDrawer({
  target,
  data,
  onClose,
}: {
  target: EvidenceTarget | null;
  data: FullData;
  onClose: () => void;
}) {
  const refresh = useRefreshProcurement();
  const [showSource, setShowSource] = useState(false);
  if (!target) return null;

  const { quote, vendor, lineItem } = target;
  const response = data.responses.find((r) => r.vendor_id === vendor.id);
  const history = data.supersededQuotes
    .filter((q) => q.vendor_id === vendor.id && q.line_item_id === lineItem.id)
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1));

  const flag = async () => {
    if (!quote) return;
    await supabase.from("quotes").update({ requires_review: true }).eq("id", quote.id);
    await logEvent({
      data: {
        actor: "Sudeep Mishra",
        event: "Quote flagged for review",
        detail: `${vendor.short_name} · ${lineItem.sku} flagged manually`,
      },
    });
    toast.success(`${lineItem.sku} flagged for review`);
    refresh();
    onClose();
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-border py-2 last:border-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[13px] text-foreground">{value}</div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/10" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-border bg-surface shadow-drawer">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Where this came from</div>
            <div className="text-[11px] text-muted-foreground">
              Traced back to the file {vendor.name} sent
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {row("Supplier", vendor.name)}
          {row("Item", `${lineItem.sku}: ${lineItem.description}`)}
          {row("You need", `${lineItem.quantity.toLocaleString("en-IN")} ${lineItem.unit}s`)}

          {!quote ? (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning-foreground">
              <div className="font-medium">No price for this item</div>
              <p className="mt-1 text-[12px]">
                {vendor.name} did not give a price for this item. We leave it blank rather than guessing what they
                might have charged.
              </p>
            </div>
          ) : (
            <>
              {row(
                "What the supplier wrote",
                <span className="italic text-muted-foreground">
                  &ldquo;{quote.original_text ?? "-"}&rdquo;
                </span>,
              )}
              {row(
                "The price they gave",
                <span className="num">
                  {quote.original_currency === "UNKNOWN"
                    ? `${quote.original_value?.toLocaleString("en-IN") ?? "-"} (they did not say which currency)`
                    : `${quote.original_currency === "USD" ? "$" : "₹"}${quote.original_value?.toLocaleString("en-IN") ?? "-"}`}
                </span>,
              )}
              {row("Priced by the", quote.original_unit ?? "-")}
              {row(
                "Comparable price",
                <span className="num font-semibold">
                  {quote.normalized_value == null ? "Not clear yet" : `${inr(quote.normalized_value)} per piece`}
                </span>,
              )}
              {row(
                "How we got there",
                <span className="num text-[12px]">
                  {quote.normalization_note ?? "Used as written, nothing converted"}
                </span>,
              )}
              {row(
                "How sure we are",
                <Pill
                  tone={
                    quote.confidence === "high" ? "positive" : quote.confidence === "medium" ? "warning" : "danger"
                  }
                >
                  {quote.confidence === "high"
                    ? "Clear"
                    : quote.confidence === "medium"
                      ? "Mostly clear"
                      : "Not fully certain"}
                </Pill>,
              )}
              {quote.issue_note &&
                row(
                  "What to check",
                  <span className="text-warning-foreground">
                    {quote.issue_type ? `${quote.issue_type.replace(/_/g, " ")}: ` : ""}
                    {quote.issue_note}
                  </span>,
                )}
              {quote.conflict_note &&
                row(
                  "They changed this price",
                  <span className="text-warning-foreground">{quote.conflict_note}</span>,
                )}
              {(history.length > 0 || (quote.version ?? 1) > 1) &&
                row(
                  "Earlier prices",
                  <div className="space-y-1">
                    <div className="num text-[12px]">
                      Latest, in use:{" "}
                      {quote.normalized_value == null ? "Not clear" : inr(quote.normalized_value)} ·{" "}
                      {quote.source_ref ?? ""}
                    </div>
                    {history.map((h) => (
                      <div key={h.id} className="num text-[12px] text-muted-foreground line-through">
                        Earlier: {h.normalized_value == null ? "Not clear" : inr(h.normalized_value)} ·{" "}
                        {h.source_ref ?? ""}
                      </div>
                    ))}
                  </div>,
                )}
              {row(
                "Found in",
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  {quote.source_ref ?? response?.source_file}
                </span>,
              )}
              {row(
                "Total for this item",
                <span className="num">
                  {quote.normalized_value == null
                    ? "-"
                    : inr(quote.normalized_value * lineItem.quantity, 0)}
                </span>,
              )}
            </>
          )}

          {response?.image_data && (
            <div className="mt-4">
              <div className="label-xs mb-1.5">
                The photo they sent, so you can check our reading against it
              </div>
              <img
                src={response.image_data}
                alt={response.source_file}
                className="max-h-64 w-full rounded-md border border-border object-contain"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                This price was read from a photographed document. Compare what the supplier wrote above with the
                image before relying on it.
              </p>
            </div>
          )}

          {showSource && response && (
            <div className="mt-4">
              <div className="label-xs mb-1.5">The supplier's own file · {response.source_file}</div>
              <pre className="num max-h-72 overflow-auto rounded-md border border-border bg-surface-muted p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {response.raw_content}
              </pre>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-3">
          <button
            onClick={() => setShowSource((s) => !s)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {showSource ? "Hide the supplier's file" : "See the supplier's file"}
          </button>
          <button
            onClick={flag}
            disabled={!quote}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-warning-foreground transition-colors hover:bg-warning-soft disabled:opacity-40"
          >
            <Flag className="size-3.5" /> Mark for my review
          </button>
        </div>
      </aside>
    </>
  );
}
