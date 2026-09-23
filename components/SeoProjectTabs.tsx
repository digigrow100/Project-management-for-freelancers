"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, BarChart3, FileEdit, Link2, Search, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "keywords" | "onPage" | "technical" | "content" | "offPage" | "reporting" | "client";

const TABS: { key: TabKey; label: string; icon: typeof Search }[] = [
  { key: "keywords", label: "Keywords", icon: Search },
  { key: "onPage", label: "On-Page", icon: TrendingUp },
  { key: "technical", label: "Technical", icon: AlertTriangle },
  { key: "content", label: "Content", icon: FileEdit },
  { key: "offPage", label: "Off-Page", icon: Link2 },
  { key: "reporting", label: "Reporting", icon: BarChart3 },
  { key: "client", label: "Client Details", icon: User },
];

/**
 * Top-level tab controller for SEO projects, replacing ProjectDetailTabs'
 * Board/Keywords/Backlinks/Attachments/Client set. Keywords is first and
 * default-open, reflecting it as the central SEO asset every other module
 * connects to.
 */
export function SeoProjectTabs({
  keywords,
  onPage,
  technical,
  content,
  offPage,
  reporting,
  clientDetails,
}: {
  keywords: ReactNode;
  onPage: ReactNode;
  technical: ReactNode;
  content: ReactNode;
  offPage: ReactNode;
  reporting: ReactNode;
  clientDetails: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("keywords");
  const panels: Record<TabKey, ReactNode> = {
    keywords,
    onPage,
    technical,
    content,
    offPage,
    reporting,
    client: clientDetails,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2 border-b border-base-700/60 pb-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent-500/15 text-accent-300 shadow-glow"
                  : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200",
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {panels[active]}
    </div>
  );
}
