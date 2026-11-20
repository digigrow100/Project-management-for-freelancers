import "server-only";
import { getSupabase } from "@/lib/supabaseClient";
import { agentFingerprint } from "@/lib/hosting/agent-client";
import { decryptAppSecret } from "./secrets";
import { APP_COLUMNS, type HostingApp, type HostingAppDomain, type HostingDeployment, type HostingEnvName } from "./types";
const apps = "freelance_hq_hosting_apps";
const deployments = "freelance_hq_hosting_deployments";
const domains = "freelance_hq_hosting_app_domains";
const envVars = "freelance_hq_hosting_app_env";
export function storageCode(error: unknown) {
    const value = error as {
        code?: string;
        message?: string;
    };
    if (value?.code === "23505")
        return "name_taken";
    if (value?.code === "42P01" || String(value?.message ?? "").includes("does not exist") || String(value?.message ?? "").includes("schema cache"))
        return "migration_required";
    return "storage_unavailable";
}
export async function listApps(clientId: string | null) {
    const query = getSupabase().from(apps).select(APP_COLUMNS).order("updated_at", { ascending: false });
    const result = await (clientId ? query.eq("client_id", clientId) : query);
    if (result.error)
        throw new Error(storageCode(result.error));
    return (result.data ?? []) as HostingApp[];
}
export async function getApp(id: string, clientId: string | null) {
    const query = getSupabase().from(apps).select(APP_COLUMNS).eq("id", id);
    const result = await (clientId ? query.eq("client_id", clientId) : query).maybeSingle();
    if (result.error)
        throw new Error(storageCode(result.error));
    return result.data as HostingApp | null;
}
export async function listDeployments(appId: string) {
    const result = await getSupabase().from(deployments).select("id,app_id,status,trigger,image_ref,log_excerpt,error,created_at,finished_at,request_key").eq("app_id", appId).order("created_at", { ascending: false }).limit(20);
    if (result.error)
        throw new Error(storageCode(result.error));
    return (result.data ?? []) as HostingDeployment[];
}
export async function recentDeployments(clientId: string | null) {
    // Restrict in SQL before LIMIT; never load another customer's deployment records.
    const owned = clientId ? (await listApps(clientId)).map(app => app.id) : null;
    if (owned && !owned.length)
        return [] as HostingDeployment[];
    let query = getSupabase().from(deployments).select("id,app_id,status,trigger,image_ref,log_excerpt,error,created_at,finished_at,request_key").order("created_at", { ascending: false }).limit(20);
    if (owned)
        query = query.in("app_id", owned);
    const result = await query;
    if (result.error)
        throw new Error(storageCode(result.error));
    return (result.data ?? []) as HostingDeployment[];
}
export async function listDomains(appId: string) {
    const result = await getSupabase().from(domains).select("id,app_id,hostname,verification_token,is_primary,status,detail,last_checked_at,created_at,group_host,is_preview,dns_verified_at,dns_setup_detail").eq("app_id", appId).order("created_at");
    if (result.error)
        throw new Error(storageCode(result.error));
    return (result.data ?? []) as HostingAppDomain[];
}
export async function listEnvNames(appId: string) {
    const result = await getSupabase().from(envVars).select("id,app_id,name,updated_at").eq("app_id", appId).order("name");
    if (result.error)
        throw new Error(storageCode(result.error));
    return (result.data ?? []) as HostingEnvName[];
}
export async function loadEnvValues(appId: string) {
    const result = await getSupabase().from(envVars).select("name,value_encrypted").eq("app_id", appId);
    if (result.error)
        throw new Error(storageCode(result.error));
    return ((result.data ?? []) as {
        name: string;
        value_encrypted: string;
    }[]).map((row) => ({ name: row.name, value: decryptAppSecret(row.value_encrypted) }));
}
export async function loadGitToken(appId: string) {
    const result = await getSupabase().from(apps).select("git_token_encrypted").eq("id", appId).maybeSingle();
    if (result.error)
        throw new Error(storageCode(result.error));
    const encrypted = (result.data as {
        git_token_encrypted: string | null;
    } | null)?.git_token_encrypted;
    return encrypted ? decryptAppSecret(encrypted) : undefined;
}
export async function rememberAgent(actor: string) {
    const fingerprint = agentFingerprint();
    if (!fingerprint)
        return;
    await getSupabase().from("freelance_hq_hosting_agent_config").upsert({
        id: true,
        token_sha256: fingerprint.tokenSha256,
        signing_public_key: fingerprint.signingPublicKey,
        agent_host: fingerprint.host,
        updated_by: actor,
        updated_at: new Date().toISOString(),
    });
}
