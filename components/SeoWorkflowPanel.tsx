"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import type { SeoWorkflowItem, SeoWorkflowModule } from "@/lib/types";
import {
  revealSeoWorkflowPasswordAction,
  updateSeoWorkflowItemDetailsAction,
  updateSeoWorkflowItemStatusAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

const DESCRIPTIONS: Record<SeoWorkflowModule, string> = {
  social_media: "Complete one social platform at a time for this project and keep its login details here.",
  local_listing: "Build, verify and store access details for each local business listing.",
  blog_onsite: "Prepare the next onsite blog through the writing workflow.",
  web_2_0: "Build Web 2.0 properties one platform at a time and save their access details.",
  guest_blogging: "Research, qualify, negotiate and track guest blogging opportunities.",
};

const LOGIN_METHODS = [
  ["", "Select login method"],
  ["email_password", "Email + Password"],
  ["google", "Continue with Google"],
  ["facebook", "Continue with Facebook"],
  ["apple", "Continue with Apple"],
  ["other", "Other"],
] as const;

function supportsLogin(module: SeoWorkflowModule) {
  return module === "social_media" || module === "local_listing" || module === "web_2_0";
}

export function SeoWorkflowPanel({
  projectId,
  module,
  title,
  items,
}: {
  projectId: string;
  module: SeoWorkflowModule;
  title: string;
  items: SeoWorkflowItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const done = items.filter((item) => item.status === "done").length;

  useEffect(() => {
    if (Object.keys(revealed).length === 0) return;
    const timer = window.setTimeout(() => setRevealed({}), 30000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  async function revealPassword(item: SeoWorkflowItem) {
    if (revealed[item.id]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      return;
    }

    const result = await revealSeoWorkflowPasswordAction({ projectId, itemId: item.id });
    if (result.ok) {
      setRevealed((current) => ({ ...current, [item.id]: result.password }));
      setSaveMessage((current) => ({ ...current, [item.id]: "Password revealed for 30 seconds." }));
    } else {
      setSaveMessage((current) => ({ ...current, [item.id]: result.error }));
    }
  }

  async function copyPassword(item: SeoWorkflowItem) {
    let password = revealed[item.id];
    if (!password) {
      const result = await revealSeoWorkflowPasswordAction({ projectId, itemId: item.id });
      if (!result.ok) {
        setSaveMessage((current) => ({ ...current, [item.id]: result.error }));
        return;
      }
      password = result.password;
      setRevealed((current) => ({ ...current, [item.id]: result.password }));
    }

    await navigator.clipboard.writeText(password);
    setSaveMessage((current) => ({ ...current, [item.id]: "Password copied." }));
  }

  return (
    <section className={cn("rounded-xl2 border border-base-700/60 bg-base-850 p-4 shadow-card", isPending && "opacity-80")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">{DESCRIPTIONS[module]}</p>
        </div>
        <span className="rounded-full bg-base-900 px-3 py-1 text-xs text-neutral-400">
          {done}/{items.length} done
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {items.map((item, index) => {
          const isDone = item.status === "done";
          const isOpen = openItemId === item.id;
          const steps = item.details.steps ?? [];
          const showLogin = supportsLogin(module);
          const showGuestFields = module === "guest_blogging";

          return (
            <div key={item.id} className="rounded-xl border border-base-700/60 bg-base-900/45 p-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() =>
                      updateSeoWorkflowItemStatusAction({
                        projectId,
                        itemId: item.id,
                        status: isDone ? "pending" : "done",
                      }),
                    )
                  }
                  className={cn("mt-0.5 shrink-0", isDone ? "text-emerald-400" : "text-neutral-600")}
                  aria-label={isDone ? "Mark pending" : "Mark done"}
                >
                  {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold text-neutral-600">{index + 1}</span>
                    <h3 className={cn("text-sm font-medium", isDone ? "text-neutral-500 line-through" : "text-neutral-100")}>
                      {item.title}
                    </h3>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
                      isDone ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300",
                    )}>
                      {isDone ? "Done" : "Pending"}
                    </span>
                    {item.hasPassword && (
                      <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-sky-300">
                        Login saved
                      </span>
                    )}
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-accent-300"
                    >
                      {item.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      <ExternalLink size={11} />
                    </a>
                  )}

                  {steps.length > 0 && (
                    <div className="mt-3 rounded-lg border border-base-700/50 bg-base-950/45 p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Workflow</p>
                      <ol className="space-y-1.5">
                        {steps.map((step, stepIndex) => (
                          <li key={step} className="flex gap-2 text-xs text-neutral-300">
                            <span className="text-neutral-600">{stepIndex + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                {(showLogin || showGuestFields || module === "blog_onsite") && (
                  <button
                    type="button"
                    onClick={() => setOpenItemId(isOpen ? null : item.id)}
                    className="rounded-md border border-base-700 p-1.5 text-neutral-500 hover:text-neutral-200"
                    aria-label={isOpen ? "Close details" : "Open details"}
                  >
                    {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                )}
              </div>

              {isOpen && (
                <form
                  className="mt-3 border-t border-base-700/60 pt-3"
                  action={(formData) => {
                    formData.set("projectId", projectId);
                    formData.set("itemId", item.id);
                    startTransition(async () => {
                      const result = await updateSeoWorkflowItemDetailsAction(formData);
                      setSaveMessage((current) => ({
                        ...current,
                        [item.id]: result.ok ? "Details saved." : result.error,
                      }));
                    });
                  }}
                >
                  {showLogin && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Login details</p>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        <Field label="Login Method">
                          <select name="loginMethod" defaultValue={item.loginMethod} className={inputClass}>
                            {LOGIN_METHODS.map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Login Email">
                          <input name="loginEmail" type="email" defaultValue={item.loginEmail} placeholder="name@example.com" className={inputClass} />
                        </Field>
                        <Field label="Username">
                          <input name="username" defaultValue={item.username} placeholder="@username or username" className={inputClass} />
                        </Field>
                        <Field label="Password">
                          <div className="flex gap-1.5">
                            <input
                              name="password"
                              type="password"
                              placeholder={item.hasPassword ? "Saved securely — leave blank to keep" : "Enter password"}
                              className={cn(inputClass, "min-w-0 flex-1")}
                            />
                            {item.hasPassword && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => revealPassword(item)}
                                  className="rounded-md border border-base-700 bg-base-950 px-2 text-neutral-400 hover:text-neutral-100"
                                  title={revealed[item.id] ? "Hide password" : "Reveal password"}
                                >
                                  {revealed[item.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyPassword(item)}
                                  className="rounded-md border border-base-700 bg-base-950 px-2 text-neutral-400 hover:text-neutral-100"
                                  title="Copy password"
                                >
                                  <Copy size={14} />
                                </button>
                              </>
                            )}
                          </div>
                          {revealed[item.id] && (
                            <div className="mt-1 rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 font-mono text-xs text-sky-200">
                              {revealed[item.id]}
                            </div>
                          )}
                        </Field>
                        <Field label="Profile / Listing URL">
                          <input name="profileUrl" defaultValue={item.profileUrl} placeholder="https://..." className={inputClass} />
                        </Field>
                        {module === "local_listing" && (
                          <Field label="Verification">
                            <select name="verificationStatus" defaultValue={item.verificationStatus} className={inputClass}>
                              <option value="">Not set</option>
                              <option value="not_started">Not started</option>
                              <option value="pending">Pending</option>
                              <option value="verified">Verified</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </Field>
                        )}
                      </div>
                    </div>
                  )}

                  {showGuestFields && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Guest blogging details</p>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        <Field label="Contact Name">
                          <input name="contactName" defaultValue={item.contactName} placeholder="Site owner / editor" className={inputClass} />
                        </Field>
                        <Field label="Contact Email">
                          <input name="contactEmail" type="email" defaultValue={item.contactEmail} placeholder="editor@example.com" className={inputClass} />
                        </Field>
                        <Field label="Outreach Status">
                          <select name="outreachStatus" defaultValue={item.outreachStatus} className={inputClass}>
                            <option value="">Not set</option>
                            <option value="not_contacted">Not contacted</option>
                            <option value="contacted">Contacted</option>
                            <option value="replied">Replied</option>
                            <option value="negotiating">Negotiating</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </Field>
                        <Field label="Price">
                          <div className="grid grid-cols-[1fr_76px] gap-1.5">
                            <input name="price" type="number" min="0" step="0.01" defaultValue={item.price ?? ""} placeholder="0.00" className={inputClass} />
                            <input name="currency" defaultValue={item.currency || "GBP"} className={inputClass} />
                          </div>
                        </Field>
                        <Field label="Payment">
                          <select name="paymentStatus" defaultValue={item.paymentStatus} className={inputClass}>
                            <option value="">Not set</option>
                            <option value="not_required">Not required</option>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="paid">Paid</option>
                          </select>
                        </Field>
                        <Field label="Approval">
                          <select name="approvalStatus" defaultValue={item.approvalStatus} className={inputClass}>
                            <option value="">Not set</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </Field>
                        <Field label="Article / Placement URL">
                          <input name="profileUrl" defaultValue={item.profileUrl} placeholder="https://..." className={inputClass} />
                        </Field>
                      </div>
                    </div>
                  )}

                  {module === "blog_onsite" && (
                    <p className="text-xs text-neutral-500">
                      Blog title, keyword and outline fields will stay in the blog workflow; login credentials are not required for this module.
                    </p>
                  )}

                  <Field label="Notes" className="mt-3">
                    <textarea name="notes" defaultValue={item.notes} rows={3} placeholder="Login notes, verification notes, outreach notes..." className={inputClass} />
                  </Field>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-2 text-xs font-semibold text-base-950 hover:bg-accent-400">
                      <Save size={13} /> Save details
                    </button>
                    {item.hasPassword && showLogin && (
                      <label className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                        <input type="checkbox" name="clearPassword" value="true" />
                        Remove saved password
                      </label>
                    )}
                    {saveMessage[item.id] && (
                      <span className="text-xs text-neutral-400">{saveMessage[item.id]}</span>
                    )}
                  </div>
                </form>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-base-700 p-8 text-center text-sm text-neutral-500">
            No workflow items added yet.
          </div>
        )}
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-md border border-base-700 bg-base-950 px-2.5 py-2 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-accent-500 focus:outline-none";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[10px] font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
