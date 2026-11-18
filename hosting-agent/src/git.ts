import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitRefOk, gitUrlOk } from "./validate.ts";

function scrub(text: string, secret?: string) {
  const clean = secret ? text.split(secret).join("[redacted]") : text;
  return clean.slice(-4000);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(scrub(stderr || `${command} exited ${code}`, env.HMS_GIT_TOKEN)));
    });
  });
}

export async function cloneRepo(url: string, destination: string, ref: string | undefined, token: string | undefined) {
  if (!gitUrlOk(url)) throw new Error("invalid_git_url");
  if (ref && !gitRefOk(ref)) throw new Error("invalid_git_ref");
  if (token && (token.length > 300 || /[\r\n\0]/.test(token))) throw new Error("invalid_token");
  rmSync(destination, { recursive: true, force: true });
  const args = ["clone", "--depth", "1"];
  if (ref) args.push("--branch", ref);
  args.push("--", url, destination);
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" };
  let directory: string | undefined;
  if (token) {
    directory = mkdtempSync(join(tmpdir(), "hms-ask-"));
    const script = join(directory, "askpass.sh");
    writeFileSync(script, "#!/bin/sh\ncase \"$1\" in\n*Username*) printf '%s' \"x-access-token\" ;;\n*) printf '%s' \"$HMS_GIT_TOKEN\" ;;\nesac\n", { mode: 0o700 });
    env.GIT_ASKPASS = script;
    env.HMS_GIT_TOKEN = token;
  }
  try {
    await run("git", args, env, 120_000);
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}
