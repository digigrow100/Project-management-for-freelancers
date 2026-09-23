import { Users } from "lucide-react";
import type { TeamPerformance } from "@/lib/types";

export function TeamActivityPanel({ performance }: { performance: TeamPerformance[] }) {
  if (performance.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-base-700 p-6 text-center text-sm text-neutral-500">
        No completed work from the team yet this week.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {performance.map((member) => (
        <div key={member.memberId} className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
              <Users size={15} />
            </span>
            <p className="text-sm font-semibold text-neutral-100">{member.memberName}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-base-900/60 p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Today</p>
              <p className="mt-0.5 text-lg font-semibold text-accent-300">{member.completedToday}</p>
              <p className="text-[11px] text-neutral-500">completed</p>
            </div>
            <div className="rounded-lg bg-base-900/60 p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">This week</p>
              <p className="mt-0.5 text-lg font-semibold text-neutral-100">{member.completedThisWeek}</p>
              <p className="text-[11px] text-neutral-500">completed</p>
            </div>
          </div>
          {member.projectNamesToday.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {member.projectNamesToday.map((name) => (
                <span key={name} className="rounded-full bg-base-900 px-2 py-0.5 text-[11px] text-neutral-400">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
