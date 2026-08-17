import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentGatewayError,
  classifyImageUrl,
  classifyPlatformFault,
  createAgentClient,
  redactSecrets,
  truncate
} from "../lib/agent-gateway.mjs";

const appKey = "super-secret-app-key-1234567890";
const quietLogger = { warn() {}, error() {} };

function clientWith(responder, options = {}) {
  return createAgentClient({
    apiBase: "https://gateway.invalid/api",
    appKey,
    logger: quietLogger,
    fetchImpl: async (url, init) => responder(String(url), init),
    ...options
  });
}

const jsonResponse = (body, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function failure(promise) {
  try {
    await promise;
    assert.fail("应该抛出 AgentGatewayError");
  } catch (error) {
    assert.ok(error instanceof AgentGatewayError, `抛出的不是 AgentGatewayError：${error}`);
    return error;
  }
}

test("密钥、Bearer 头和键值对都会被脱敏", () => {
  const text = `Authorization: Bearer ${appKey} appKey=${appKey} {"accessKeySecret":"abcdef123456"}`;
  const safe = redactSecrets(text, [appKey]);
  assert.equal(safe.includes(appKey), false);
  assert.match(safe, /Bearer \*\*\*/);
  assert.match(safe, /accessKeySecret":"\*\*\*/);
});

test("超长文本会被截断", () => {
  assert.ok(truncate("x".repeat(900)).length < 460);
  assert.match(truncate("x".repeat(900)), /已截断/);
});

test("只读事务等报错被判定为平台数据库故障", () => {
  const fault = classifyPlatformFault("ERROR: cannot execute INSERT in a read-only transaction; INSERT INTO ibp_agent_session");
  assert.equal(fault.platformFault, true);
  assert.equal(fault.faultKind, "database");
  assert.match(fault.hint, /平台侧故障/);
});

test("网关错误页被判定为平台网关故障，普通业务报错不被误判", () => {
  assert.equal(classifyPlatformFault("502 Bad Gateway").faultKind, "gateway");
  assert.equal(classifyPlatformFault("<html><head></head><body>nginx/1.20.1</body></html>").faultKind, "gateway");
  assert.equal(classifyPlatformFault("参数 agentVersion 不存在").platformFault, false);
});

test("图片链接分级：回环拒绝、内网告警、公网通过", () => {
  assert.equal(classifyImageUrl("http://127.0.0.1:8789/local-test-image/a.jpg").level, "reject");
  assert.equal(classifyImageUrl("http://localhost/a.jpg").level, "reject");
  assert.equal(classifyImageUrl("http://127.0.0.1/a.jpg", { allowLoopback: true }).level, "warn");
  assert.equal(classifyImageUrl("http://10.128.203.200/a.jpg").level, "warn");
  assert.equal(classifyImageUrl("http://192.168.1.5/a.jpg").level, "warn");
  assert.equal(classifyImageUrl("https://bucket.oss-cn-hangzhou.aliyuncs.com/a.jpg").level, "ok");
  assert.equal(classifyImageUrl("file:///C:/a.jpg").level, "reject");
  assert.equal(classifyImageUrl("not a url").level, "reject");
  assert.equal(classifyImageUrl("").level, "reject");
});

test("没有密钥时报 config.missing_key，而不是伪装成平台错误", async () => {
  const client = createAgentClient({ apiBase: "https://gateway.invalid/api", appKey: "", logger: quietLogger });
  const error = await failure(client.createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(error.stage, "config.missing_key");
  assert.equal(error.platformFault, false);
  assert.equal(error.responseStatus, 500);
});

test("网络不可达与超时分成不同 stage", async () => {
  const networkError = await failure(clientWith(() => { throw new TypeError("fetch failed"); }).createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(networkError.stage, "createSession.network");
  assert.equal(networkError.platformFault, false);

  const timeout = await failure(clientWith(() => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; }).createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(timeout.stage, "createSession.timeout");
  assert.match(timeout.message, /秒未返回/);
});

test("createSession 非 2xx 归到 createSession.http 并识别平台故障", async () => {
  const error = await failure(clientWith(() => jsonResponse("ERROR: cannot execute INSERT in a read-only transaction", 500)).createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(error.stage, "createSession.http");
  assert.equal(error.diagnostics.platformHttpStatus, 500);
  assert.equal(error.platformFault, true);
  assert.equal(error.faultKind, "database");
});

test("createSession 返回非 JSON 归到 createSession.invalid_json", async () => {
  const error = await failure(clientWith(() => new Response("<html>nginx</html>", { status: 200 })).createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(error.stage, "createSession.invalid_json");
  assert.equal(error.faultKind, "gateway");
});

test("createSession success=false 归到 createSession.rejected，只读事务被标为 external blocker", async () => {
  const body = { success: false, errorCode: "SYSTEM_ERROR", errorMsg: "ERROR: cannot execute INSERT in a read-only transaction; SQL: INSERT INTO ibp_agent_session (id) VALUES (?)", requestId: "req-42" };
  const error = await failure(clientWith(() => jsonResponse(body)).createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(error.stage, "createSession.rejected");
  assert.equal(error.platformFault, true);
  assert.equal(error.toPayload().externalBlocker, true);
  assert.equal(error.diagnostics.platformCode, "SYSTEM_ERROR");
  assert.equal(error.diagnostics.requestId, "req-42");
  assert.match(error.message, /read-only transaction/);
});

test("createSession success=true 但没有 uniqueCode 归到 createSession.empty", async () => {
  const error = await failure(clientWith(() => jsonResponse({ success: true, data: { other: 1 } })).createSession({ agentCode: "a", agentVersion: "1" }));
  assert.equal(error.stage, "createSession.empty");
  assert.deepEqual(error.diagnostics.dataKeys, ["other"]);
});

test("run 没有文本输出归到 run.empty，并给出图片相关排查方向", async () => {
  const body = { success: true, data: { message: { content: [{ type: "image" }, { type: "reasoning" }] } } };
  const error = await failure(clientWith(() => jsonResponse(body)).run({ sessionId: "s", text: "t", attachments: [{ url: "https://example.com/a.jpg" }] }));
  assert.equal(error.stage, "run.empty");
  assert.equal(error.platformFault, false);
  assert.deepEqual(error.diagnostics.contentTypes, ["image", "reasoning"]);
  assert.equal(error.diagnostics.attachmentCount, 1);
  assert.match(error.hint, /视觉节点读不到图片/);
});

test("run 返回空字符串同样算 run.empty", async () => {
  const body = { success: true, data: { message: { content: [{ type: "text", text: { value: "   " } }] } } };
  const error = await failure(clientWith(() => jsonResponse(body)).run({ sessionId: "s", text: "t" }));
  assert.equal(error.stage, "run.empty");
  assert.match(error.hint, /没有文本输出节点/);
});

test("run success=false 归到 run.rejected", async () => {
  const error = await failure(clientWith(() => jsonResponse({ success: false, errorMsg: "工作流 jfg2 节点执行失败" })).run({ sessionId: "s", text: "t" }));
  assert.equal(error.stage, "run.rejected");
  assert.equal(error.platformFault, false);
  assert.match(error.message, /jfg2 节点执行失败/);
});

test("stage 前缀可以区分主流程和工单流程", async () => {
  const error = await failure(clientWith(() => jsonResponse({ success: false, errorMsg: "no" })).createSession({ agentCode: "a", agentVersion: "1", stage: "workOrder.createSession" }));
  assert.equal(error.stage, "workOrder.createSession.rejected");
});

test("run 正常时返回文本输出", async () => {
  const client = clientWith(() => jsonResponse({ success: true, requestId: "req-7", data: { message: { content: [{ type: "text", text: { value: "{\"events\":[]}" } }] } } }));
  const result = await client.run({ sessionId: "s", text: "t" });
  assert.equal(result.output, "{\"events\":[]}");
  assert.equal(result.requestId, "req-7");
});

test("平台把密钥回显时也不会泄漏到错误信息里", async () => {
  const leaky = { success: false, errorMsg: `invalid token: Bearer ${appKey} (appKey=${appKey})` };
  const error = await failure(clientWith(() => jsonResponse(leaky)).createSession({ agentCode: "a", agentVersion: "1" }));
  const serialized = JSON.stringify(error.toPayload());
  assert.equal(serialized.includes(appKey), false, "错误载荷里出现了密钥");
  assert.equal(error.message.includes(appKey), false, "错误信息里出现了密钥");
});

test("请求头带上 Authorization，但错误信息里不出现请求头", async () => {
  let seenAuth = null;
  const client = clientWith((_url, init) => { seenAuth = init.headers.Authorization; return jsonResponse({ success: true, data: { uniqueCode: "s1" } }); });
  await client.createSession({ agentCode: "a", agentVersion: "1" });
  assert.equal(seenAuth, `Bearer ${appKey}`);
});

test("图片 404 归到 image.unreachable 并按 400 返回", async () => {
  const client = clientWith(() => new Response("<html>404</html>", { status: 404, headers: { "Content-Type": "text/html" } }));
  const error = await failure(client.assertImageUsable("https://example.com/expired.jpg"));
  assert.equal(error.stage, "image.unreachable");
  assert.equal(error.responseStatus, 400);
  assert.equal(error.diagnostics.imageHttpStatus, 404);
  assert.match(error.hint, /临时图床/);
});

test("回环图片链接在调用平台之前就被拒绝", async () => {
  let called = false;
  const client = clientWith(() => { called = true; return jsonResponse({ success: true }); });
  const error = await failure(client.assertImageUsable("http://127.0.0.1:8789/local-test-image/03.jpg"));
  assert.equal(error.stage, "image.rejected");
  assert.equal(error.responseStatus, 400);
  assert.equal(called, false, "被拒绝的图片不应该发出任何请求");
});

test("本机探测失败只告警，不阻断调用", async () => {
  const client = clientWith(() => { throw new TypeError("fetch failed"); });
  const result = await client.assertImageUsable("https://example.com/a.jpg");
  assert.equal(result.probeFailed, true);
  assert.equal(result.reachable, null);
});

test("图片可访问时返回状态与类型", async () => {
  const client = clientWith(() => new Response(null, { status: 200, headers: { "Content-Type": "image/jpeg", "Content-Length": "1024" } }));
  const result = await client.assertImageUsable("https://bucket.oss-cn-hangzhou.aliyuncs.com/a.jpg");
  assert.equal(result.reachable, true);
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.contentLength, 1024);
});
