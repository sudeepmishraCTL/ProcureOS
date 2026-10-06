import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useProcurement, useRefreshProcurement } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Switch the active sourcing event from anywhere in the app.
 * Rendered both in the sidebar card and in the page header pill.
 */
export function EventSwitcher({ variant = "card" }: { variant?: "card" | "pill" }) {
  const { data } = useProcurement();
  const refresh = useRefreshProcurement();
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const events = data.allRfx;

  const switchTo = async (id: string) => {
    if (id === data.rfx.id) return;
    setBusy(true);
    await supabase.from("rfx").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("rfx").update({ is_active: true }).eq("id", id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
    const picked = events.find((e) => e.id === id);
    toast.success("Switched event", { description: `${picked?.code}: ${picked?.name}` });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "pill" ? (
          <button
            className="num inline-flex items-center gap-1 rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            title="Switch sourcing event"
          >
            {data.rfx.code}
            {busy ? <Loader2 className="size-3 animate-spin" /> : <ChevronsUpDown className="size-3" />}
          </button>
        ) : (
          <button className="w-full rounded-md border border-sidebar-border bg-surface p-3 text-left transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between">
              <span className="label-xs">Active event</span>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : (
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="num mt-1 text-xs font-semibold text-foreground">{data.rfx.code}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{data.rfx.name}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-positive" />
              {data.rfx.status}
            </div>
            <div className="mt-2 text-[10.5px] text-muted-foreground">
              {events.length > 1 ? `Click to switch between ${events.length} events` : "Click to manage events"}
            </div>
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="label-xs">Sourcing events</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {events.map((e) => (
          <DropdownMenuItem key={e.id} onSelect={() => switchTo(e.id)} className="items-start gap-2">
            <Check className={cn("mt-0.5 size-3.5", e.id === data.rfx.id ? "text-primary" : "opacity-0")} />
            <span className="min-w-0">
              <span className="num block text-[12px] font-medium text-foreground">{e.code}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{e.name}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/rfx" className="flex items-center gap-2 text-[12px]">
            <Plus className="size-3.5" /> Create or edit an event
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
