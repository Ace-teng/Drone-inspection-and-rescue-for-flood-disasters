// 可编程的假智能体网关：用来在本地复现 createSession / run 的各种失败分支，
// 不需要连接真实 OpenTrek 平台。
import { createServer } from "node:http";

export async function startMockGateway({ handlers = {} } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const path = req.url.split("?")[0];
    let raw = "";
    for await (const chunk of req) raw += chunk;
    calls.push({ method: req.method, path, headers: req.headers, body: raw ? JSON.parse(raw) : null });

    // 一张最小的合法 JPEG，用于让图片可访问性检查通过。
    if (path === "/image.jpg") {
      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": bytes.length });
      return res.end(bytes);
    }
    if (path === "/missing.jpg") {
      res.writeHead(404, { "Content-Type": "text/html" });
      return res.end("<html><body>404 Not Found</body></html>");
    }

    const handler = handlers[path];
    if (!handler) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, errorMsg: `mock gateway 未定义 ${path}` }));
    }
    const result = await handler(calls.at(-1));
    res.writeHead(result.status ?? 200, { "Content-Type": result.contentType ?? "application/json" });
    res.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
  });

  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    imageUrl: `http://127.0.0.1:${port}/image.jpg`,
    missingImageUrl: `http://127.0.0.1:${port}/missing.jpg`,
    calls,
    async stop() { await new Promise(done => server.close(done)); }
  };
}

export const okSession = { success: true, data: { uniqueCode: "mock-session-001" } };
export const okRun = text => ({ success: true, data: { message: { content: [{ type: "text", text: { value: text } }] } } });
export const readOnlySqlError = {
  success: false,
  errorCode: "SYSTEM_ERROR",
  errorMsg: "ERROR: cannot execute INSERT in a read-only transaction; SQL: INSERT INTO ibp_agent_session (id, agent_code) VALUES (?, ?)"
};
