"use client";

import { useRef, useState, useTransition } from "react";
import { UserPlus, Trash2, ChevronDown, ShieldCheck, RefreshCcw, KeyRound } from "lucide-react";
import type { Profile, Project } from "@/lib/types";
import {
  assignProjectsAction,
  inviteTeamMemberAction,
  removeMemberAction,
  setMemberBacklinkCredentialAccessAction,
  setMemberRenewalsAccessAction,
  updateMemberRoleAction,
} from "@/lib/actions";
import { PROJECT_THEME } from "@/lib/projectTheme";
import { cn } from "@/lib/utils";

export function AdminTeamPanel({
  currentUserId,
  members,
  projects,
  assignmentsByMember,
}: {
  currentUserId: string;
  members: Profile[];
  projects: Project[];
  assignmentsByMember: Record<string, string[]>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <InviteMemberForm />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Team ({members.length})
        </h2>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            projects={projects}
            assignedIds={assignmentsByMember[member.id] ?? []}
            isSelf={member.id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

function InviteMemberForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await inviteTeamMemberAction(formData);
          if (result.ok) {
            formRef.current?.reset();
          } else {
            setError(result.error);
          }
        });
      }}
      className="flex flex-col gap-3 rounded-xl2 border border-base-700/60 bg-base-850 p-4"
    >
      <div className="flex items-center gap-2">
        <UserPlus size={16} className="text-accent-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Invite team member</h2>
      </div>
      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="name"
          placeholder="Name"
          required
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <input
          name="password"
          type="password"
          placeholder="Temporary password"
          required
          minLength={6}
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
        />
        <select
          name="role"
          defaultValue="member"
          className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 focus:border-accent-500 focus:outline-none"
        >
          <option value="member">Member (limited access)</option>
          <option value="admin">Admin (full access)</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
      >
        {isPending ? "Inviting…" : "Invite"}
      </button>
    </form>
  );
}

function MemberRow({
  member,
  projects,
  assignedIds,
  isSelf,
}: {
  member: Profile;
  projects: Project[];
  assignedIds: string[];
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));

  function toggleProject(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-xl2 border border-base-700/60 bg-base-850 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-neutral-100">{member.name || member.email}</p>
            {isSelf && <span className="text-[11px] text-neutral-500">(you)</span>}
            {member.role === "admin" && (
              <span className="flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 text-[11px] text-accent-300">
                <ShieldCheck size={11} />
                Admin
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500">{member.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isSelf && (
            <select
              value={member.role}
              disabled={isPending}
              onChange={(e) =>
                startTransition(() => updateMemberRoleAction(member.id, e.target.value as "admin" | "member"))
              }
              className="rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          )}
          {member.role === "member" && (
            <button
              type="button"
              onClick={() => setAssignOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-base-600 px-2.5 py-1.5 text-xs text-neutral-300 hover:border-accent-500/60 hover:text-accent-300"
            >
              Projects ({assignedIds.length})
              <ChevronDown size={13} className={cn("transition-transform", assignOpen && "rotate-180")} />
            </button>
          )}
          {member.role === "member" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(() => setMemberRenewalsAccessAction(member.id, !member.canAccessRenewals))
              }
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50",
                member.canAccessRenewals
                  ? "border-accent-500/50 bg-accent-500/10 text-accent-300"
                  : "border-base-600 text-neutral-300 hover:border-accent-500/60 hover:text-accent-300",
              )}
              title={member.canAccessRenewals ? "Revoke Domains tab access" : "Grant Domains tab access"}
            >
              <RefreshCcw size={13} />
              Domains {member.canAccessRenewals ? "on" : "off"}
            </button>
          )}
          {member.role === "member" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(() =>
                  setMemberBacklinkCredentialAccessAction(member.id, !member.canAccessBacklinkCredentials),
                )
              }
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-50",
                member.canAccessBacklinkCredentials
                  ? "border-accent-500/50 bg-accent-500/10 text-accent-300"
                  : "border-base-600 text-neutral-300 hover:border-accent-500/60 hover:text-accent-300",
              )}
              title={
                member.canAccessBacklinkCredentials
                  ? "Revoke backlink credential reveal access"
                  : "Grant backlink credential reveal access"
              }
            >
              <KeyRound size={13} />
              Backlink creds {member.canAccessBacklinkCredentials ? "on" : "off"}
            </button>
          )}
          {!isSelf && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (confirm(`Remove ${member.name || member.email} from the team?`)) {
                  startTransition(() => removeMemberAction(member.id));
                }
              }}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
              title="Remove member"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {assignOpen && member.role === "member" && (
        <form
          action={(formData) => {
            formData.set("userId", member.id);
            startTransition(async () => {
              await assignProjectsAction(formData);
            });
          }}
          className="mt-3 flex flex-col gap-2 border-t border-base-700/60 pt-3"
        >
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {projects.map((project) => {
              const theme = PROJECT_THEME[project.type];
              return (
                <label
                  key={project.id}
                  className="flex items-center gap-2 rounded-md border border-base-700/50 bg-base-900 px-2.5 py-1.5 text-xs text-neutral-300"
                >
                  <input
                    type="checkbox"
                    name="projectIds"
                    value={project.id}
                    checked={selected.has(project.id)}
                    onChange={() => toggleProject(project.id)}
                    className="accent-accent-500"
                  />
                  <span className={cn("truncate", theme.iconText)}>{project.name}</span>
                </label>
              );
            })}
            {projects.length === 0 && <p className="text-xs text-neutral-500">No projects yet.</p>}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-fit rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-base-950 hover:bg-accent-400 disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save access"}
          </button>
        </form>
      )}
    </div>
  );
}
