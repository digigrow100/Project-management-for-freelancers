import { Leaf } from "lucide-react";
import { RefreshButton } from "./RefreshButton";
import { WorkspaceSwitcher } from "./WorkspaceProvider";

export function MobileTopBar() {
  return (
    <header className="md:hidden sticky top-0 z-20 space-y-3 border-b border-base-700/60 bg-base-900/95 px-4 pt-[env(safe-area-inset-top)] py-3 backdrop-blur">
      <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400">
        <Leaf size={17} />
      </span>
      <span className="text-sm font-semibold tracking-wide text-neutral-100">Freelance HQ</span>
      <RefreshButton className="ml-auto" />
      </div>
      <WorkspaceSwitcher />
    </header>
  );
}
