import { RefreshButton } from "./RefreshButton";
import { WorkspaceSwitcher } from "./WorkspaceProvider";
import {WorkspaceBrand} from "./hosting/WorkspaceChrome";

export function MobileTopBar() {
  return (
    <header className="md:hidden sticky top-0 z-20 space-y-3 border-b border-base-700/60 bg-base-900/95 px-4 pt-[env(safe-area-inset-top)] py-3 backdrop-blur">
      <div className="flex items-center gap-2">
      <WorkspaceBrand/>
      <RefreshButton className="ml-auto" />
      </div>
      <WorkspaceSwitcher />
    </header>
  );
}

