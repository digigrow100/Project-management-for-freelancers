import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import type { IncomingMessage } from "node:http";

export type DockerTarget = { socketPath?: string; host?: string; port?: number };

export function dockerTarget(value = process.env.DOCKER_HOST || "unix:///var/run/docker.sock"): DockerTarget {
  if (value.startsWith("unix://")) return { socketPath: value.slice("unix://".length) };
  const url = new URL(value);
  if (url.protocol !== "tcp:") throw new Error("invalid_docker_host");
  return { host: url.hostname, port: Number(url.port || 2375) };
}

function dockerCall(target: DockerTarget, method: string, path: string, body?: Buffer | NodeJS.ReadableStream, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
    const req = httpRequest({ ...target, method, path, headers, timeout: 600_000 }, (response: IncomingMessage) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 500, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("docker_timeout")));
    if (!body) req.end();
    else if (Buffer.isBuffer(body)) req.end(body);
    else body.pipe(req);
  });
}

export function demuxDockerLog(payload: Buffer) {
  const parts: string[] = [];
  let offset = 0;
  while (offset + 8 <= payload.length) {
    const size = payload.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > payload.length) break;
    parts.push(payload.subarray(offset, offset + size).toString("utf8"));
    offset += size;
  }
  return parts.length ? parts.join("") : payload.toString("utf8");
}

export class DockerClient {
  private target: DockerTarget;
  constructor(target = dockerTarget()) { this.target = target; }

  private async call(method: string, path: string, body?: Buffer, headers?: Record<string, string>) {
    const result = await dockerCall(this.target, method, path, body, headers);
    if (result.status >= 300) {
      const detail = result.body.toString("utf8").slice(0, 300);
      throw new Error(`docker_${result.status}:${detail}`);
    }
    return result.body;
  }

  async build(contextDir: string, tag: string, dockerfile: string) {
    const tar = spawn("tar", ["-C", contextDir, "-cf", "-", "."], { stdio: ["ignore", "pipe", "pipe"] });
    const query = `/build?t=${encodeURIComponent(tag)}&dockerfile=${encodeURIComponent(dockerfile)}&rm=1`;
    const result = await dockerCall(this.target, "POST", query, tar.stdout, { "content-type": "application/x-tar" });
    const text = result.body.toString("utf8");
    if (result.status >= 300 || /"error"/.test(text)) throw new Error("build_failed");
  }

  async pull(image: string) {
    const separator = image.lastIndexOf(":");
    const slash = image.lastIndexOf("/");
    const named = separator > slash ? image.slice(0, separator) : image;
    const tag = separator > slash ? image.slice(separator + 1) : "latest";
    await this.call("POST", `/images/create?fromImage=${encodeURIComponent(named)}&tag=${encodeURIComponent(tag)}`);
  }

  async remove(name: string) {
    await dockerCall(this.target, "DELETE", `/containers/${encodeURIComponent(name)}?force=1`);
  }

  async removeImage(image: string) {
    await dockerCall(this.target, "DELETE", `/images/${encodeURIComponent(image)}?force=1`);
  }

  async run(spec: { name: string; image: string; env: string[]; port: number; cpu: number; memoryMb: number; labels: Record<string, string> }) {
    await this.remove(spec.name);
    const body = Buffer.from(JSON.stringify({
      Image: spec.image,
      Env: spec.env,
      Labels: spec.labels,
      ExposedPorts: { [`${spec.port}/tcp`]: {} },
      HostConfig: {
        Memory: spec.memoryMb * 1024 * 1024,
        NanoCpus: Math.round(spec.cpu * 1e9),
        RestartPolicy: { Name: "unless-stopped" },
        SecurityOpt: ["no-new-privileges:true"],
        NetworkMode: "proxy",
        PidsLimit: 256,
      },
    }));
    await this.call("POST", `/containers/create?name=${encodeURIComponent(spec.name)}`, body, { "content-type": "application/json" });
    await this.call("POST", `/containers/${encodeURIComponent(spec.name)}/start`);
  }

  async action(name: string, action: "start" | "stop" | "restart") {
    const query = action === "start" ? "" : "?t=15";
    await this.call("POST", `/containers/${encodeURIComponent(name)}/${action}${query}`);
  }

  async logs(name: string) {
    const body = await this.call("GET", `/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&tail=200`);
    return demuxDockerLog(body).slice(-20_000);
  }

  async listManaged() {
    const filters = encodeURIComponent(JSON.stringify({ label: ["hms.managed=true"] }));
    const body = await this.call("GET", `/containers/json?all=1&filters=${filters}`);
    const parsed = JSON.parse(body.toString("utf8")) as { Names?: string[]; State?: string; Labels?: Record<string, string> }[];
    return parsed.map((item) => ({ name: item.Labels?.["hms.app"] ?? "", state: item.State ?? "unknown" }));
  }

  async stats(name: string) {
    const body = await this.call("GET", `/containers/${encodeURIComponent(name)}/stats?stream=false`);
    return JSON.parse(body.toString("utf8")) as { cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number }; precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number }; memory_stats?: { usage?: number; limit?: number } };
  }
}
