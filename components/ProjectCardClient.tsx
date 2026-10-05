import Link from "next/link";
import { CalendarRange } from "lucide-react";
import type { Project } from "@/lib/types";
import { ProgressBar } from "./ProgressBar";
import { PROJECT_THEME, formatTimeframe } from "@/lib/projectTheme";
import { cn, formatMoney } from "@/lib/utils";

export interface ProjectPaymentSummary {
  currency: string;
  received: number;
  pending: number;
}

export function ProjectCardClient({
  project,
  progress,
  payments,
}: {
  project: Project;
  progress: { done: number; total: number; openCount: number };
  payments?: ProjectPaymentSummary[];
}) {
  const theme = PROJECT_THEME[project.type];
  const Icon = theme.icon;
  const clientName = project.clientDetails.name || project.clientDetails.company || project.client;

  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "block rounded-xl2 border p-4 shadow-card transition-colors",
        theme.cardBg,
        theme.cardBorder,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", theme.iconBg, theme.iconText)}>
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-neutral-100">{project.name}</h3>
          {clientName && <p className="truncate text-xs text-neutral-500">{clientName}</p>}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-400">
        <CalendarRange size={12} />
        {formatTimeframe(project.startDate, project.endDate)}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", theme.iconBg, theme.iconText)}>
          {theme.label}
        </span>
        <span className="text-[11px] text-neutral-500">{progress.openCount} open</span>
      </div>

      <ProgressBar done={progress.done} total={progress.total} color={theme.accent} className="mt-4" />

      {payments && payments.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-base-700/50 pt-3">
          {payments.map((payment) => (
            <div key={payment.currency} className="flex items-center justify-between gap-2 text-[11px]">
              <div>
                <p className="text-neutral-500">{payment.currency} Received</p>
                <p className="font-medium text-accent-300">{formatMoney(payment.received, payment.currency)}</p>
              </div>
              <div className="text-right">
                <p className="text-neutral-500">Pending</p>
                <p className={cn("font-medium", payment.pending > 0 ? "text-amber-400" : "text-accent-300")}>
                  {formatMoney(payment.pending, payment.currency)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
