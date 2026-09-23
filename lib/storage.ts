import { getSupabase } from "./supabaseClient";
import type { TaskFile } from "./types";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_TASK_FILE_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * Uploads a file to the given public Supabase Storage bucket and returns its
 * public URL. Server-only (uses the service role client) so this must only be
 * called from Server Actions. Returns null if no file was actually provided.
 */
async function uploadToBucket(
  file: File | null,
  bucket: string,
  pathPrefix: string,
  maxBytes: number,
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  if (file.size > maxBytes) {
    throw new Error(`File is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB).`);
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${pathPrefix}/${unique}.${extension}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(path, arrayBuffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (error) throw error;

  const { data } = getSupabase().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Uploads a client/company logo to the "logos" bucket. Must be an image. */
export async function uploadLogo(file: File | null, pathPrefix: string): Promise<string | null> {
  if (file && file.size > 0 && !file.type.startsWith("image/")) {
    throw new Error("Logo must be an image.");
  }
  return uploadToBucket(file, "logos", pathPrefix, MAX_LOGO_BYTES);
}

/** Uploads any kind of file attached to a task to the "task-files" bucket. */
export async function uploadTaskFile(file: File | null, taskId: string): Promise<TaskFile | null> {
  const url = await uploadToBucket(file, "task-files", `tasks/${taskId}`, MAX_TASK_FILE_BYTES);
  if (!url || !file) return null;
  return { url, name: file.name, type: file.type || "application/octet-stream", size: file.size };
}

/** Uploads any kind of file attached to a project as a whole to the "project-attachments" bucket. */
export async function uploadProjectAttachment(
  file: File | null,
  projectId: string,
): Promise<{ url: string; name: string; type: string; size: number } | null> {
  const url = await uploadToBucket(file, "project-attachments", `projects/${projectId}`, MAX_TASK_FILE_BYTES);
  if (!url || !file) return null;
  return { url, name: file.name, type: file.type || "application/octet-stream", size: file.size };
}

/** Uploads a screenshot/file attached to a backlink asset to the "backlink-files" bucket. */
export async function uploadBacklinkFile(file: File | null, entryId: string): Promise<TaskFile | null> {
  const url = await uploadToBucket(file, "backlink-files", `backlinks/${entryId}`, MAX_TASK_FILE_BYTES);
  if (!url || !file) return null;
  return { url, name: file.name, type: file.type || "application/octet-stream", size: file.size };
}
