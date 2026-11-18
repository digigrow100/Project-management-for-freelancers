import { mkdirSync } from "node:fs";
import { publicKeyFromDer } from "./auth.ts";
import { createAgentServer } from "./server.ts";

const token = process.env.HOSTING_AGENT_TOKEN ?? "";
const publicKey = process.env.HOSTING_AGENT_SIGNING_PUBLIC_KEY ?? "";
const sitesDir = process.env.SITES_DIR || "/opt/stacks/sites";
const dataDir = process.env.DATA_DIR || "/var/lib/hms-agent";
if (token.length < 32 || !publicKey) {
  process.stderr.write("HOSTING_AGENT_TOKEN and HOSTING_AGENT_SIGNING_PUBLIC_KEY are required.\n");
  process.exit(1);
}
mkdirSync(sitesDir, { recursive: true });
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const server = createAgentServer({
  token,
  publicKey: publicKeyFromDer(publicKey),
  sitesDir,
  dataDir,
  auditFile: process.env.AUDIT_FILE || "/var/log/hms-agent/audit.log",
});
const port = Number(process.env.PORT || 8787);
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`hms-agent listening on ${port}\n`);
});
