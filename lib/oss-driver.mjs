// 阿里云 OSS 存储 driver。
//
// 只从环境变量读取凭据；AccessKey 不进入日志、错误信息、页面或返回给浏览器的 JSON。
// ali-oss 采用惰性加载：本地 driver 和自动化测试不需要它，忘记 npm install 时
// 也会得到一句人话，而不是启动时的模块解析错误。

let sdkPromise = null;

async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import("ali-oss").then(module => module.default).catch(() => {
      sdkPromise = null;
      const error = new Error("缺少 ali-oss 依赖，无法使用阿里云 OSS。");
      error.hint = "请在项目目录运行 npm install 后重试。";
      error.ossCode = "SDK_MISSING";
      throw error;
    });
  }
  return sdkPromise;
}

// ali-oss 要求 region 形如 oss-cn-hangzhou；只填 cn-hangzhou 会拼出错误的域名。
export function normalizeOssRegion(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("oss-") ? raw : `oss-${raw}`;
}

export function readOssConfig(env = process.env) {
  return {
    region: normalizeOssRegion(env.OSS_REGION),
    endpoint: String(env.OSS_ENDPOINT || "").trim().replace(/\/+$/, ""),
    bucket: String(env.OSS_BUCKET || "").trim(),
    prefix: String(env.OSS_PREFIX || "flood-demo").trim(),
    publicBaseUrl: String(env.OSS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, ""),
    cname: /^(1|true|yes|on)$/i.test(String(env.OSS_CNAME || "")),
    accessKeyId: String(env.OSS_ACCESS_KEY_ID || "").trim(),
    accessKeySecret: String(env.OSS_ACCESS_KEY_SECRET || "").trim()
  };
}

const encodeObjectKey = objectKey => String(objectKey).split("/").map(encodeURIComponent).join("/");

export function buildPublicObjectUrl(config, objectKey, client = null) {
  const key = encodeObjectKey(objectKey);
  if (config.publicBaseUrl) return `${config.publicBaseUrl}/${key}`;
  if (client?.generateObjectUrl) {
    // 自定义域名或 IP endpoint 时 ali-oss 会拒绝生成，落到下面自己拼。
    try { return client.generateObjectUrl(objectKey); } catch { /* 继续走兜底 */ }
  }
  if (config.endpoint) return `${config.endpoint}/${key}`;
  return `https://${config.bucket}.${config.region}.aliyuncs.com/${key}`;
}

// 把 OSS 的错误码翻译成能直接照着做的排查提示。
export function describeOssError(error) {
  const code = String(error?.ossCode || error?.code || error?.name || "").replace(/Error$/, "");
  const table = {
    SDK_MISSING: "请在项目目录运行 npm install 后重试。",
    InvalidAccessKeyId: "AccessKey ID 不存在或已禁用。请检查 .env.local 里的 OSS_ACCESS_KEY_ID（不要把密钥贴到别处）。",
    SignatureDoesNotMatch: "AccessKey Secret 不匹配。请重新确认 .env.local 里的 OSS_ACCESS_KEY_SECRET，注意不要带多余空格或引号。",
    AccessDenied: "凭据有效但没有权限。写入需要 PutObject；本 driver 还会设置对象为公共读，因此也需要 PutObjectAcl。如果 bucket 开了“阻止公共访问”，请改用自定义域名或关闭该限制。",
    NoSuchBucket: "找不到该 bucket。请确认 OSS_BUCKET 名称与 OSS_REGION 是否属于同一个地域。",
    RequestTimeTooSkewed: "本机时钟与服务器相差过大，签名被拒。请校准系统时间。",
    ConnectionTimeout: "连接 OSS 超时。请检查网络，以及 OSS_REGION / OSS_ENDPOINT 是否正确。",
    RequestTimeout: "请求 OSS 超时。请检查网络后重试。",
    ENOTFOUND: "无法解析 OSS 域名。请检查 OSS_REGION / OSS_ENDPOINT 拼写与网络 DNS。"
  };
  return {
    code: code || null,
    hint: table[code] || "请检查对象存储配置（Region、Bucket、AccessKey 权限）与网络连通性；后端终端有完整日志。"
  };
}

// 上抛前先脱敏并截断：OSS 的报错文本可能带上请求细节，绝不能把凭据带出去。
export function wrapOssError(error, config = {}) {
  const { code, hint } = describeOssError(error);
  let message = String(error?.message || error || "未知错误");
  for (const secret of [config.accessKeyId, config.accessKeySecret]) {
    const value = String(secret || "").trim();
    if (value.length >= 4) message = message.split(value).join("***");
  }
  message = message.replace(/\s+/g, " ").trim().slice(0, 300);
  const wrapped = new Error(code ? `OSS ${code}：${message}` : message);
  wrapped.hint = hint;
  wrapped.ossCode = code;
  return wrapped;
}

export function createOssDriver({ env = process.env, clientFactory = null } = {}) {
  const config = readOssConfig(env);
  let clientPromise = null;

  async function ensureClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const factory = clientFactory || (async options => new (await loadSdk())(options));
        const options = {
          accessKeyId: config.accessKeyId,
          accessKeySecret: config.accessKeySecret,
          bucket: config.bucket,
          secure: true,
          timeout: 60000
        };
        if (config.endpoint) {
          options.endpoint = config.endpoint;
          options.cname = config.cname;
        } else {
          options.region = config.region;
        }
        return factory(options);
      })().catch(error => { clientPromise = null; throw error; });
    }
    return clientPromise;
  }

  return {
    name: "aliyun-oss",
    publicUrls: true,
    prefix: config.prefix,
    region: config.region,
    bucket: config.bucket,

    async put({ buffer, contentType, objectKey }) {
      const client = await ensureClient();
      try {
        // 对象需要能被平台匿名读取，所以写入时就标成公共读。
        await client.put(objectKey, buffer, {
          headers: {
            "Content-Type": contentType,
            "x-oss-object-acl": "public-read",
            "Cache-Control": "public, max-age=31536000"
          }
        });
      } catch (error) {
        throw wrapOssError(error, config);
      }
      return { url: buildPublicObjectUrl(config, objectKey, client), objectKey };
    }
  };
}
