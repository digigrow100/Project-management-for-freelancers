import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";
import { attachmentLocation, attachmentPath } from "@/lib/attachmentAccess";
import { getSupabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ bucket: string; key: string[] }> }) {
  const params = await routeParams;
  const missing = () => new NextResponse("Not found", { status: 404, headers: noStore });
  const location = attachmentLocation(params.bucket);
  const [prefix, storedOwnerId, filename] = params.key;
  const ownerId = params.bucket === "task-files" ? storedOwnerId?.replace(/^client-/, "") : storedOwnerId;
  if (!location || params.key.length !== 3 || prefix !== location.prefix
    || !ownerId || !UUID.test(ownerId) || !filename || filename.length > 180
    || filename === "." || filename === ".." || /[/\\\u0000-\u001f]/.test(filename)) return missing();

  const storageKey = params.key.join("/");
  const requestedPath = `/api/attachments/${params.bucket}/${params.key.map(encodeURIComponent).join("/")}`;
  const supabase = getSupabase();
  try {
    const task = location.table === "freelance_hq_tasks";
    const query = supabase.from(location.table);
    const { data, error } = task
      ? await query.select("project_id,files").eq("id", ownerId).maybeSingle()
      : location.table === "freelance_hq_backlink_entries"
        ? await query.select("project_id,files").eq("id", ownerId).maybeSingle()
        : await query.select("project_id,url").eq("project_id", ownerId);
    if (error || !data) return missing();
    const entries = Array.isArray(data) ? data : [data];
    const record = entries.find((entry) => {
      const files = "files" in entry ? entry.files : [entry.url];
      return Array.isArray(files) && files.some((file) => {
        const url = typeof file === "string" ? file : file?.url;
        return typeof url === "string" && attachmentPath(url) === requestedPath;
      });
    });
    if (!record) return missing();

    const share = request.nextUrl.searchParams.get("share");
    if (share !== null) {
      if (!task || !/^[a-f0-9]{32,128}$/i.test(share)) return missing();
      const { data: shared, error: shareError } = await supabase.from("freelance_hq_projects")
        .select("id").eq("id", record.project_id).eq("share_token", share).maybeSingle();
      if (shareError || !shared) return missing();
    } else {
      await requireProjectAccess(record.project_id);
    }

    const inline = /\.(?:png|jpe?g|gif|webp|avif)$/i.test(filename);
    const { data: signed, error: signError } = await supabase.storage.from(params.bucket)
      .createSignedUrl(storageKey, 60, { download: !inline });
    if (signError || !signed?.signedUrl) return missing();
    return NextResponse.redirect(signed.signedUrl, { status: 307, headers: noStore });
  } catch {
    return missing();
  }
}
