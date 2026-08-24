// 阿里云 OSS driver 测试。
// 全部离线：一部分注入假客户端，一部分让真实 ali-oss 客户端打到本地假 OSS 端点。
// 能验证的是「我们传给 SDK 的东西对不对、返回的 URL 对不对、错误怎么翻译」；
// 至于阿里云是否接受签名，只能用真实 Bucket 验收。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublicObjectUrl,
  createOssDriver,
  describeOssError,
  normalizeOssRegion,
  readOssConfig,
  wrapOssError
} from "../lib/oss-driver.mjs";
import { createStorageDriver, describeStorage } from "../lib/object-storage.mjs";
import { repoRoot } from "./helpers.mjs";

const jpeg = readFileSync(join(repoRoot, "assets", "test-images", "04_blurred_reflight_check.jpg"));
const accessKeyId = "TESTKEYID000000000000";
const accessKeySecret = "test-secret-must-never-leak";

const ossEnv = (extra = {}) => ({
  STORAGE_DRIVER: "aliyun-oss",
  OSS_REGION: "cn-hangzhou",
  OSS_BUCKET: "flood-demo-bucket",
  OSS_ACCESS_KEY_ID: accessKeyId,
  OSS_ACCESS_KEY_SECRET: accessKeySecret,
  ...extra
});

test("region 会补上 oss- 前缀，避免拼出错误域名", () => {
  assert.equal(normalizeOssRegion("cn-hangzhou"), "oss-cn-hangzhou");
  assert.equal(normalizeOssRegion("oss-cn-hangzhou"), "oss-cn-hangzhou");
  assert.equal(normalizeOssRegion("  CN-Shenzhen "), "oss-cn-shenzhen");
  assert.equal(normalizeOssRegion(""), "");
});

test("配置读取带默认前缀，并识别 endpoint / cname", () => {
  const config = readOssConfig(ossEnv());
  assert.equal(config.region, "oss-cn-hangzhou");
  assert.equal(config.prefix, "flood-demo");
  assert.equal(config.cname, false);
  const custom = readOssConfig(ossEnv({ OSS_PREFIX: "rescue", OSS_ENDPOINT: "https://cdn.example.com/", OSS_CNAME: "1" }));
  assert.equal(custom.prefix, "rescue");
  assert.equal(custom.endpoint, "https://cdn.example.com");
  assert.equal(custom.cname, true);
});

test("公网 URL 的三种来源：自定义域名、SDK、兜底拼接", () => {
  const config = readOssConfig(ossEnv());
  assert.equal(
    buildPublicObjectUrl(config, "flood-demo/2026/08/17/a-b.jpg"),
    "https://flood-demo-bucket.oss-cn-hangzhou.aliyuncs.com/flood-demo/2026/08/17/a-b.jpg"
  );
  const cdn = readOssConfig(ossEnv({ OSS_PUBLIC_BASE_URL: "https://img.example.com/" }));
  assert.equal(buildPublicObjectUrl(cdn, "a/b.jpg"), "https://img.example.com/a/b.jpg");
  // SDK 能生成时优先用 SDK；抛错时回落到兜底拼接。
  assert.equal(buildPublicObjectUrl(config, "a/b.jpg", { generateObjectUrl: () => "https://sdk.example.com/a/b.jpg" }), "https://sdk.example.com/a/b.jpg");
  assert.match(buildPublicObjectUrl(config, "a/b.jpg", { generateObjectUrl: () => { throw new Error("endpoint is IP"); } }), /^https:\/\/flood-demo-bucket\./);
});

test("上传时给 SDK 的参数：公共读 ACL、Content-Type、对象名", async () => {
  const calls = [];
  let clientOptions = null;
  const driver = createOssDriver({
    env: ossEnv(),
    clientFactory: async options => {
      clientOptions = options;
      return { put: async (...args) => { calls.push(args); return { name: args[0] }; } };
    }
  });

  const result = await driver.put({ buffer: jpeg, contentType: "image/jpeg", objectKey: "flood-demo/2026/08/17/key.jpg" });

  assert.equal(clientOptions.bucket, "flood-demo-bucket");
  assert.equal(clientOptions.region, "oss-cn-hangzhou");
  assert.equal(clientOptions.secure, true);
  assert.equal(clientOptions.accessKeyId, accessKeyId);

  const [objectKey, body, options] = calls[0];
  assert.equal(objectKey, "flood-demo/2026/08/17/key.jpg");
  assert.equal(Buffer.compare(body, jpeg), 0);
  assert.equal(options.headers["x-oss-object-acl"], "public-read", "对象必须公共读，否则平台匿名取不到图");
  assert.equal(options.headers["Content-Type"], "image/jpeg");
  assert.equal(result.url, "https://flood-demo-bucket.oss-cn-hangzhou.aliyuncs.com/flood-demo/2026/08/17/key.jpg");
  assert.equal(driver.publicUrls, true);
});

test("客户端只创建一次，多次上传复用", async () => {
  let created = 0;
  const driver = createOssDriver({
    env: ossEnv(),
    clientFactory: async () => { created += 1; return { put: async () => ({}) }; }
  });
  await driver.put({ buffer: jpeg, contentType: "image/jpeg", objectKey: "a/b.jpg" });
  await driver.put({ buffer: jpeg, contentType: "image/jpeg", objectKey: "a/c.jpg" });
  assert.equal(created, 1);
});

