"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, FileText, Globe2, ListChecks, MessageSquareText, Search, Share2, User } from "lucide-react";
import { cn } from "@/lib/utils";

type TabKey = "pages" | "social" | "local" | "blog" | "web2" | "guest" | "reporting" | "client";

const TABS: { key: TabKey; label: string; icon: typeof Search }[] = [
  { key: "pages", label: "Website Pages", icon: FileText },
  { key: "social", label: "Social Media", icon: Share2 },
  { key: "local", label: "Local Listing", icon: Globe2 },
  { key: "blog", label: "Blog Onsite", icon: MessageSquareText },
  { key: "web2", label: "Web 2.0", icon: ListChecks },
  { key: "guest", label: "Guest Blogging", icon: Search },
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
  social,
  local,
  blog,
  web2,
  guest,
  reporting,
  clientDetails,
}: {
  pages: ReactNode;
  social: ReactNode;
  local: ReactNode;
  blog: ReactNode;
  web2: ReactNode;
  guest: ReactNode;
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
    social,
    local,
    blog,
    web2,
    guest,
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
