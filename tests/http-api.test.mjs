import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ephemeralImageHosts } from "../lib/test-images.mjs";
import { startDemoServer, testDataDir } from "./helpers.mjs";

let server;
before(async () => { server = await startDemoServer(); });
after(async () => { await server?.stop(); });

test("首页可以打开且不含任何临时图床直链", async () => {
  const response = await server.get("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  for (const host of ephemeralImageHosts) assert.equal(html.includes(host), false, `页面仍引用 ${host}`);
  assert.match(html, /localSourcePicker/);
});

test("真实页与体验页加载同一套前端，并禁止缓存旧页面", async () => {
  for (const path of ['/', '/experience/']) {
    const response = await server.get(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    const base = new URL(path, server.base);
    const refs = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map(match => match[1]);
    for (const name of ['ui.css', 'ui.js', 'workspace.js']) {
      const ref = refs.find(ref => ref === name || ref === '/' + name);
      assert.ok(ref, `${path} 未接入 ${name}`);
      const asset = await fetch(new URL(ref, base));
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get('cache-control'), 'no-store');
      assert.equal(await asset.text(), readFileSync(new URL('../online-experience/' + name, import.meta.url), 'utf8'));
    }
  }
  const image = await server.get('/experience/assets/test-images/02_bridge_debris_medium.jpg');
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/jpeg/);
});

test("首页内联脚本可以被解析，且失败信息渲染器在位", async () => {
  const html = await (await server.get("/")).text();
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(blocks.length >= 3, `内联脚本块数量异常：${blocks.length}`);
  blocks.forEach((code, index) => {
    // new Function 只做语法解析，不执行，因此不需要浏览器环境。
    assert.doesNotThrow(() => new Function(code), `第 ${index + 1} 段内联脚本语法错误`);
  });
  assert.match(html, /function failureText\(/);
  assert.equal((html.match(/failureText\(/g) || []).length >= 7, true, "仍有错误分支没有走 failureText");
  assert.match(html, /\.status\{[^}]*white-space:pre-wrap/);
});

test("首页素材选择器由素材清单生成", async () => {
  const html = await (await server.get("/")).text();
  const catalog = await (await server.get("/api/test-images")).json();
  for (const image of catalog.images) {
    assert.ok(html.includes(`<option value="${image.file}">`), `缺少素材选项 ${image.file}`);
  }
});

test("/api/test-images 返回素材清单", async () => {
  const response = await server.get("/api/test-images");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.images.length, 6);
  for (const image of body.images) {
    assert.equal(typeof image.file, "string");
    assert.equal(typeof image.label, "string");
    assert.ok(image.bytes > 0);
    assert.equal(image.previewUrl, `/local-test-image/${encodeURIComponent(image.file)}`);
  }
});

test("本地素材可以预览", async () => {
  const response = await server.get("/local-test-image/03_flooded_road_high.jpg");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 1000);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});

test("素材预览拒绝未登记文件与路径穿越", async () => {
  for (const path of [
    "/local-test-image/nope.jpg",
    "/local-test-image/..%2f..%2fpackage.json",
    "/local-test-image/..%5C.env.local",
    "/local-test-image/.env.local",
    "/local-test-image/README.md"
  ]) {
    const response = await server.get(path);
    assert.equal(response.status, 404, `${path} 应该被拒绝`);
  }
});

