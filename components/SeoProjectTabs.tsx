"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BarChart3, FileEdit, FileText, Link2, Search, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "pages" | "keywords" | "onPage" | "technical" | "content" | "offPage" | "reporting" | "client";

const TABS: { key: TabKey; label: string; icon: typeof Search }[] = [
  { key: "pages", label: "Website Pages", icon: FileText },
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
  pages,
  keywords,
  onPage,
  technical,
  content,
  offPage,
  reporting,
  clientDetails,
}: {
  pages: ReactNode;
  keywords: ReactNode;
  onPage: ReactNode;
  technical: ReactNode;
  content: ReactNode;
  offPage: ReactNode;
  reporting: ReactNode;
  clientDetails?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("seoTab") as TabKey | null;
  const initialTab = requestedTab && TABS.some((tab) => tab.key === requestedTab) ? requestedTab : "pages";
  const [active, setActive] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (requestedTab && TABS.some((tab) => tab.key === requestedTab)) {
      setActive(requestedTab);
    }
  }, [requestedTab]);

  const panels: Record<TabKey, ReactNode | undefined> = {
    pages,
    keywords,
    onPage,
    technical,
    content,
    offPage,
    reporting,
    client: clientDetails,
  };
  const visibleTabs = TABS.filter((tab) => tab.key !== "client" || clientDetails !== undefined);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2 border-b border-base-700/60 pb-3">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActive(tab.key);
                const next = new URLSearchParams(searchParams.toString());
                next.set("seoTab", tab.key);
                router.replace(`${pathname}?${next.toString()}`, { scroll: false });
              }}
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

      {panels[active] ?? panels.pages}
    </div>
  );
}
