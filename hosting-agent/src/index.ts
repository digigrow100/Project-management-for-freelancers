import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { publicKeyFromDer } from "./auth.ts";
import { createAgentServer } from "./server.ts";
import { retryReceipts } from './receipts.ts';
import { readState, writeState } from "./state.ts";
const token = process.env.HOSTING_AGENT_TOKEN ?? "";
const publicKey = process.env.HOSTING_AGENT_SIGNING_PUBLIC_KEY ?? "";
const sitesDir = process.env.SITES_DIR || "/opt/stacks/sites";
const dataDir = process.env.DATA_DIR || "/opt/stacks/hms-website-data";
if (token.length < 32 || !publicKey) {
    process.stderr.write("HOSTING_AGENT_TOKEN and HOSTING_AGENT_SIGNING_PUBLIC_KEY are required.\n");
    process.exit(1);
}
mkdirSync(sitesDir, { recursive: true });
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
// Never replay an interrupted build after restart. Keep the last route and require review.
for (const name of readdirSync(dataDir)) {
    const state = readState(dataDir, name);
    if (state?.status === "building")
        writeState(dataDir, { ...state, status: "uncertain", error: "agent_restarted_during_build" });
}
const enrollmentFile = process.env.NETWORK_ENROLLMENT_FILE;
if (!enrollmentFile)
    throw Error("NETWORK_ENROLLMENT_FILE is required in production");
const enrollment = JSON.parse(readFileSync(enrollmentFile, "utf8"));
if (enrollment.version !== 1 || enrollment.bootId !== readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim())
    throw Error("Website network enrollment is not ready for this boot");
const server = createAgentServer({
    token,
    publicKey: publicKeyFromDer(publicKey),
    sitesDir,
    dataDir,
    auditFile: process.env.AUDIT_FILE || "/var/log/hms-agent/audit.log",
});
let retrying = false;
const receiptsTimer = setInterval(() => {
    if (retrying)
        return;
    retrying = true;
    void retryReceipts(dataDir, token).finally(() => { retrying = false; });
}, 60000);
receiptsTimer.unref();
const port = Number(process.env.PORT || 8787);
server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`hms-agent listening on ${port}\n`);
    // Containers do not auto-start before firewall enrollment after a reboot.
    void import("./docker.ts").then(async ({ DockerClient }) => {
        const docker = new DockerClient();
        for (const name of readdirSync(dataDir)) {
            const state = readState(dataDir, name);
            if (state?.status === "running" && state.container)
                await docker.action(state.container, "start").catch(() => { });
        }
    });
});
