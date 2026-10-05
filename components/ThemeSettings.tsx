"use client";

import { useState, useTransition } from "react";
import { Check, Moon, Palette } from "lucide-react";
import type { ThemePreference } from "@/lib/types";
import { updateThemePreferenceAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const THEMES: Array<{
  id: ThemePreference;
  name: string;
  description: string;
  dots: string[];
}> = [
  { id: "dark", name: "Dark (Default)", description: "Existing dark theme with the original green accent.", dots: ["#33d485", "#1fb96e"] },
  { id: "emerald", name: "Emerald", description: "Fresh mint and emerald accents.", dots: ["#34d399", "#10b981"] },
  { id: "sky", name: "Sky Blue", description: "Clean blue and cyan accents.", dots: ["#38bdf8", "#0ea5e9"] },
  { id: "coral", name: "Coral", description: "Warm coral and peach accents.", dots: ["#fb7b67", "#f45b48"] },
];

export function ThemeSettings({ currentTheme }: { currentTheme: ThemePreference }) {
  const [selected, setSelected] = useState<ThemePreference>(currentTheme);
  const [isPending, startTransition] = useTransition();

  function chooseTheme(theme: ThemePreference) {
    setSelected(theme);
    document.querySelector(".app-theme")?.setAttribute("data-theme", theme);
    startTransition(async () => {
      await updateThemePreferenceAction(theme);
    });
  }

  return (
    <section className="rounded-xl2 border border-base-700/60 bg-base-900/70 p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400">
          <Palette size={19} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Theme</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Choose your personal color scheme. Other team members keep their own selection.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-base-700/60 bg-base-950/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Current theme</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-base-800 text-accent-400">
            <Moon size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-100">{THEMES.find((theme) => theme.id === selected)?.name}</p>
            <p className="text-xs text-neutral-500">{selected === "dark" ? "Original app theme." : "Personal accent theme."}</p>
          </div>
          {isPending && <span className="text-xs text-neutral-500">Saving...</span>}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {THEMES.map((theme) => {
          const active = selected === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => chooseTheme(theme.id)}
              className={cn(
                "relative rounded-xl border p-4 text-left transition-all",
                active
                  ? "border-accent-400 bg-accent-500/10 shadow-glow"
                  : "border-base-700/60 bg-base-850 hover:border-base-600 hover:bg-base-800",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {theme.dots.map((dot) => (
                    <span key={dot} className="h-5 w-5 rounded-full border border-white/10" style={{ backgroundColor: dot }} />
                  ))}
                </div>
                <span className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border",
                  active ? "border-accent-400 bg-accent-500 text-base-950" : "border-base-600 text-transparent",
                )}>
                  <Check size={14} />
                </span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-neutral-100">{theme.name}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-500">{theme.description}</p>
              <div className="mt-4 space-y-2 rounded-lg border border-base-700/50 bg-base-950/50 p-3">
                <div className="h-2 w-2/3 rounded-full bg-accent-500" />
                <div className="h-2 w-1/2 rounded-full bg-base-600" />
                <div className="h-2 w-5/6 rounded-full bg-accent-500/25" />
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-xs leading-5 text-neutral-500">
        Theme is personal. Your choice is saved to your account and does not affect other team members.
      </p>
    </section>
  );
}
