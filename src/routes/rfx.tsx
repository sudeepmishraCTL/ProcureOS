import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Save, Send, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Help, Pill, SectionTitle } from "@/components/bits";
import { supabase } from "@/integrations/supabase/client";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { logEvent } from "@/lib/procure.functions";
import { COPILOT_ACTIONS, getFxRate, rfxCopilot, sendRfx, syncRfxStatus } from "@/lib/rfx.functions";
import { rfxProgress, statusTone } from "@/lib/lifecycle";
import { computeScenarios } from "@/lib/procure-math";
import { dateOf, inr, inrShort, qty } from "@/lib/format";

export const Route = createFileRoute("/rfx")({
  head: () => ({
    meta: [
      { title: "Your Request · ProcureOS" },
      {
        name: "description",
        content:
          "Set out what you want to buy, how much of it, when you need it, and what suppliers must be able to prove, then send it out.",
      },
      { property: "og:title", content: "Your Request · ProcureOS" },
      {
        property: "og:description",
        content: "What you are asking suppliers for, and where the request currently stands.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RfxPage,
});

const input =
  "w-full rounded border border-border bg-surface-muted px-2 py-1 text-[12.5px] text-foreground outline-none focus:border-primary/60";

const EVENT_TYPES = ["RFQ", "RFP", "RFI"];
const CATEGORIES = [
  "Packaging",
  "IT & Software",
  "Logistics",
  "MRO",
  "Professional Services",
  "Facilities",
  "Other",
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP"];
const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Advance", "Other"];
const TAX_OPTIONS = ["GST Extra", "GST Included", "Tax Exempt", "Other"];
const INCOTERMS = ["EXW", "FOB", "CIF", "DDP", "FCA", "Not Applicable"];
const UOMS = ["Piece", "Box", "Carton", "Bundle", "Kg", "Litre", "Set", "Other"];
const DELIVERY_OPTIONS = ["2 weeks", "3 weeks", "4 weeks", "5 weeks", "6 weeks"];

function withValue(options: string[], value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return options;
  const has = options.some((o) => o.toLowerCase() === v.toLowerCase());
  return has ? options : [v, ...options];
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RfxPage() {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [busy, setBusy] = useState(false);
  const [header, setHeader] = useState({
    code: "",
    name: "",
    event_type: "RFQ",
    category: "Packaging",
    currency: "INR",
    fx_rate: "83.10",
    description: "",
    due_date: "",
    payment_terms: "Net 30",
    quote_validity_days: "30",
    tax_treatment: "GST Extra",
    delivery_location: "Pune, Maharashtra",
    incoterms: "Not Applicable",
    lead_time: "4 weeks",
    quality_cert_required: true,
    questionnaire_required: true,
    docs_required: true,
    min_experience: "",
  });
  const [due, setDue] = useState("");
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: "", category: "Packaging", event_type: "RFQ" });
  const [newQuestion, setNewQuestion] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotBusy, setCopilotBusy] = useState<string | null>(null);
  const [copilotOut, setCopilotOut] = useState<{ title: string; text: string } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [fx, setFx] = useState<{ loading: boolean; asOf: string; source: string; error: string }>({
    loading: false,
    asOf: "",
    source: "",
    error: "",
  });
  const syncedRef = useRef<string>("");

  useEffect(() => {
    if (!data) return;
    const r = data.rfx;
    setHeader({
      code: r.code,
      name: r.name,
      event_type: r.event_type ?? "RFQ",
      category: r.category,
      currency: r.currency,
      fx_rate: String(r.fx_rate),
      description: r.description ?? "",
      due_date: r.due_date ?? "",
      payment_terms: r.payment_terms ?? "Net 30",
      quote_validity_days: String(r.quote_validity_days ?? 30),
      tax_treatment: r.tax_treatment ?? "GST Extra",
      delivery_location: r.delivery_location ?? "Pune, Maharashtra",
      incoterms: r.incoterms ?? "Not Applicable",
      lead_time: r.lead_time ?? "4 weeks",
      quality_cert_required: r.quality_cert_required ?? true,
      questionnaire_required: r.questionnaire_required ?? true,
      docs_required: r.docs_required ?? true,
      min_experience: r.min_experience ?? "",
    });
    setDue(toLocalInput(r.due_date));
    setDirty(false);
  }, [data?.rfx.id]);

  const progress = useMemo(() => (data ? rfxProgress(data) : null), [data]);
  const totalUnits = useMemo(() => data?.lineItems.reduce((s, l) => s + l.quantity, 0) ?? 0, [data]);
  const eventValue = useMemo(() => (data ? computeScenarios(data).splitTotal : 0), [data]);

  // The conversion base follows the event currency. An INR event still needs a
  // USD reference rate, because vendors quote in dollars.
  const fxBase = header.currency === "INR" ? "USD" : header.currency;

  // Live rate, refreshed whenever the buyer picks a different currency.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setFx((f) => ({ ...f, loading: true, error: "" }));
    getFxRate({ data: { base: fxBase, target: "INR" } })
      .then((res) => {
        if (cancelled) return;
        const rate = res.rate.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
        setFx({ loading: false, asOf: res.asOf, source: res.source, error: "" });
        setHeader((h) => (h.fx_rate === rate ? h : { ...h, fx_rate: rate }));
        setDirty((d) => d || String(data.rfx.fx_rate) !== rate);
      })
      .catch((e: Error) => {
        if (!cancelled) setFx({ loading: false, asOf: "", source: "", error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [fxBase, data?.rfx.id]);

  // The stored status column follows the derived lifecycle state, never a manual pick.
  useEffect(() => {
    if (!data || !progress) return;
    const key = `${data.rfx.id}:${progress.status}`;
    if (data.rfx.status === progress.status || syncedRef.current === key) return;
    syncedRef.current = key;
    syncRfxStatus({ data: { rfxId: data.rfx.id, status: progress.status } }).then(() => refresh());
  }, [data?.rfx.id, data?.rfx.status, progress?.status]);

  const set = (patch: Partial<typeof header>) => {
    setHeader((h) => ({ ...h, ...patch }));
    setDirty(true);
  };

  const saveHeader = async () => {
    if (!data) return;
    setBusy(true);
    const dueText = due ? fromLocalInput(due) : header.due_date;
    const { error } = await supabase
      .from("rfx")
      .update({
        name: header.name,
        event_type: header.event_type,
        category: header.category,
        currency: header.currency,
        fx_rate: Number(header.fx_rate) || 0,
        description: header.description || null,
        due_date: dueText || null,
        payment_terms: header.payment_terms,
        quote_validity_days: Number(header.quote_validity_days) || 30,
        tax_treatment: header.tax_treatment,
        delivery_location: header.delivery_location,
        incoterms: header.incoterms,
        lead_time: header.lead_time,
        quality_cert_required: header.quality_cert_required,
        questionnaire_required: header.questionnaire_required,
        docs_required: header.docs_required,
        min_experience: header.min_experience || null,
      })
      .eq("id", data.rfx.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logEvent({ data: { event: "RFx updated", detail: `${header.code}: ${header.name}` } });
    setDirty(false);
    refresh();
    toast.success("RFx saved");
  };

  const saveLine = async (
    id: string,
    patch: {
      description?: string;
      quantity?: number;
      unit?: string;
      delivery_requirement?: string;
      specifications?: string;
    },
  ) => {
    const { error } = await supabase.from("line_items").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const addLine = async () => {
    if (!data) return;
    const maxNum = data.lineItems.reduce((m, l) => {
      const n = Number(l.sku.replace(/\D/g, ""));
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    const sku = `SKU-${String(maxNum + 1).padStart(3, "0")}`;
    const { error } = await supabase.from("line_items").insert({
      rfx_id: data.rfx.id,
      sku,
      description: "New line item",
      quantity: 1000,
      unit: "piece",
      delivery_requirement: "",
      specifications: "",
      sort_order: data.lineItems.length + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await logEvent({ data: { event: "RFx line item added", detail: sku } });
    refresh();
    toast.success(`${sku} added`);
  };

  const deleteLine = async (id: string, sku: string) => {
    await supabase.from("quotes").delete().eq("line_item_id", id);
    const { error } = await supabase.from("line_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logEvent({ data: { event: "RFx line item removed", detail: sku } });
    refresh();
  };

  const addQuestion = async () => {
    if (!data || newQuestion.trim().length < 5) return;
    const { error } = await supabase.from("questionnaire_questions").insert({
      rfx_id: data.rfx.id,
      question: newQuestion.trim(),
      mandatory: true,
      sort_order: data.questions.length + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await logEvent({ data: { event: "Qualification criterion added", detail: newQuestion.trim() } });
    setNewQuestion("");
    refresh();
  };

  const deleteQuestion = async (id: string, question: string) => {
    if (!data) return;
    await supabase.from("questionnaire_responses").delete().eq("rfx_id", data.rfx.id).eq("question", question);
    const { error } = await supabase.from("questionnaire_questions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logEvent({ data: { event: "Qualification criterion removed", detail: question } });
    refresh();
  };

  const createEvent = async () => {
    if (!data || newEvent.name.trim().length < 3) {
      toast.error("Give the event a name");
      return;
    }
    setBusy(true);
    const year = new Date().getFullYear();
    const used = data.allRfx
      .map((r) => Number(r.code.match(/(\d+)\s*$/)?.[1] ?? 0))
      .filter((n) => Number.isFinite(n));
    const code = `${newEvent.event_type}-${year}-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
    await supabase.from("rfx").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { data: created, error } = await supabase
      .from("rfx")
      .insert({
        code,
        name: newEvent.name.trim(),
        event_type: newEvent.event_type,
        category: newEvent.category,
        currency: "INR",
        fx_rate: 83.1,
        status: "Draft",
        is_active: true,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logEvent({ data: { event: "RFx created", detail: `${created.code}: ${created.name}` } });
    setCreating(false);
    setNewEvent({ name: "", category: "Packaging", event_type: "RFQ" });
    refresh();
    toast.success(`${code} created`, { description: "Add the items you need and your supplier questions below" });
  };

  const runCopilot = async (id: string, label: string) => {
    setCopilotBusy(id);
    setCopilotOut(null);
    try {
      const res = await rfxCopilot({ data: { action: id as never } });
      setCopilotOut({ title: label, text: res.answer });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copilot failed");
    } finally {
      setCopilotBusy(null);
    }
  };

  const doSend = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await sendRfx({ data: { rfxId: data.rfx.id } });
      syncedRef.current = "";
      setConfirmSend(false);
      refresh();
      toast.success("RFx released to invited vendors", { description: "Status moved to Awaiting Responses" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const openSend = () => {
    if (!progress) return;
    if (progress.missingFields.length) {
      toast.error("RFx is not complete", { description: progress.missingFields.join(", ") });
      return;
    }
    setConfirmSend(true);
  };

  const globalLead = header.lead_time.trim();

  return (
    <>
      <PageHeader
        title="Your Request"
        description="Everything you are asking suppliers for. This page is the single source of truth."
        actions={
          <>
            {progress && (
              <Pill tone={statusTone(progress.status)} className="uppercase tracking-wide">
                {progress.status}
              </Pill>
            )}
            <button
              onClick={() => setCopilotOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-foreground hover:bg-secondary"
            >
              <Sparkles className="size-3.5" /> AI Copilot
            </button>
            <button
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
            >
              <Plus className="size-3.5" /> New request
            </button>
            <button
              onClick={openSend}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
            >
              <Send className="size-3.5" /> Send to suppliers
            </button>
            <button
              onClick={saveHeader}
              disabled={!dirty || busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
            </button>
          </>
        }
      />

      <main className="flex-1 space-y-6 px-6 py-5">
        {creating && (
          <section className="panel space-y-3 p-4">
            <SectionTitle>Start a new request</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="label-xs">Kind of request</span>
                <select
                  className={`${input} mt-1`}
                  value={newEvent.event_type}
                  onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label-xs">Name this request</span>
                <input
                  className={`${input} mt-1`}
                  placeholder="Stretch Film FY27"
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="label-xs">Category</span>
                <select
                  className={`${input} mt-1`}
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              We create the reference code for you, from the kind of request and this year.
            </p>
            <button
              onClick={createEvent}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
            >
              Create request
            </button>
          </section>
        )}

        {data && progress && (
          <>
            <section>
              <SectionTitle>Request details</SectionTitle>
              <div className="panel p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="label-xs">Reference code (set for you)</span>
                    <input className={`${input} num mt-1 opacity-70`} value={header.code} readOnly />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="label-xs">Request name</span>
                    <input className={`${input} mt-1`} value={header.name} onChange={(e) => set({ name: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label-xs">Kind of request</span>
                    <select
                      className={`${input} mt-1`}
                      value={header.event_type}
                      onChange={(e) => set({ event_type: e.target.value })}
                    >
                      {withValue(EVENT_TYPES, header.event_type).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-xs">Category</span>
                    <select
                      className={`${input} mt-1`}
                      value={header.category}
                      onChange={(e) => set({ category: e.target.value })}
                    >
                      {withValue(CATEGORIES, header.category).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-xs">Currency</span>
                    <select
                      className={`${input} mt-1`}
                      value={header.currency}
                      onChange={(e) => set({ currency: e.target.value })}
                    >
                      {withValue(CURRENCIES, header.currency).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-xs">
                      Exchange rate (1 {fxBase} in rupees){fx.loading ? " · getting today's rate" : ""}
                    </span>
                    <input
                      className={`${input} num mt-1`}
                      value={header.fx_rate}
                      onChange={(e) => set({ fx_rate: e.target.value })}
                    />
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {fx.error
                        ? "We could not reach today's rate, so we are using the one you saved."
                        : `1 ${fxBase} = ${inr(Number(header.fx_rate) || 0, 4)}${fx.asOf ? ` · today's rate, ${fx.asOf.slice(0, 10)}` : ""}`}
                    </span>
                  </label>
                  <label className="block">
                    <span className="label-xs">Supplier response deadline</span>
                    <input
                      type="datetime-local"
                      className={`${input} num mt-1`}
                      value={due}
                      onChange={(e) => {
                        setDue(e.target.value);
                        setDirty(true);
                      }}
                    />
                    {header.due_date && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">Current: {header.due_date}</span>
                    )}
                  </label>
                  <div className="block">
                    <span className="label-xs">Where this stands (updates itself)</span>
                    <div className="mt-1 flex h-[26px] items-center gap-2">
                      <Pill tone={statusTone(progress.status)} className="uppercase tracking-wide">
                        {progress.status}
                      </Pill>
                      <span className="text-[11px] text-muted-foreground">
                        {progress.missingFields.length
                          ? `${progress.missingFields.length} thing(s) still to fill in`
                          : "Changes as the work progresses"}
                      </span>
                    </div>
                  </div>
                  <label className="block lg:col-span-4">
                    <span className="label-xs">What you are buying, in your own words</span>
                    <textarea
                      rows={2}
                      className={`${input} mt-1`}
                      placeholder="e.g. FSC-certified board, 30-day payment terms, delivery to Pune and Chennai plants"
                      value={header.description}
                      onChange={(e) => set({ description: e.target.value })}
                    />
                  </label>
                </div>
                {progress.missingFields.length > 0 && (
                  <p className="mt-3 text-[11.5px] text-warning-foreground">
                    Fill these in before you send it out: {progress.missingFields.join(", ")}
                  </p>
                )}
              </div>
            </section>

            <section>
              <SectionTitle aside={<Pill tone="primary">Applies to everything</Pill>}>
                General buying requirements
              </SectionTitle>
              <div className="panel border-l-2 border-l-primary/50 p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block">
                    <span className="label-xs">
                      When you will pay{" "}
                      <Help
                        term="Payment terms"
                        what="How long after delivery you pay the supplier. Net 30 means within 30 days."
                        why="Longer terms keep cash in your business, but some suppliers charge more for them."
                      />
                    </span>
                    <select
                      className={`${input} mt-1`}
                      value={header.payment_terms}
                      onChange={(e) => set({ payment_terms: e.target.value })}
                    >
                      {withValue(PAYMENT_TERMS, header.payment_terms).map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-xs">
                      How long their price must hold (days){" "}
                      <Help
                        term="Quote validity"
                        what="The number of days a supplier's price stays fixed once they send it."
                        why="If it is too short, the price can change before you decide."
                      />
                    </span>
                    <input
                      type="number"
                      className={`${input} num mt-1`}
                      value={header.quote_validity_days}
                      onChange={(e) => set({ quote_validity_days: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="label-xs">How tax is handled</span>
                    <select
                      className={`${input} mt-1`}
                      value={header.tax_treatment}
                      onChange={(e) => set({ tax_treatment: e.target.value })}
                    >
                      {withValue(TAX_OPTIONS, header.tax_treatment).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-xs">Where it must be delivered</span>
                    <input
                      className={`${input} mt-1`}
                      value={header.delivery_location}
                      onChange={(e) => set({ delivery_location: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="label-xs">
                      Who pays for shipping{" "}
                      <Help
                        term="Incoterms"
                        what="A standard code saying who pays freight and insurance, and where responsibility passes to you."
                        why="Two prices are not comparable if one includes delivery to your door and the other does not."
                      />
                    </span>
                    <select
                      className={`${input} mt-1`}
                      value={header.incoterms}
                      onChange={(e) => set({ incoterms: e.target.value })}
                    >
                      {withValue(INCOTERMS, header.incoterms).map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label-xs">
                      When you need it{" "}
                      <Help
                        term="Lead time"
                        what="How long after the order the supplier must deliver."
                        why="A cheaper supplier is no help if they cannot deliver in time."
                      />
                    </span>
                    <select
                      className={`${input} mt-1`}
                      value={header.lead_time}
                      onChange={(e) => set({ lead_time: e.target.value })}
                    >
                      {withValue(DELIVERY_OPTIONS, header.lead_time).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-3 text-[11.5px] text-muted-foreground">
                  These apply to the whole request unless a supplier or a single item says something different.
                </p>
              </div>
            </section>

            <section>
              <SectionTitle aside={<Pill tone="primary">Applies to everything</Pill>}>
                What suppliers must prove
              </SectionTitle>
              <div className="panel border-l-2 border-l-primary/50 p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ["quality_cert_required", "Must hold a quality certificate"],
                      ["questionnaire_required", "Must answer your questions"],
                      ["docs_required", "Must attach proof documents"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded border border-border bg-surface-muted px-2.5 py-2 text-[12.5px] text-foreground">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--primary)]"
                        checked={header[key]}
                        onChange={(e) => set({ [key]: e.target.checked } as Partial<typeof header>)}
                      />
                      {label}
                    </label>
                  ))}
                  <label className="block">
                    <span className="label-xs">Least years in business you will accept</span>
                    <input
                      className={`${input} mt-1`}
                      placeholder="e.g. 3 years"
                      value={header.min_experience}
                      onChange={(e) => set({ min_experience: e.target.value })}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Pill>Questions suppliers must answer: {data.questions.length}</Pill>
                  <Pill>{data.questions.filter((q) => q.mandatory).length} must be answered to qualify</Pill>
                </div>
              </div>
            </section>

            <section>
              <SectionTitle
                aside={
                  <button
                    onClick={addLine}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-secondary"
                  >
                    <Plus className="size-3.5" /> Add an item
                  </button>
                }
              >
                What you are buying ({data.lineItems.length} items)
              </SectionTitle>
              <div className="panel overflow-hidden">
                <div className="max-h-[520px] overflow-auto">
                  <table className="data-grid">
                    <thead className="sticky top-0 z-10 bg-surface-muted">
                      <tr className="text-left">
                        {["Item code", "What it is", "How many", "Unit", "When you need it", "Details suppliers must match", ""].map((h) => (
                          <th key={h} className="label-xs border-b border-border px-2 py-2 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((l) => {
                        const override =
                          (l.delivery_requirement ?? "").trim() !== "" &&
                          (l.delivery_requirement ?? "").trim().toLowerCase() !== globalLead.toLowerCase();
                        return (
                          <tr key={l.id} className="border-b border-border last:border-0 align-top">
                            <td className="px-2 py-1.5">
                              <span className="num text-[12.5px] text-muted-foreground">{l.sku}</span>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                className={`${input} min-w-[220px]`}
                                defaultValue={l.description}
                                onBlur={(e) => e.target.value !== l.description && saveLine(l.id, { description: e.target.value })}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                className={`${input} num w-24`}
                                defaultValue={l.quantity}
                                onBlur={(e) => Number(e.target.value) !== l.quantity && saveLine(l.id, { quantity: Number(e.target.value) })}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <select
                                className={`${input} w-24`}
                                value={l.unit}
                                onChange={(e) => saveLine(l.id, { unit: e.target.value })}
                              >
                                {withValue(UOMS, l.unit).map((u) => (
                                  <option key={u}>{u}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1.5">
                                <select
                                  className={`${input} w-[130px]`}
                                  value={(l.delivery_requirement ?? "").trim() === "" ? "__global" : l.delivery_requirement!}
                                  onChange={(e) =>
                                    saveLine(l.id, {
                                      delivery_requirement: e.target.value === "__global" ? "" : e.target.value,
                                    })
                                  }
                                >
                                  <option value="__global">Same as the rest: {globalLead || "not set"}</option>
                                  {withValue(DELIVERY_OPTIONS, l.delivery_requirement).map((d) => (
                                    <option key={d} value={d}>
                                      {d}
                                    </option>
                                  ))}
                                  <option value="Custom">Custom</option>
                                </select>
                                {override && <Pill tone="warning">Different for this item</Pill>}
                              </div>
                              {l.delivery_requirement === "Custom" && (
                                <input
                                  className={`${input} mt-1 w-[130px]`}
                                  placeholder="e.g. 10 days"
                                  onBlur={(e) => e.target.value && saveLine(l.id, { delivery_requirement: e.target.value })}
                                />
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <textarea
                                rows={2}
                                className={`${input} min-w-[220px]`}
                                defaultValue={l.specifications ?? ""}
                                onBlur={(e) =>
                                  e.target.value !== (l.specifications ?? "") && saveLine(l.id, { specifications: e.target.value })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <button
                                onClick={() => deleteLine(l.id, l.sku)}
                                title="Remove line"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Item codes are created for you and cannot be changed. Anything you set on a row applies only to that item. Rows
                left on the shared setting follow the delivery time in the general buying requirements above.
              </p>
            </section>

            <section>
              <SectionTitle>Questions every supplier must answer</SectionTitle>
              <div className="panel divide-y divide-border">
                {data.questions.map((q) => (
                  <div key={q.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <input
                      className={`${input} min-w-[280px] flex-1`}
                      defaultValue={q.question}
                      onBlur={async (e) => {
                        if (e.target.value === q.question) return;
                        await supabase.from("questionnaire_questions").update({ question: e.target.value }).eq("id", q.id);
                        refresh();
                      }}
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--primary)]"
                        defaultChecked={q.mandatory}
                        onChange={async (e) => {
                          await supabase.from("questionnaire_questions").update({ mandatory: e.target.checked }).eq("id", q.id);
                          refresh();
                        }}
                      />
                      Must answer to qualify
                    </label>
                    <button onClick={() => deleteQuestion(q.id, q.question)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 px-3 py-2">
                  <input
                    className={`${input} flex-1`}
                    placeholder="Add a question, for example: Do you hold a valid ISO 9001 certificate?"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                  />
                  <button
                    onClick={addQuestion}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-secondary"
                  >
                    <Plus className="size-3.5" /> Add
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                A supplier who fails one of these, or leaves it blank, is left out of any purchase plan that has to meet your
                requirements. Their answers are read from the files they send and shown under Supplier Requirements.
              </p>
            </section>

            <section>
              <SectionTitle aside={<Pill tone="neutral">Updates on its own</Pill>}>Where this request stands</SectionTitle>
              <div className="panel space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <Pill tone="primary">{data.lineItems.length} items</Pill>
                  <Pill>{qty(totalUnits)} units to buy</Pill>
                  <Pill>{data.questions.length} questions for suppliers</Pill>
                  <Pill>{progress.invited} suppliers invited</Pill>
                  <Pill tone={progress.responded === progress.invited && progress.invited > 0 ? "positive" : "neutral"}>
                    {progress.responded} of {progress.invited} suppliers replied
                  </Pill>
                  <Pill>
                    {progress.extracted} of {progress.expectedLines} prices found in their files
                  </Pill>
                  {progress.needsReview > 0 && <Pill tone="warning">{progress.needsReview} need your review</Pill>}
                  {eventValue > 0 && (
                    <Pill tone="primary">
                      Worth about {inrShort(eventValue)} INR at 1 {fxBase} = {inr(Number(header.fx_rate) || 0, 2)}
                    </Pill>
                  )}
                  <Pill>Created {dateOf(data.rfx.created_at)}</Pill>
                  {data.rfx.sent_at && <Pill>Sent {dateOf(data.rfx.sent_at)}</Pill>}
                  {dirty && <Pill tone="warning">Unsaved changes</Pill>}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-surface-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${progress.expectedLines ? Math.min(100, Math.round((progress.extracted / progress.expectedLines) * 100)) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-[11.5px] text-muted-foreground">
                  Every number here comes from the supplier files you have uploaded. Nothing on this page is filled in ahead of
                  time.
                </p>
              </div>
            </section>
          </>
        )}
      </main>

      {confirmSend && data && progress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="panel w-full max-w-lg space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Send {data.rfx.code} to your suppliers</h2>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  This marks the request as sent and starts waiting for replies. No email leaves this demo.
                </p>
              </div>
              <button onClick={() => setConfirmSend(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <dl className="space-y-1.5 text-[12.5px]">
              {[
                ["Items", `${data.lineItems.length}`],
                ["Suppliers invited", `${progress.invited}: ${data.vendors.map((v) => v.short_name).join(", ")}`],
                ["They must reply by", header.due_date || (due ? fromLocalInput(due) : "Not set")],
                [
                  "Buying requirements",
                  `${header.payment_terms}, price holds ${header.quote_validity_days} days, ${header.tax_treatment}, ${header.incoterms}, delivery in ${header.lead_time}, deliver to ${header.delivery_location}`,
                ],
                [
                  "Suppliers must prove",
                  `${data.questions.length} questions${header.quality_cert_required ? ", quality certificate" : ""}${
                    header.docs_required ? ", proof documents" : ""
                  }`,
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-44 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmSend(false)}
                className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={doSend}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Confirm and send
              </button>
            </div>
          </div>
        </div>
      )}

      {copilotOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setCopilotOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">AI Copilot</span>
              </div>
              <button onClick={() => setCopilotOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-1.5 border-b border-border p-3">
              {COPILOT_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => runCopilot(a.id, a.label)}
                  disabled={copilotBusy !== null}
                  className="flex w-full items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-left text-[12.5px] font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {a.label}
                  {copilotBusy === a.id && <Loader2 className="size-3.5 animate-spin" />}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-4 text-[12.5px] leading-relaxed text-foreground">
              {copilotOut ? (
                <>
                  <div className="label-xs mb-2">{copilotOut.title}</div>
                  <pre className="whitespace-pre-wrap font-sans">{copilotOut.text}</pre>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Pick something above. The assistant only reads this request: its details, your buying requirements, your
                  supplier questions and the {data?.lineItems.length ?? 0} items. It never makes up supplier replies.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
