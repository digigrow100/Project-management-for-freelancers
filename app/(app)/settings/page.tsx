import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { getBusinessProfile } from "@/lib/store";
import { BusinessProfileForm } from "@/components/BusinessProfileForm";
import { ThemeSettings } from "@/components/ThemeSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const currentProfile = await getCurrentProfile();
  if (!currentProfile) return null;

  const isAdmin = currentProfile.role === "admin";
  const activeTab = searchParams.tab === "business" && isAdmin ? "business" : "theme";
  const businessProfile = isAdmin && activeTab === "business" ? await getBusinessProfile() : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-50">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Personalize your workspace. Theme choices only affect your own account.
        </p>
      </div>

      <div className="flex gap-2 border-b border-base-700/60 pb-3">
        <Link
          href="/settings?tab=theme"
          className={
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
            (activeTab === "theme"
              ? "bg-accent-500 text-base-950 shadow-glow"
              : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200")
          }
        >
          Theme
        </Link>
        {isAdmin && (
          <Link
            href="/settings?tab=business"
            className={
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (activeTab === "business"
                ? "bg-accent-500 text-base-950 shadow-glow"
                : "text-neutral-400 hover:bg-base-800 hover:text-neutral-200")
            }
          >
            Business
          </Link>
        )}
      </div>

      {activeTab === "theme" ? (
        <ThemeSettings currentTheme={currentProfile.themePreference ?? "dark"} />
      ) : (
        businessProfile && <BusinessProfileForm profile={businessProfile} />
      )}
    </div>
  );
}
