import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildObjectKey,
  describeStorage,
  normalizeContentType,
  ossRequiredEnv,
  sniffImageType,
  uploadedKeyPattern,
  validateUpload
} from "../lib/object-storage.mjs";
import { repoRoot, startDemoServer } from "./helpers.mjs";

const jpeg = readFileSync(join(repoRoot, "assets", "test-images", "03_flooded_road_high.jpg"));
// 最小合法 PNG（1x1 透明像素）。
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const limitBytes = 8 * 1024 * 1024;

let server;
before(async () => { server = await startDemoServer({ env: { STORAGE_DRIVER: "local" } }); });
after(async () => { await server?.stop(); });

async function upload(bytes, contentType, target = server) {
  return fetch(`${target.base}/api/upload`, { method: "POST", headers: { "Content-Type": contentType }, body: bytes });
}

test("文件头嗅探只认真正的 JPG/PNG", () => {
  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffImageType(png), "image/png");
  assert.equal(sniffImageType(Buffer.from("这不是图片，只是一段文本内容")), null);
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8])), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});

test("Content-Type 归一化去掉参数与大小写", () => {
  assert.equal(normalizeContentType("Image/JPEG; charset=binary"), "image/jpeg");
  assert.equal(normalizeContentType(undefined), "");
});

test("对象名带日期分层与 UUID，不会撞名", () => {
  const first = buildObjectKey({ prefix: "flood-demo", extension: "jpg", now: new Date(2026, 7, 17) });
  const second = buildObjectKey({ prefix: "flood-demo", extension: "jpg", now: new Date(2026, 7, 17) });
  assert.match(first, /^flood-demo\/2026\/08\/17\/[0-9a-f-]{36}\.jpg$/);
  assert.notEqual(first, second);
  assert.match(first, uploadedKeyPattern);
  assert.match(buildObjectKey({ extension: "png", now: new Date(2026, 0, 5) }), /^2026\/01\/05\/[0-9a-f-]{36}\.png$/);
});

test("校验层逐条拒绝非法上传", () => {
  assert.deepEqual(validateUpload({ buffer: jpeg, declaredType: "image/jpeg", limitBytes }).contentType, "image/jpeg");
  assert.equal(validateUpload({ buffer: png, declaredType: "image/png", limitBytes }).extension, "png");

  const cases = [
    [{ buffer: jpeg, declaredType: "image/gif", limitBytes }, "upload.unsupported_type", 415],
    [{ buffer: jpeg, declaredType: "text/plain", limitBytes }, "upload.unsupported_type", 415],
    [{ buffer: jpeg, declaredType: undefined, limitBytes }, "upload.unsupported_type", 415],
    [{ buffer: Buffer.alloc(0), declaredType: "image/jpeg", limitBytes }, "upload.empty", 400],
    [{ buffer: jpeg, declaredType: "image/jpeg", limitBytes: 1024 }, "upload.too_large", 413],
    [{ buffer: Buffer.from("完全不是图片的内容，长度足够"), declaredType: "image/jpeg", limitBytes }, "upload.not_an_image", 400],
    [{ buffer: jpeg, declaredType: "image/png", limitBytes }, "upload.type_mismatch", 400]
  ];
  for (const [input, stage, status] of cases) {
    try {
      validateUpload(input);
      assert.fail(`${stage} 应该抛错`);
    } catch (error) {
      assert.equal(error.stage, stage);
      assert.equal(error.responseStatus, status);
      assert.ok(error.hint.length > 0, `${stage} 缺少排查提示`);
    }
  }
});

test("未配置对象存储时只报变量名，不泄漏取值", () => {
  const summary = describeStorage({ OSS_BUCKET: "my-bucket", OSS_ACCESS_KEY_ID: "should-not-appear", STORAGE_DRIVER: "" });
  assert.equal(summary.driver, "aliyun-oss");
  assert.equal(summary.configured, false);
  assert.deepEqual(summary.missingEnv, ["OSS_REGION", "OSS_ACCESS_KEY_SECRET"]);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("should-not-appear"), false);
  assert.equal(serialized.includes("my-bucket"), false);

  const nothing = describeStorage({});
  assert.equal(nothing.configured, false);
  assert.deepEqual(nothing.missingEnv, ossRequiredEnv);
});

