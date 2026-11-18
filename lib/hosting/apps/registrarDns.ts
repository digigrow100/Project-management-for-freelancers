import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabaseClient";
import { Dynadot, RegistrarError } from "@/lib/hosting/registrar/api";
import { connection } from "@/lib/hosting/registrar/store";
import type { DnsRecord } from "./dns";
import { domainOk } from "./validate";

export async function registrarOwns(hostname: string) {
  const labels = hostname.split(".");
  for (let index = 0; index < labels.length - 1; index += 1) {
    const name = labels.slice(index).join(".");
    const row = await getSupabase().from("freelance_hq_hosting_registrar_domains").select("name").eq("name", name).limit(1).maybeSingle();
    if (!row.error && row.data?.name === name) return name;
  }
  return null;
}

export async function configureDynadot(apex: string, records: DnsRecord[]) {
  if (!domainOk(apex)) throw new Error("invalid_domain");
  const conn = await connection();
  const api = new Dynadot(conn.credentials);
  await api.info(apex);
  for (const record of records) {
    const type = record.type.toLowerCase();
    if (type !== "a" && type !== "cname" && type !== "txt") throw new Error("invalid_domain");
    try {
      await api.change(apex, { kind: "dns_add", record: { host: record.host, type, value: record.value, priority: 0 } }, randomUUID());
    } catch (error) {
      if (error instanceof RegistrarError && error.code === "answer_unknown") throw new Error("registrar_uncertain");
      throw new Error(error instanceof RegistrarError ? error.code : "registrar_rejected");
    }
  }
}
