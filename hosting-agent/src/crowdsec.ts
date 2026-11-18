export type Decision = { id: string; value: string; type: string; scenario: string; duration: string };
export type Alert = { id: string; scenario: string; message: string; value: string };

function lapi(path: string, method: string) {
  const base = process.env.CROWDSEC_LAPI_URL;
  const key = process.env.CROWDSEC_LAPI_KEY;
  if (!base || !key) return null;
  const url = new URL(path, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("lapi_unavailable");
  return fetch(url, { method, headers: { "X-Api-Key": key, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(8000) });
}

export async function readDecisions(): Promise<{ available: boolean; reason?: string; decisions: Decision[] }> {
  const response = await lapi("/v1/decisions", "GET");
  if (!response) return { available: false, reason: "lapi_not_configured", decisions: [] };
  if (!response.ok) return { available: false, reason: "lapi_unavailable", decisions: [] };
  const payload = await response.json() as unknown;
  const rows = Array.isArray(payload) ? payload : [];
  return {
    available: true,
    decisions: rows.slice(0, 100).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        value: String(item.value ?? ""),
        type: String(item.type ?? ""),
        scenario: String(item.scenario ?? ""),
        duration: String(item.duration ?? ""),
      };
    }).filter((item) => item.id),
  };
}

export async function readAlerts(): Promise<{ available: boolean; reason?: string; alerts: Alert[] }> {
  const response = await lapi("/v1/alerts?limit=20", "GET");
  if (!response) return { available: false, reason: "lapi_not_configured", alerts: [] };
  if (!response.ok) return { available: false, reason: "lapi_unavailable", alerts: [] };
  const payload = await response.json() as unknown;
  const rows = Array.isArray(payload) ? payload : [];
  return {
    available: true,
    alerts: rows.slice(0, 20).map((row) => {
      const item = row as Record<string, unknown>;
      const source = item.source as Record<string, unknown> | undefined;
      return { id: String(item.id ?? ""), scenario: String(item.scenario ?? ""), message: String(item.message ?? "").slice(0, 240), value: String(source?.value ?? "") };
    }).filter((item) => item.id),
  };
}

export async function deleteDecision(id: string) {
  const response = await lapi(`/v1/decisions/${encodeURIComponent(id)}`, "DELETE");
  if (!response) throw new Error("lapi_not_configured");
  if (!response.ok && response.status !== 404) throw new Error("lapi_unavailable");
}