test("/api/upload-config 告诉前端上限与允许类型", async () => {
  const config = await (await server.get("/api/upload-config")).json();
  assert.equal(config.configured, true);
  assert.equal(config.driver, "local");
  assert.equal(config.maxBytes, 8 * 1024 * 1024);
  assert.deepEqual(config.allowedTypes, ["image/jpeg", "image/png"]);
  assert.equal(config.publicUrls, false, "本地 driver 不应声称生成公网直链");
});

test("上传 JPG 成功，返回可访问的 URL 且内容一致", async () => {
  const response = await upload(jpeg, "image/jpeg");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.bytes, jpeg.length);
  assert.equal(data.contentType, "image/jpeg");
  assert.equal(data.driver, "local");
  assert.match(data.objectKey, uploadedKeyPattern);
  assert.ok(data.url.startsWith(`${server.base}/uploaded-image/`), `URL 异常：${data.url}`);

  const fetched = await fetch(data.url);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get("content-type"), "image/jpeg");
  const bytes = Buffer.from(await fetched.arrayBuffer());
  assert.equal(bytes.length, jpeg.length);
  assert.equal(Buffer.compare(bytes, jpeg), 0, "取回的内容与上传内容不一致");
});

test("上传 PNG 成功", async () => {
  const data = await (await upload(png, "image/png")).json();
  assert.equal(data.contentType, "image/png");
  assert.match(data.objectKey, /\.png$/);
  assert.equal((await fetch(data.url)).headers.get("content-type"), "image/png");
});

test("同一张图片两次上传得到不同对象名", async () => {
  const first = await (await upload(png, "image/png")).json();
  const second = await (await upload(png, "image/png")).json();
  assert.notEqual(first.objectKey, second.objectKey);
  assert.equal((await fetch(first.url)).status, 200);
  assert.equal((await fetch(second.url)).status, 200);
});

test("上传接口按 stage 区分各类非法请求", async () => {
  const cases = [
    [jpeg, "text/plain", 415, "upload.unsupported_type"],
    [jpeg, "image/gif", 415, "upload.unsupported_type"],
    [Buffer.alloc(0), "image/jpeg", 400, "upload.empty"],
    [Buffer.from("这是一个伪装成图片的文本文件"), "image/jpeg", 400, "upload.not_an_image"],
    [jpeg, "image/png", 400, "upload.type_mismatch"]
  ];
  for (const [bytes, contentType, status, stage] of cases) {
    const response = await upload(bytes, contentType);
    assert.equal(response.status, status, `${stage} 状态码不符`);
    const data = await response.json();
    assert.equal(data.stage, stage);
    assert.ok(data.hint.length > 0);
    assert.equal(data.platformFault, false);
  }
});

test("超过上限的上传被拒绝（413），并且不会写入存储", async () => {
  const small = await startDemoServer({ env: { STORAGE_DRIVER: "local", UPLOAD_MAX_BYTES: "2048" } });
  try {
    assert.equal((await (await small.get("/api/upload-config")).json()).maxBytes, 2048);
    const response = await upload(jpeg, "image/jpeg", small);
    assert.equal(response.status, 413);
    const data = await response.json();
    assert.equal(data.stage, "upload.too_large");
    assert.match(data.hint, /UPLOAD_MAX_BYTES/);
  } finally { await small.stop(); }
});

test("未配置对象存储时上传返回 503 并列出缺少的变量名", async () => {
  const unconfigured = await startDemoServer({ env: { STORAGE_DRIVER: "" } });
  try {
    const config = await (await unconfigured.get("/api/upload-config")).json();
    assert.equal(config.configured, false);
    assert.deepEqual(config.missingEnv, ossRequiredEnv);

    const response = await upload(jpeg, "image/jpeg", unconfigured);
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.stage, "upload.storage_unconfigured");
    for (const name of ossRequiredEnv) assert.ok(data.hint.includes(name), `提示里缺少 ${name}`);
  } finally { await unconfigured.stop(); }
});

