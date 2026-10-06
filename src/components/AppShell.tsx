import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileStack,
  Inbox,
  Table2,
  Gavel,
  Building2,
  Settings,
  ScrollText,
  CircleUserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useProcurement } from "@/lib/data";
import { cn } from "@/lib/utils";
import { EventSwitcher } from "@/components/EventSwitcher";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rfx", label: "Your Request", icon: FileStack },
  { to: "/responses", label: "Supplier Replies", icon: Inbox },
  { to: "/intelligence", label: "Compare Supplier Prices", icon: Table2 },
  { to: "/award", label: "Purchase Recommendation", icon: Gavel },
  { to: "/vendors", label: "Suppliers", icon: Building2 },
  { to: "/audit", label: "Activity History", icon: ScrollText },
] as const;

const ANALYSIS_ROUTES = ["/intelligence", "/review", "/questionnaire", "/analyst", "/scenarios"];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useProcurement();

  const isActive = (to: string) =>
    to === "/intelligence" ? ANALYSIS_ROUTES.includes(path) : path === to;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex size-6 items-center justify-center rounded bg-primary text-[11px] font-bold text-primary-foreground">
            P
          </div>
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">ProcureOS</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                isActive(item.to)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          ))}
        </nav>

        {data && (
          <div className="mx-2 mb-2">
            <EventSwitcher />
          </div>
        )}

        <div className="border-t border-sidebar-border p-2">
          <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Settings className="size-4" strokeWidth={1.75} />
            Settings
          </button>
          <div className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2">
            <CircleUserRound className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">Sudeep Mishra</div>
              <div className="truncate text-[11px] text-muted-foreground">Category Lead, Packaging</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  tabs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  const { data } = useProcurement();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold text-foreground">{title}</h1>
            {data && <EventSwitcher variant="pill" />}
          </div>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {tabs}
    </header>
  );
}

export function SubTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/intelligence", label: "Compare Supplier Prices" },
    { to: "/review", label: "Needs Your Review" },
    { to: "/questionnaire", label: "Supplier Requirements" },
    { to: "/analyst", label: "Ask the AI Analyst" },
    { to: "/scenarios", label: "Compare Purchase Options" },
  ];
  return (
    <div className="flex gap-4 overflow-x-auto px-6">
      {tabs.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 py-2 text-[13px] font-medium transition-colors",
            path === t.to
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
