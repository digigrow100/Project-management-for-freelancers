"use client";

import { useState } from "react";
import { ClipboardList, Link2, Mail, Search } from "lucide-react";
import type {
  BacklinkCategory,
  BacklinkEntry,
  BacklinkTemplate,
  BacklinkTemplateItem,
  CompetitorBacklink,
  Keyword,
  KeywordPage,
  OutreachProspect,
  Profile,
  Task,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { BacklinksPanel } from "@/components/BacklinksPanel";
import { OutreachPipelinePanel } from "@/components/OutreachPipelinePanel";
import { CompetitorBacklinksPanel } from "@/components/CompetitorBacklinksPanel";
import { BacklinkTemplatesPanel } from "@/components/BacklinkTemplatesPanel";

type SubTabKey = "assets" | "outreach" | "competitor" | "templates";

const SUB_TABS: { key: SubTabKey; label: string; icon: typeof Link2 }[] = [
  { key: "assets", label: "Assets", icon: Link2 },
  { key: "outreach", label: "Guest Post & Outreach", icon: Mail },
  { key: "competitor", label: "Competitor Backlinks", icon: Search },
  { key: "templates", label: "Templates", icon: ClipboardList },
];

export function OffPagePanel({
  projectId,
  categories,
  entriesByCategory,
  hasVaultPassword,
  keywords,
  pages,
  assignableMembers,
  prospects,
  tasksByProspect,
  competitorBacklinks,
  templates,
  templateItemsByTemplate,
  isAdmin,
}: {
  projectId: string;
  categories: BacklinkCategory[];
  entriesByCategory: Record<string, BacklinkEntry[]>;
  hasVaultPassword: boolean;
  keywords: Keyword[];
  pages: KeywordPage[];
  assignableMembers: Profile[];
  prospects: OutreachProspect[];
  tasksByProspect: Record<string, Task[]>;
  competitorBacklinks: CompetitorBacklink[];
  templates: BacklinkTemplate[];
  templateItemsByTemplate: Record<string, BacklinkTemplateItem[]>;
  isAdmin: boolean;
}) {
  const [active, setActive] = useState<SubTabKey>("assets");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5 border-b border-base-700/60 pb-2.5">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-accent-500/15 text-accent-300"
                  : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200",
              )}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {active === "assets" && (
        <BacklinksPanel
          projectId={projectId}
          categories={categories}
          entriesByCategory={entriesByCategory}
          hasVaultPassword={hasVaultPassword}
          keywords={keywords}
          assignableMembers={assignableMembers}
        />
      )}
      {active === "outreach" && (
        <OutreachPipelinePanel
          projectId={projectId}
          prospects={prospects}
          tasksByProspect={tasksByProspect}
          assignableMembers={assignableMembers}
        />
      )}
      {active === "competitor" && (
        <CompetitorBacklinksPanel projectId={projectId} backlinks={competitorBacklinks} pages={pages} />
      )}
      {active === "templates" && (
        <BacklinkTemplatesPanel
          projectId={projectId}
          templates={templates}
          templateItemsByTemplate={templateItemsByTemplate}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