test("配置了 OSS 变量时上传可用，且凭据不出现在页面或接口响应里", async () => {
  const secrets = { OSS_ACCESS_KEY_ID: "TESTIDDONOTUSE0000000", OSS_ACCESS_KEY_SECRET: "test-secret-do-not-use", OSS_BUCKET: "flood-demo-bucket" };
  const configured = await startDemoServer({
    env: { STORAGE_DRIVER: "", OSS_REGION: "cn-hangzhou", ...secrets }
  });
  try {
    const config = await (await configured.get("/api/upload-config")).json();
    assert.equal(config.driver, "aliyun-oss");
    assert.equal(config.configured, true);
    assert.equal(config.publicUrls, true);
    assert.deepEqual(config.missingEnv, []);

    // 关键安全断言：凭据与 bucket 名不能出现在页面或任何接口响应里。
    const html = await (await configured.get("/")).text();
    const configRaw = await (await configured.get("/api/upload-config")).text();
    for (const secret of Object.values(secrets)) {
      assert.equal(html.includes(secret), false, `页面泄漏了 ${secret}`);
      assert.equal(configRaw.includes(secret), false, `/api/upload-config 泄漏了 ${secret}`);
    }
  } finally { await configured.stop(); }
});

test("OSS 配置不完整时上传返回 503，不会静默走别的路径", async () => {
  const partial = await startDemoServer({ env: { STORAGE_DRIVER: "aliyun-oss", OSS_BUCKET: "flood-demo-bucket" } });
  try {
    const config = await (await partial.get("/api/upload-config")).json();
    assert.equal(config.configured, false);
    assert.deepEqual(config.missingEnv, ["OSS_REGION", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"]);

    const response = await upload(jpeg, "image/jpeg", partial);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).stage, "upload.storage_unconfigured");
  } finally { await partial.stop(); }
});

test("端到端：走真实 ali-oss 客户端上传到本地假 OSS 端点", async () => {
  const { createServer } = await import("node:http");
  const received = [];
  const oss = createServer((req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, acl: req.headers["x-oss-object-acl"], bytes: Buffer.concat(chunks).length });
      res.writeHead(200, { ETag: '"fake-etag"' });
      res.end();
    });
  });
  await new Promise(done => oss.listen(0, "127.0.0.1", done));
  const endpoint = `http://127.0.0.1:${oss.address().port}`;

  const stack = await startDemoServer({
    env: {
      STORAGE_DRIVER: "aliyun-oss",
      OSS_REGION: "cn-hangzhou",
      OSS_BUCKET: "flood-demo-bucket",
      OSS_ACCESS_KEY_ID: "TESTIDDONOTUSE0000000",
      OSS_ACCESS_KEY_SECRET: "test-secret-do-not-use",
      OSS_ENDPOINT: endpoint,
      OSS_CNAME: "1",
      OSS_PUBLIC_BASE_URL: endpoint
    }
  });
  try {
    const response = await upload(jpeg, "image/jpeg", stack);
    const raw = await response.text();
    assert.equal(response.status, 200, `上传失败：${raw}`);
    const data = JSON.parse(raw);
    assert.equal(data.driver, "aliyun-oss");
    assert.equal(data.publicUrl, true);
    assert.equal(data.bytes, jpeg.length);
    assert.equal(data.url, `${endpoint}/${data.objectKey}`);

    assert.equal(received.length, 1, "假 OSS 端点没有收到上传请求");
    assert.equal(received[0].method, "PUT");
    assert.equal(received[0].url, `/${data.objectKey}`);
    assert.equal(received[0].acl, "public-read");
    assert.equal(received[0].bytes, jpeg.length);
  } finally {
    await stack.stop();
    await new Promise(done => oss.close(done));
  }
});

test("对象存储写入失败时返回 502 与 upload.storage_failed", async () => {
  const { createServer } = await import("node:http");
  const oss = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(403, { "Content-Type": "application/xml" });
      res.end('<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>no right to set object acl</Message><RequestId>mock</RequestId></Error>');
    });
  });
  await new Promise(done => oss.listen(0, "127.0.0.1", done));
  const endpoint = `http://127.0.0.1:${oss.address().port}`;

  const secret = "test-secret-do-not-use";
  const stack = await startDemoServer({
    env: {
      STORAGE_DRIVER: "aliyun-oss",
      OSS_REGION: "cn-hangzhou",
      OSS_BUCKET: "flood-demo-bucket",
      OSS_ACCESS_KEY_ID: "TESTIDDONOTUSE0000000",
      OSS_ACCESS_KEY_SECRET: secret,
      OSS_ENDPOINT: endpoint,
      OSS_CNAME: "1"
    }
  });
  try {
    const response = await upload(jpeg, "image/jpeg", stack);
    assert.equal(response.status, 502);
    const raw = await response.text();
    const data = JSON.parse(raw);
    assert.equal(data.stage, "upload.storage_failed");
    assert.equal(data.diagnostics.ossCode, "AccessDenied");
    assert.match(data.hint, /PutObjectAcl|阻止公共访问/);
    assert.equal(raw.includes(secret), false, "失败响应里泄漏了 AccessKey Secret");
  } finally {
    await stack.stop();
    await new Promise(done => oss.close(done));
  }
});

