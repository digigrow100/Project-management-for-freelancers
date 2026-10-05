"use client";

import { useRef, useState, type TouchEvent } from "react";
import type { Project, ProjectType } from "@/lib/types";
import { PROJECT_THEME } from "@/lib/projectTheme";
import { cn } from "@/lib/utils";
import { ProjectCardClient, type ProjectPaymentSummary } from "./ProjectCardClient";
import { DragScrollRow } from "./DragScrollRow";

const TABS: { type: ProjectType; label: string }[] = [
  { type: "seo", label: "SEO" },
  { type: "web_dev", label: "Web Development" },
  { type: "web_app", label: "Web Application" },
  { type: "digital_marketing", label: "Digital Marketing" },
  { type: "other", label: "Other" },
];

export function ProjectTypeTabs({
  projects,
  progress,
  paymentByProject,
}: {
  projects: Project[];
  progress: Record<string, { done: number; total: number; openCount: number }>;
  paymentByProject?: Record<string, ProjectPaymentSummary[]>;
}) {
  const counts = TABS.reduce<Record<ProjectType, number>>(
    (acc, tab) => {
      acc[tab.type] = projects.filter((p) => p.type === tab.type).length;
      return acc;
    },
    { seo: 0, web_dev: 0, web_app: 0, digital_marketing: 0, other: 0 },
  );

  const visibleTabs = TABS.filter(
    (tab) => counts[tab.type] > 0 || tab.type === "seo" || tab.type === "web_dev" || tab.type === "web_app",
  );
  const [active, setActive] = useState<ProjectType>(visibleTabs[0]?.type ?? "seo");

  const filtered = projects.filter((p) => p.type === active);
  const theme = PROJECT_THEME[active];

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    const touch = e.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    touchStart.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const index = visibleTabs.findIndex((tab) => tab.type === active);
    if (index === -1) return;
    const nextIndex = dx < 0 ? index + 1 : index - 1;
    const nextTab = visibleTabs[nextIndex];
    if (nextTab) setActive(nextTab.type);
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex flex-wrap gap-2 border-b border-base-700/60 pb-3"
      >
        {visibleTabs.map((tab) => {
          const tabTheme = PROJECT_THEME[tab.type];
          const Icon = tabTheme.icon;
          const isActive = active === tab.type;
          return (
            <button
              key={tab.type}
              onClick={() => setActive(tab.type)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? cn(tabTheme.iconBg, tabTheme.iconText, "shadow-glow")
                  : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200",
              )}
            >
              <Icon size={16} />
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px]",
                  isActive ? "bg-black/20" : "bg-base-700/60 text-neutral-400",
                )}
              >
                {counts[tab.type]}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl2 border border-dashed p-10 text-center",
            theme.cardBorder,
          )}
        >
          <theme.icon size={22} className={theme.iconText} />
          <p className="text-sm text-neutral-400">No {theme.label.toLowerCase()} projects yet.</p>
        </div>
      ) : (
        <DragScrollRow className="-mx-1 px-1 pb-2">
          {filtered.map((project) => (
            <div key={project.id} className="w-72 shrink-0">
              <ProjectCardClient
                project={project}
                progress={progress[project.id] ?? { done: 0, total: 0, openCount: 0 }}
                payments={paymentByProject?.[project.id] ?? []}
              />
            </div>
          ))}
        </DragScrollRow>
      )}
    </div>
  );
}
