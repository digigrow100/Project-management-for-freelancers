import "server-only";

const locations = {
  "task-files": { prefix: "tasks", table: "freelance_hq_tasks" },
  "task-images": { prefix: "tasks", table: "freelance_hq_tasks" },
  "project-attachments": { prefix: "projects", table: "freelance_hq_project_attachments" },
  "backlink-files": { prefix: "backlinks", table: "freelance_hq_backlink_entries" },
} as const;

export function attachmentLocation(bucket: string) {
  return Object.prototype.hasOwnProperty.call(locations, bucket)
    ? locations[bucket as keyof typeof locations]
    : null;
}

export function attachmentPath(url: string): string {
  try {
    const stored = new URL(url);
    if (!process.env.SUPABASE_URL || stored.origin !== new URL(process.env.SUPABASE_URL).origin) return url;
    const match = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(stored.pathname);
    if (match?.[1] && attachmentLocation(match[1])) return `/api/attachments/${match[1]}/${match[2]}`;
  } catch {
    // External or already-local links are preserved.
  }
  return url;
}
