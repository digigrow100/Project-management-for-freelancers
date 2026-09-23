"use client";

import { useRef, useState } from "react";
import { Plus, X, Paperclip } from "lucide-react";
import { createTaskAction } from "@/lib/actions";
import type { Profile } from "@/lib/types";

export function NewTaskForm({
  projectId,
  stageId,
  assignableMembers = [],
}: {
  projectId: string;
  stageId: string | null;
  assignableMembers?: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    formRef.current?.reset();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-base-600 py-2 text-sm text-neutral-400 hover:border-accent-500/50 hover:text-accent-300"
      >
        <Plus size={15} />
        Add task
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await createTaskAction(formData);
        reset();
        setOpen(false);
      }}
      className="flex flex-col gap-2 rounded-lg border border-base-700/60 bg-base-850 p-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stageId" value={stageId ?? ""} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">New task</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-neutral-500 hover:text-neutral-300"
        >
          <X size={14} />
        </button>
      </div>
      <input
        name="title"
        autoFocus
        required
        placeholder="What needs to be done?"
        className="w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent-500 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          name="priority"
          defaultValue="medium"
          className="w-fit rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>

        <select
          name="assignedTo"
          defaultValue=""
          className="w-fit rounded-md border border-base-600 bg-base-900 px-2 py-1.5 text-xs text-neutral-300 focus:border-accent-500 focus:outline-none"
        >
          <option value="">Unassigned</option>
          {assignableMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name || member.email}
            </option>
          ))}
        </select>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-neutral-400 hover:text-accent-300">
        <Paperclip size={13} />
        Attach files
        <input type="file" name="attachmentFile" multiple className="hidden" />
      </label>

      <button
        type="submit"
        className="mt-1 rounded-md bg-accent-500 py-1.5 text-sm font-medium text-base-950 hover:bg-accent-400"
      >
        Add task
      </button>
    </form>
  );
}
