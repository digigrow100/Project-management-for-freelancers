const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { build } = require("esbuild");

async function load(file) {
  const result = await build({ entryPoints: [path.join(__dirname, "..", file)], bundle: true, platform: "node", format: "cjs", write: false });
  const output = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, output, output.exports);
  return output.exports;
}

test("panel and agent agree on names, domains and request signing", async () => {
  const panel = await load("lib/hosting/apps/validate.ts");
  const agent = await load("hosting-agent/src/validate.ts");
  const samples = ["my-site", "A", "../traefik", "traefik", "www.example.com", "https://github.com/acme/site", "https://user:token@github.com/acme/site", "nginx:1.27-alpine"];
  for (const value of samples) {
    assert.equal(panel.appNameOk(value), agent.appNameOk(value));
    assert.equal(panel.domainOk(value), agent.domainOk(value));
    assert.equal(panel.gitUrlOk(value), agent.gitUrlOk(value));
    assert.equal(panel.imageRefOk(value), agent.imageRefOk(value));
  }
  const panelSign = await load("lib/hosting/apps/agentProtocol.ts");
  const agentSign = await load("hosting-agent/src/canonical.ts");
  const body = Buffer.from("{\"name\":\"demo\"}");
  assert.equal(panelSign.canonicalRequest("POST", "/v1/apps", "1700000000000", "abc123abc123abcd", body), agentSign.canonicalRequest("POST", "/v1/apps", "1700000000000", "abc123abc123abcd", body));
});

test("domain verification accepts the origin address and a Cloudflare proxy only with the token", async () => {
  const dns = await load("lib/hosting/apps/dns.ts");
  assert.equal(dns.isCloudflareIp("104.16.1.1"), true);
  assert.equal(dns.isCloudflareIp("62.171.130.156"), false);
  const origin = dns.assessDns({ addresses: ["62.171.130.156"], txt: [], token: "abc", httpVerified: false });
  assert.equal(origin.proven, true);
  assert.equal(origin.method, "a");
  const hidden = dns.assessDns({ addresses: ["104.16.1.1"], txt: [], token: "abc", httpVerified: false });
  assert.equal(hidden.proven, false);
  assert.equal(hidden.cloudflare, true);
  const token = "a".repeat(48);
  const proven = dns.assessDns({ addresses: ["104.16.1.1"], txt: [token], token, httpVerified: false });
  assert.equal(proven.proven, true);
  assert.equal(proven.method, "txt");
  const http = dns.assessDns({ addresses: [], txt: [], token, httpVerified: true });
  assert.equal(http.method, "http");
  assert.equal(dns.domainStatusAfterProof(false, false, false), "pending_dns");
  assert.equal(dns.domainStatusAfterProof(true, true, false), "issuing_ssl");
  assert.equal(dns.domainStatusAfterProof(true, true, true), "active");
  const plan = dns.dnsPlan("example.com", token);
  assert.equal(plan.records[0].type, "A");
  assert.equal(plan.records[0].value, "62.171.130.156");
  assert.equal(plan.records[1].type, "TXT");
  const www = dns.dnsPlan("www.example.com", token);
  assert.equal(www.records[0].type, "CNAME");
  assert.equal(www.records[0].value, "example.com");
  assert.equal(dns.dnsPlan("localhost", token), null);
});

test("framework detection reads the manifest instead of the repository name", async () => {
  const detect = await load("lib/hosting/apps/detect.ts");
  assert.equal(detect.frameworkFromManifest(["package.json", "next.config.js"], { dependencies: { next: "15.0.0" } }), "nextjs");
  assert.equal(detect.frameworkFromManifest(["package.json"], { dependencies: { nuxt: "3.0.0" } }), "nuxt");
  assert.equal(detect.frameworkFromManifest(["package.json", "vite.config.ts"], { dependencies: { react: "18.0.0", vite: "5.0.0" } }), "react");
  assert.equal(detect.frameworkFromManifest(["Dockerfile"], null), "dockerfile");
  assert.equal(detect.frameworkFromManifest(["index.html"], null), "static");
  assert.equal(detect.frameworkFromManifest(["readme.md"], null), null);
});
