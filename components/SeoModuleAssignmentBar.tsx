"use client";

import { useState, useTransition } from "react";
import { UserRoundCheck } from "lucide-react";
import { setSeoModuleAssignmentAction } from "@/lib/actions";
import type { Profile, SeoAssignableModule } from "@/lib/types";

export function SeoModuleAssignmentBar({
  projectId,
  module,
  title,
  assignedTo,
  members,
  canEdit,
}: {
  projectId: string;
  module: SeoAssignableModule;
  title: string;
  assignedTo: string;
  members: Profile[];
  canEdit: boolean;
}) {
  const [value, setValue] = useState(assignedTo);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedMember = members.find((member) => member.id === value);

  function update(next: string) {
    setValue(next);
    setMessage("");
    startTransition(async () => {
      try {
        await setSeoModuleAssignmentAction({
          projectId,
          module,
          assignedTo: next || null,
        });
        setMessage(next ? "Module assigned." : "Module unassigned.");
      } catch (error) {
        setValue(assignedTo);
        setMessage(error instanceof Error ? error.message : "Could not update module assignment.");
      }
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-700/60 bg-base-850 px-4 py-3 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-500/10 text-accent-300">
          <UserRoundCheck size={15} />
        </span>
        <div>
          <p className="text-xs font-semibold text-neutral-200">{title} owner</p>
          <p className="mt-0.5 text-[10px] text-neutral-600">
            {selectedMember ? `All ${title} workflow tasks go to ${selectedMember.name || selectedMember.email}.` : "No module owner — current rotation rules apply."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canEdit ? (
          <select
            value={value}
            onChange={(event) => update(event.target.value)}
            disabled={isPending}
            className="rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-200 outline-none focus:border-accent-500 disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name || member.email}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-xs text-neutral-300">
            {selectedMember ? selectedMember.name || selectedMember.email : "Unassigned"}
          </span>
        )}
        {message && <span className="text-[10px] text-neutral-500">{message}</span>}
      </div>
    </div>
  );
}