test("默认预览图路由只依赖素材清单里的默认源", async () => {
  const response = await server.get("/api/image");
  // 默认源是外网图片：联网时返回图片，断网或图片失效时必须给出明确的 502，而不是崩溃。
  if (response.status === 200) {
    assert.match(response.headers.get("content-type"), /^image\//);
  } else {
    assert.equal(response.status, 502);
    assert.match(await response.text(), /默认演示图片当前不可访问/);
  }
});

test("素材清单未配置默认图片时给出 404", async () => {
  const isolated = await startDemoServer({ env: { DEMO_DEFAULT_IMAGE_URL: "https://h.uguu.se/expired.jpg" } });
  try {
    const response = await isolated.get("/api/image");
    assert.equal(response.status, 404);
    assert.match(await response.text(), /未配置默认演示图片/);
  } finally {
    await isolated.stop();
  }
});

test("模拟工单审批可以落盘，并且拒绝非法决策", async () => {
  const workOrderId = `WO-DEMO-TEST-${process.pid}`;
  const approved = await server.postJson("/api/disposition", { workOrderId, decision: "approve", note: "本地自动化测试记录" });
  assert.equal(approved.status, 200);
  const record = await approved.json();
  assert.equal(record.workOrderId, workOrderId);
  assert.equal(record.decision, "approve");
  assert.equal(record.simulationOnly, true);
  assert.equal(record.dispatchExecuted, false);

  const rejected = await server.postJson("/api/disposition", { workOrderId, decision: "reject", previousDecision: "approve" });
  assert.equal(rejected.status, 409);
  const revoked = await server.postJson("/api/disposition", { workOrderId, decision: "revoke", previousDecision: "approve" });
  assert.equal(revoked.status, 200);
  assert.equal((await server.postJson("/api/disposition", { workOrderId, decision: "reject" })).status, 200);

  const lines = readFileSync(join(testDataDir, "workorder-dispositions.jsonl"), "utf8").trim().split(/\r?\n/);
  const mine = lines.map(line => JSON.parse(line)).filter(item => item.workOrderId === workOrderId);
  assert.equal(mine.length, 3);
  assert.deepEqual(mine.map(item => item.decision), ["approve", "revoke", "reject"]);

  for (const body of [{}, { workOrderId }, { workOrderId, decision: "dispatch" }, { decision: "approve" }]) {
    const response = await server.postJson("/api/disposition", body);
    assert.notEqual(response.status, 200, `${JSON.stringify(body)} 不应被接受`);
    assert.match((await response.json()).error, /无效的工单审批请求/);
  }
});

test("并发重复审批只落盘一次，过期决定不能撤销", async () => {
  const workOrderId = `WO-DEMO-DUPLICATE-${process.pid}`;
  const responses = await Promise.all(Array.from({length:5}, () => server.postJson('/api/disposition', {workOrderId,decision:'approve',note:'并发审批'})));
  assert.ok(responses.every(response => response.status === 200));
  const records = await Promise.all(responses.map(response => response.json()));
  assert.equal(records.filter(record => record.deduplicated).length, 4);
  const history = readFileSync(join(testDataDir, 'workorder-dispositions.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line)).filter(record => record.workOrderId === workOrderId);
  assert.equal(history.length, 1);
  assert.equal((await server.postJson('/api/disposition', {workOrderId,decision:'revoke',previousDecision:'reject'})).status, 409);
  assert.equal((await server.postJson('/api/disposition', {workOrderId,decision:'revoke',previousDecision:'approve'})).status, 200);
  assert.equal((await server.postJson('/api/disposition', {workOrderId,decision:'reflight'})).status, 200);
});

test("审批意见长度被截断到 500 字", async () => {
  const response = await server.postJson("/api/disposition", { workOrderId: "WO-DEMO-TEST-LONG", decision: "reflight", note: "长".repeat(900) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).note.length, 500);
});

test("只有首页提供演示页，其他未知路由一律 404", async () => {
  assert.equal((await server.postJson("/api/no-such-endpoint", {})).status, 404);
  assert.equal((await server.get("/")).status, 200);
  assert.equal((await server.get("/index.html")).status, 200);
  assert.equal((await server.get("/?debug=1")).status, 200);
  for (const path of ["/no-such-path", "/.env.local", "/package.json", "/lib/agent-gateway.mjs", "/data/workorder-dispositions.jsonl"]) {
    assert.equal((await server.get(path)).status, 404, `${path} 不应该返回内容`);
  }
});

test("中文备注被拆到多个 TCP 分片时也不会乱码", async () => {
  const { request } = await import("node:http");
  const note = "手工复核：桥涵疑似堵塞，建议现场复核并警戒";
  const body = Buffer.from(JSON.stringify({ workOrderId: "WO-DEMO-TEST-UTF8", decision: "approve", note }), "utf8");
  // 故意在一个中文字符的字节中间切开请求体。
  const cut = body.indexOf(Buffer.from("手", "utf8")) + 1;

  const record = await new Promise((done, fail) => {
    const req = request({ host: "127.0.0.1", port: server.port, path: "/api/disposition", method: "POST", headers: { "Content-Type": "application/json" } }, res => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => done(JSON.parse(raw)));
    });
    req.on("error", fail);
    req.write(body.subarray(0, cut));
    req.write(body.subarray(cut));
    req.end();
  });

  assert.equal(record.note, note, "跨分片的中文备注被解码坏了");
});
