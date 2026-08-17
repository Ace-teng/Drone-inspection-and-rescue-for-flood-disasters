// 测试辅助：启动一份独立进程的演示服务，跑完即关。
// 只使用 Node 内置模块，不引入任何依赖。
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const repoRoot = fileURLToPath(new URL("../", import.meta.url));

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// 假密钥只用于关闭本地代理分支并走真实的本地路由；不会被发到任何外部平台。
export const dummyKey = "test-local-only-key";

export async function startDemoServer({ env = {}, timeoutMs = 15000 } = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(repoRoot, "real-demo-server.mjs")], {
    cwd: repoRoot,
    env: { ...process.env, BAILIAN_APP_KEY: dummyKey, DEMO_UPSTREAM: "", PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`演示服务退出（code=${child.exitCode}）：\n${stdout}\n${stderr}`);
    try {
      await fetch(`${base}/api/test-images`);
      break;
    } catch {
      if (Date.now() > deadline) throw new Error(`演示服务启动超时：\n${stdout}\n${stderr}`);
      await new Promise(done => setTimeout(done, 120));
    }
  }

  return {
    base,
    port,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    async get(path, init) { return fetch(`${base}${path}`, init); },
    async postJson(path, body) {
      return fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise(done => child.once("exit", done));
    }
  };
}