test("OSS 错误码被翻译成可操作的提示", () => {
  const cases = [
    ["InvalidAccessKeyId", /OSS_ACCESS_KEY_ID/],
    ["SignatureDoesNotMatch", /OSS_ACCESS_KEY_SECRET/],
    ["AccessDenied", /PutObjectAcl/],
    ["NoSuchBucket", /同一个地域/],
    ["RequestTimeTooSkewed", /时钟/],
    ["ConnectionTimeout", /OSS_REGION/],
    ["SDK_MISSING", /npm install/]
  ];
  for (const [code, pattern] of cases) {
    assert.match(describeOssError({ code }).hint, pattern, `${code} 的提示不对`);
    assert.match(describeOssError({ name: `${code}Error` }).hint, pattern, `${code}Error 的提示不对`);
  }
  assert.match(describeOssError({ code: "SomethingNew" }).hint, /请检查对象存储配置/);
});

test("上传失败时凭据不会出现在错误信息里", async () => {
  const driver = createOssDriver({
    env: ossEnv(),
    clientFactory: async () => ({
      put: async () => {
        const error = new Error(`AccessDenied: key ${accessKeyId} secret ${accessKeySecret} rejected`);
        error.code = "AccessDenied";
        throw error;
      }
    })
  });
  await assert.rejects(
    driver.put({ buffer: jpeg, contentType: "image/jpeg", objectKey: "a/b.jpg" }),
    error => {
      assert.equal(error.ossCode, "AccessDenied");
      assert.match(error.hint, /PutObjectAcl/);
      assert.equal(error.message.includes(accessKeyId), false, "错误信息泄漏了 AccessKey ID");
      assert.equal(error.message.includes(accessKeySecret), false, "错误信息泄漏了 AccessKey Secret");
      assert.match(error.message, /\*\*\*/);
      return true;
    }
  );
});

test("wrapOssError 对超长报错做截断", () => {
  const wrapped = wrapOssError({ code: "AccessDenied", message: "x".repeat(2000) }, {});
  assert.ok(wrapped.message.length < 340, `没有截断：${wrapped.message.length}`);
});

test("配置齐全时 describeStorage 认为可用，缺一项就不可用", () => {
  const ready = describeStorage(ossEnv());
  assert.equal(ready.driver, "aliyun-oss");
  assert.equal(ready.configured, true);
  assert.deepEqual(ready.missingEnv, []);
  assert.equal(JSON.stringify(ready).includes(accessKeySecret), false);

  const broken = describeStorage(ossEnv({ OSS_BUCKET: "" }));
  assert.equal(broken.configured, false);
  assert.deepEqual(broken.missingEnv, ["OSS_BUCKET"]);

  // 给了 endpoint 就不再强制要求 region。
  const viaEndpoint = describeStorage(ossEnv({ OSS_REGION: "", OSS_ENDPOINT: "https://oss.example.com" }));
  assert.equal(viaEndpoint.configured, true);
});

test("配置齐全时 createStorageDriver 装配出 aliyun-oss driver", () => {
  const driver = createStorageDriver({ env: ossEnv(), baseUrl: "http://127.0.0.1:1" });
  assert.equal(driver.name, "aliyun-oss");
  assert.equal(driver.publicUrls, true);
  assert.equal(driver.prefix, "flood-demo");
  assert.equal(typeof driver.put, "function");
});

test("真实 ali-oss 客户端打到本地假 OSS 端点：请求方法、路径与 ACL 头都正确", async () => {
  const received = [];
  const oss = createServer((req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length });
      res.writeHead(200, { ETag: '"fake-etag"', "x-oss-request-id": "mock-request-id" });
      res.end();
    });
  });
  await new Promise(done => oss.listen(0, "127.0.0.1", done));
  const endpoint = `http://127.0.0.1:${oss.address().port}`;

  try {
    const driver = createOssDriver({ env: ossEnv({ OSS_ENDPOINT: endpoint, OSS_CNAME: "1", OSS_PUBLIC_BASE_URL: endpoint }) });
    const result = await driver.put({ buffer: jpeg, contentType: "image/jpeg", objectKey: "flood-demo/2026/08/17/real-sdk.jpg" });

    assert.equal(received.length, 1, "真实 SDK 没有发出请求");
    const call = received[0];
    assert.equal(call.method, "PUT");
    assert.equal(call.url, "/flood-demo/2026/08/17/real-sdk.jpg");
    assert.equal(call.bytes, jpeg.length);
    assert.equal(call.headers["x-oss-object-acl"], "public-read");
    assert.equal(call.headers["content-type"], "image/jpeg");
    assert.match(call.headers.authorization, /^OSS4?-?/, `签名头格式异常：${call.headers.authorization}`);
    assert.equal(call.headers.authorization.includes(accessKeySecret), false, "Authorization 里出现了 AccessKey Secret");
    assert.equal(result.url, `${endpoint}/flood-demo/2026/08/17/real-sdk.jpg`);
  } finally {
    await new Promise(done => oss.close(done));
  }
});

test("假 OSS 端点返回 403 时，错误被翻译成 AccessDenied 提示", async () => {
  const oss = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(403, { "Content-Type": "application/xml" });
      res.end('<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>You have no right to access this object because of bucket acl.</Message><RequestId>mock</RequestId></Error>');
    });
  });
  await new Promise(done => oss.listen(0, "127.0.0.1", done));
  const endpoint = `http://127.0.0.1:${oss.address().port}`;

  try {
    const driver = createOssDriver({ env: ossEnv({ OSS_ENDPOINT: endpoint, OSS_CNAME: "1" }) });
    await assert.rejects(
      driver.put({ buffer: jpeg, contentType: "image/jpeg", objectKey: "a/b.jpg" }),
      error => {
        assert.equal(error.ossCode, "AccessDenied");
        assert.match(error.hint, /PutObjectAcl|阻止公共访问/);
        assert.equal(error.message.includes(accessKeySecret), false);
        return true;
      }
    );
  } finally {
    await new Promise(done => oss.close(done));
  }
});
