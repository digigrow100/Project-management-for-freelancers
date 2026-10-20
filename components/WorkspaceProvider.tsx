"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { workspaceForPath, type Workspace } from "@/lib/hostingWorkspace";
import { cn } from "@/lib/utils";

const WorkspaceContext = createContext({
  workspace: "team" as Workspace,
  canAccessHosting: false,
});

export function WorkspaceProvider({ canAccessHosting, children }: {
  canAccessHosting: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // URL state survives refresh, deep links and Back without a stale mode cookie.
  const workspace = canAccessHosting ? workspaceForPath(pathname) : "team";
  return (
    <WorkspaceContext.Provider value={{ workspace, canAccessHosting }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceOnly({ name, children }: { name: Workspace; children: ReactNode }) {
  return useWorkspace().workspace === name ? <>{children}</> : null;
}

export function WorkspaceSwitcher() {
  const { workspace, canAccessHosting } = useWorkspace();
  if (!canAccessHosting) return null;

  return (
    <nav aria-label="Switch workspace" className="grid grid-cols-[1.4fr_1fr] gap-1 rounded-xl border border-base-700/60 bg-base-950/40 p-1">
      {([
        { name: "team", label: "Team Management", href: "/admin" },
        { name: "hosting", label: "Hosting", href: "/hosting" },
      ] as const).map(({ name, label, href }) => (
        <Link key={name} href={href} prefetch={false}
          aria-current={workspace === name ? "true" : undefined}
          className={cn(
            "flex min-h-10 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400",
            workspace === name
              ? "bg-accent-500/15 text-accent-300"
              : "text-neutral-400 hover:bg-base-800 hover:text-neutral-100",
          )}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
