// 用假网关跑通 /api/mission、/api/review、/api/workorder 的成功与各条失败分支。
// 全程不接触真实 OpenTrek 平台。
import { test } from "node:test";
import assert from "node:assert/strict";
import { okRun, okSession, readOnlySqlError, startMockGateway } from "./mock-gateway.mjs";
import { dummyKey, startDemoServer } from "./helpers.mjs";

async function withStack(handlers, serverEnv = {}) {
  const gateway = await startMockGateway({ handlers });
  const server = await startDemoServer({
    env: { BAILIAN_API_BASE: gateway.base, DEMO_ALLOW_LOCAL_IMAGE_URLS: "1", ...serverEnv }
  });
  return {
    gateway,
    server,
    async stop() { await server.stop(); await gateway.stop(); }
  };
}

const missionBody = (gateway, extra = {}) => ({ imageUrl: gateway.imageUrl, taskText: "识别道路积水与桥涵堵塞", ...extra });

test("mission 正常路径：会话号与文本输出都返回", async () => {
  const stack = await withStack({
    "/createSession": () => ({ body: okSession }),
    "/run": () => ({ body: okRun('{"assessment_summary":"测试","events":[]}') })
  });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.sessionId, "mock-session-001");
    assert.match(data.output, /assessment_summary/);

    const runCall = stack.gateway.calls.find(call => call.path === "/run");
    assert.equal(runCall.headers.authorization, `Bearer ${dummyKey}`);
    assert.equal(runCall.body.message.attachments[0].url, stack.gateway.imageUrl);
    assert.equal(runCall.body.stream, false);
  } finally { await stack.stop(); }
});

test("createSession 只读事务错误被标为平台故障，而不是“未收到智能体结果”", async () => {
  const stack = await withStack({ "/createSession": () => ({ body: readOnlySqlError }) });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway));
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.stage, "createSession.rejected");
    assert.equal(data.platformFault, true);
    assert.equal(data.externalBlocker, true);
    assert.match(data.error, /read-only transaction/);
    assert.match(data.hint, /平台侧故障/);
    assert.equal(data.diagnostics.platformCode, "SYSTEM_ERROR");
    assert.equal(JSON.stringify(data).includes(dummyKey), false);
    assert.equal(data.error.includes("未收到智能体结果"), false);
  } finally { await stack.stop(); }
});

test("createSession HTTP 500 与 createSession success=false 分成不同 stage", async () => {
  const stack = await withStack({ "/createSession": () => ({ status: 500, body: { message: "internal error" } }) });
  try {
    const data = await (await stack.server.postJson("/api/mission", missionBody(stack.gateway))).json();
    assert.equal(data.stage, "createSession.http");
    assert.equal(data.diagnostics.platformHttpStatus, 500);
  } finally { await stack.stop(); }
});

test("run 有响应但没有文本输出时明确报 run.empty", async () => {
  const stack = await withStack({
    "/createSession": () => ({ body: okSession }),
    "/run": () => ({ body: { success: true, data: { message: { content: [{ type: "image" }] } } } })
  });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway));
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.stage, "run.empty");
    assert.equal(data.platformFault, false);
    assert.deepEqual(data.diagnostics.contentTypes, ["image"]);
    assert.match(data.hint, /视觉节点读不到图片/);
  } finally { await stack.stop(); }
});

test("run success=false 时把平台原因透出来", async () => {
  const stack = await withStack({
    "/createSession": () => ({ body: okSession }),
    "/run": () => ({ body: { success: false, errorMsg: "jfg2 视觉节点调用失败", errorCode: "AGENT_NODE_ERROR" } })
  });
  try {
    const data = await (await stack.server.postJson("/api/mission", missionBody(stack.gateway))).json();
    assert.equal(data.stage, "run.rejected");
    assert.match(data.error, /jfg2 视觉节点调用失败/);
    assert.equal(data.diagnostics.platformCode, "AGENT_NODE_ERROR");
  } finally { await stack.stop(); }
});

test("网关不可达时报 network，而不是 upstream unavailable", async () => {
  // 图片仍由假网关提供，避免测试依赖外网；平台地址指向一个没人监听的端口。
  const stack = await withStack({}, { BAILIAN_API_BASE: "http://127.0.0.1:1/api" });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway));
    assert.equal(response.status, 504);
    const data = await response.json();
    assert.equal(data.stage, "createSession.network");
    assert.match(data.hint, /校园网/);
    assert.equal(data.platformFault, false);
  } finally { await stack.stop(); }
});

test("缺少图片或任务描述时报 input.invalid（400）", async () => {
  const stack = await withStack({ "/createSession": () => ({ body: okSession }) });
  try {
    for (const body of [{ taskText: "只有任务" }, { imageUrl: "https://example.com/a.jpg" }, {}]) {
      const response = await stack.server.postJson("/api/mission", body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).stage, "input.invalid");
    }
    assert.equal(stack.gateway.calls.length, 0, "校验失败不应该调用平台");
  } finally { await stack.stop(); }
});

