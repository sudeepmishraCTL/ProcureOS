import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "primary";
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-positive-foreground",
    warning: "text-warning-foreground",
    primary: "text-primary",
  }[tone];
  return (
    <div className="panel px-4 py-3">
      <div className="label-xs">{label}</div>
      <div className={cn("num mt-1.5 text-xl font-semibold tracking-tight", toneClass)}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "primary";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-surface-muted text-muted-foreground",
    positive: "border-positive/25 bg-positive-soft text-positive-foreground",
    warning: "border-warning/30 bg-warning-soft text-warning-foreground",
    danger: "border-destructive/25 bg-danger-soft text-destructive",
    primary: "border-primary/20 bg-accent text-accent-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium leading-4",
        tones,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ConfidenceDot({ confidence }: { confidence: string }) {
  const map: Record<string, string> = {
    high: "bg-positive",
    medium: "bg-warning",
    low: "bg-destructive",
    none: "bg-border-strong",
  };
  return (
    <span
      title={`${confidence} confidence`}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", map[confidence] ?? "bg-border-strong")}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Small "?" helper. Shows what a term means and why it matters, in plain English.
 */
export function Help({ what, why, term }: { what: string; why?: string; term?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-border text-[9px] font-semibold text-muted-foreground">
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 hidden w-60 -translate-x-1/2 translate-y-1.5 rounded-md border border-border bg-surface p-2.5 text-left text-[11px] font-normal leading-relaxed text-muted-foreground shadow-drawer group-hover:block">
        {term && <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">{term}</span>}
        <span className="block text-foreground">{what}</span>
        {why && (
          <span className="mt-1.5 block">
            <span className="text-foreground/80">Why it matters: </span>
            {why}
          </span>
        )}
      </span>
    </span>
  );
}

/** Plain-English label with the industry term shown small underneath. */
export function TermLabel({ plain, term }: { plain: string; term: string }) {
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{plain}</span>
      <span className="text-[10px] font-normal text-muted-foreground">{term}</span>
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{children}</h2>
      {aside}
    </div>
  );
}