test("图片路由支持 HEAD：图片可访问性检查先发 HEAD", async () => {
  const uploaded = await (await upload(jpeg, "image/jpeg")).json();
  const head = await fetch(uploaded.url, { method: "HEAD" });
  assert.equal(head.status, 200, "HEAD 拿不到 200，图片预检会把好图误判为不可访问");
  assert.equal(head.headers.get("content-type"), "image/jpeg");
  assert.equal((await head.text()).length, 0);

  const preview = await fetch(`${server.base}/local-test-image/03_flooded_road_high.jpg`, { method: "HEAD" });
  assert.equal(preview.status, 200);
  assert.equal((await fetch(`${server.base}/uploaded-image/2026/01/01/00000000-0000-0000-0000-000000000000.jpg`, { method: "HEAD" })).status, 404);
});

test("/uploaded-image 拒绝路径穿越与伪造键名", async () => {
  for (const path of [
    // 注意：fetch 会在客户端就把 ../ 规范化掉，所以这里用编码形式才真正打到服务端。
    "/uploaded-image/..%2f..%2f.env.local",
    "/uploaded-image/..%5C..%5C.env.local",
    "/uploaded-image/%2e%2e%2f.env.local",
    "/uploaded-image/2026/08/17/not-a-uuid.jpg",
    "/uploaded-image/2026/08/17/00000000-0000-0000-0000-000000000000.jpg",
    "/uploaded-image/2026/08/17/00000000-0000-0000-0000-000000000000.exe",
    "/uploaded-image/"
  ]) {
    assert.equal((await server.get(path)).status, 404, `${path} 应该被拒绝`);
  }
});

test("上传界面存在，且页面不含任何密钥字样", async () => {
  const html = await (await server.get("/")).text();
  assert.match(html, /id="uploadFile"[^>]*accept="image\/jpeg,image\/png"/);
  assert.match(html, /id="uploadBtn"/);
  assert.match(html, /\/api\/upload-config/);
  assert.equal(/OSS_ACCESS_KEY_SECRET\s*[:=]\s*["'][^"']+["']/.test(html), false);
  assert.equal(html.includes("BAILIAN_APP_KEY"), false);
});

test("完整链路：上传本地图片 → 拿到 URL → 直接用于 /api/mission", async () => {
  const { startMockGateway, okSession, okRun } = await import("./mock-gateway.mjs");
  const gateway = await startMockGateway({
    handlers: { "/createSession": () => ({ body: okSession }), "/run": () => ({ body: okRun('{"assessment_summary":"上传图片研判完成","events":[]}') }) }
  });
  const stack = await startDemoServer({
    env: { STORAGE_DRIVER: "local", BAILIAN_API_BASE: gateway.base, DEMO_ALLOW_LOCAL_IMAGE_URLS: "1" }
  });
  try {
    const uploaded = await (await upload(jpeg, "image/jpeg", stack)).json();
    const response = await stack.postJson("/api/mission", { imageUrl: uploaded.url, taskText: "识别道路积水" });
    assert.equal(response.status, 200);
    assert.match((await response.json()).output, /上传图片研判完成/);

    // 平台侧真正收到的就是上传后得到的那个 URL。
    const runCall = gateway.calls.find(call => call.path === "/run");
    assert.equal(runCall.body.message.attachments[0].url, uploaded.url);
  } finally { await stack.stop(); await gateway.stop(); }
});

test("本地 driver 生成的本机地址在默认配置下会被 mission 拒绝", async () => {
  const stack = await startDemoServer({ env: { STORAGE_DRIVER: "local" } });
  try {
    const uploaded = await (await upload(jpeg, "image/jpeg", stack)).json();
    const response = await stack.postJson("/api/mission", { imageUrl: uploaded.url, taskText: "识别道路积水" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).stage, "image.rejected");
  } finally { await stack.stop(); }
});