test("图片链接 404 时在调用平台之前就报 image.unreachable", async () => {
  const stack = await withStack({ "/createSession": () => ({ body: okSession }) });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway, { imageUrl: stack.gateway.missingImageUrl }));
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.equal(data.stage, "image.unreachable");
    assert.equal(data.diagnostics.imageHttpStatus, 404);
    assert.equal(stack.gateway.calls.some(call => call.path === "/createSession"), false);
  } finally { await stack.stop(); }
});

test("默认拒绝本机回环图片链接", async () => {
  const stack = await withStack({ "/createSession": () => ({ body: okSession }) }, { DEMO_ALLOW_LOCAL_IMAGE_URLS: "" });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).stage, "image.rejected");
  } finally { await stack.stop(); }
});

test("没有配置密钥时报 config.missing_key（500）", async () => {
  const stack = await withStack({ "/createSession": () => ({ body: okSession }) }, { BAILIAN_APP_KEY: "" });
  try {
    const response = await stack.server.postJson("/api/mission", missionBody(stack.gateway));
    assert.equal(response.status, 500);
    const data = await response.json();
    assert.equal(data.stage, "config.missing_key");
    assert.match(data.hint, /\.env\.local/);
  } finally { await stack.stop(); }
});

test("复核接口校验会话号、复核意见与原始任务", async () => {
  const stack = await withStack({ "/run": () => ({ body: okRun("已按人工意见更新研判") }) });
  try {
    for (const body of [
      { text: "修改研判：降级", imageUrl: "https://example.com/a.jpg", taskText: "t" },
      { sessionId: "s", imageUrl: "https://example.com/a.jpg", taskText: "t" },
      { sessionId: "s", text: "修改研判：降级" }
    ]) {
      const response = await stack.server.postJson("/api/review", body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).stage, "input.invalid");
    }

    const ok = await stack.server.postJson("/api/review", { sessionId: "mock-session-001", text: "修改研判：降为中风险", imageUrl: stack.gateway.imageUrl, taskText: "原始任务" });
    assert.equal(ok.status, 200);
    const runCall = stack.gateway.calls.find(call => call.path === "/run");
    assert.match(runCall.body.message.text, /人工复核决定：修改研判：降为中风险/);
    assert.equal(runCall.body.sessionId, "mock-session-001");
  } finally { await stack.stop(); }
});

test("复核阶段的失败带 review 前缀", async () => {
  const stack = await withStack({ "/run": () => ({ body: { success: true, data: { message: { content: [] } } } }) });
  try {
    const data = await (await stack.server.postJson("/api/review", { sessionId: "s", text: "修改研判：降级", imageUrl: stack.gateway.imageUrl, taskText: "t" })).json();
    assert.equal(data.stage, "review.empty");
  } finally { await stack.stop(); }
});

test("工单接口保持 jfg4 的结构化协议，并拒绝非 JSON 研判", async () => {
  const stack = await withStack({
    "/createSession": () => ({ body: okSession }),
    "/run": () => ({ body: okRun('{"success":true,"work_order_id":"WO-DEMO-1"}') })
  });
  try {
    const bad = await stack.server.postJson("/api/workorder", { assessment: "平台返回了一段自然语言" });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).stage, "input.invalid");

    const missing = await stack.server.postJson("/api/workorder", {});
    assert.equal(missing.status, 400);

    const ok = await stack.server.postJson("/api/workorder", { assessment: '{"assessment_summary":"测试","events":[]}' });
    assert.equal(ok.status, 200);
    const runCall = stack.gateway.calls.find(call => call.path === "/run");
    const request = JSON.parse(runCall.body.message.text);
    assert.deepEqual(Object.keys(request).sort(), ["human_confirmation", "operator_id", "risk_assessment", "status", "work_order_title"]);
    assert.equal(request.human_confirmation, "确认生成工单");
    assert.equal(request.status, "待人工审批");
    assert.deepEqual(request.risk_assessment, { assessment_summary: "测试", events: [] });
    assert.deepEqual(runCall.body.message.attachments, []);
  } finally { await stack.stop(); }
});

test("工单阶段的失败带 workOrder 前缀", async () => {
  const stack = await withStack({ "/createSession": () => ({ body: readOnlySqlError }) });
  try {
    const data = await (await stack.server.postJson("/api/workorder", { assessment: "{}" })).json();
    assert.equal(data.stage, "workOrder.createSession.rejected");
    assert.equal(data.platformFault, true);
  } finally { await stack.stop(); }
});

test("请求体不是 JSON 时返回 400 而不是 502", async () => {
  const stack = await withStack({});
  try {
    const response = await fetch(`${stack.server.base}/api/mission`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).stage, "input.invalid");
  } finally { await stack.stop(); }
});

test("平台回显密钥时也不会出现在返回给浏览器的内容里", async () => {
  const stack = await withStack({
    "/createSession": () => ({ body: { success: false, errorMsg: `token invalid: Bearer ${dummyKey}` } })
  });
  try {
    const raw = await (await stack.server.postJson("/api/mission", missionBody(stack.gateway))).text();
    assert.equal(raw.includes(dummyKey), false, "响应里出现了密钥");
    assert.match(raw, /Bearer \*\*\*/);
  } finally { await stack.stop(); }
});
