// OpenTrek/百炼 智能体网关客户端。
//
// 存在的理由是可诊断性：原来所有失败都会塌缩成“未收到智能体结果”，
// 分不清究竟是 createSession 挂了、/run 被拒、还是工作流没有输出文本。
// 这里把每一类失败都打上 stage 标签，并区分“平台侧故障”和“本地要修的问题”。
//
// 安全约束：Authorization 头、APP_KEY 以及任何完整响应体都不会进入错误信息、
// 日志或返回给浏览器的 JSON。所有外部文本都要先经过 redactSecrets 并截断。

const MAX_SNIPPET = 400;

export const defaultTimeouts = { createSession: 20000, run: 300000, image: 8000 };

// 命中这些特征说明报错来自平台后端，不是本地代码或本地配置问题。
const databaseFaultPatterns = [
  /read[-\s]?only transaction/i,
  /只读事务/,
  /INSERT INTO\s+ibp_/i,
  /SQLSTATE/i,
  /SQLException/i,
  /JDBC/i,
  /Deadlock/i,
  /too many connections/i,
  /connection (?:pool|refused|reset)/i,
  /relation .+ does not exist/i,
  /duplicate key value/i
];

const gatewayFaultPatterns = [
  /bad gateway/i,
  /gateway time-?out/i,
  /upstream connect error/i,
  /service (?:temporarily )?unavailable/i,
  /<html[^>]*>.*nginx/is
];

export function redactSecrets(value, secrets = []) {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (typeof text !== "string") text = String(text);
  for (const secret of secrets) {
    const trimmed = String(secret || "").trim();
    if (trimmed.length >= 4) text = text.split(trimmed).join("***");
  }
  return text
    .replace(/Bearer\s+[\w\-.=+/]+/gi, "Bearer ***")
    .replace(/("?)(app[_-]?key|accessKeyId|accessKeySecret|access[_-]?token|token|password|secret|signature)("?\s*[:=]\s*"?)([^"',\s}&]+)/gi,
      (_all, q1, name, sep) => `${q1}${name}${sep}***`);
}

export function truncate(text, limit = MAX_SNIPPET) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, limit)}…（已截断）` : value;
}

export function classifyPlatformFault(text) {
  const value = String(text ?? "");
  if (databaseFaultPatterns.some(pattern => pattern.test(value))) {
    return {
      platformFault: true,
      faultKind: "database",
      hint: "该报错来自 OpenTrek 平台后端数据库（写入被拒绝或连接异常），属于平台侧故障：本地代码和 .env.local 都不需要改。请把 stage 和 requestId 反馈给平台维护方，或稍后重试。"
    };
  }
  if (gatewayFaultPatterns.some(pattern => pattern.test(value))) {
    return {
      platformFault: true,
      faultKind: "gateway",
      hint: "该报错来自 OpenTrek 平台网关/反向代理，通常是平台侧服务不可用或超时。请确认校园网可以访问平台地址，然后稍后重试。"
    };
  }
  return { platformFault: false, faultKind: null, hint: "" };
}

export class AgentGatewayError extends Error {
  constructor(stage, message, options = {}) {
    super(message);
    this.name = "AgentGatewayError";
    this.stage = stage;
    this.hint = options.hint || "";
    this.platformFault = Boolean(options.platformFault);
    this.faultKind = options.faultKind || null;
    this.responseStatus = options.responseStatus || 502;
    this.diagnostics = {
      platformHttpStatus: options.platformHttpStatus ?? null,
      platformCode: options.platformCode ?? null,
      requestId: options.requestId ?? null,
      ...(options.detail || {})
    };
  }

  // 返回给浏览器的结构：只有阶段、可读结论、排查提示和非敏感的结构化信息。
  toPayload() {
    return {
      error: this.message,
      stage: this.stage,
      hint: this.hint,
      platformFault: this.platformFault,
      externalBlocker: this.platformFault,
      diagnostics: this.diagnostics
    };
  }
}

// 平台可达性与图片可访问性是两件不同的事，图片问题单独成一类错误。
// allowLoopback 只给本地自动化测试和自建隧道用（DEMO_ALLOW_LOCAL_IMAGE_URLS）。
export function classifyImageUrl(rawUrl, { allowLoopback = false } = {}) {
  const value = String(rawUrl || "").trim();
  if (!value) return { level: "reject", reason: "没有提供图片链接。" };
  let url;
  try { url = new URL(value); } catch { return { level: "reject", reason: "图片链接不是合法 URL。" }; }
  if (!/^https?:$/.test(url.protocol)) return { level: "reject", reason: `图片链接协议 ${url.protocol} 不受支持，只能用 http/https。` };
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "[::1]" || host === "::1" || /^127\./.test(host)) {
    return allowLoopback
      ? { level: "warn", reason: `图片链接指向本机地址 ${host}：已按 DEMO_ALLOW_LOCAL_IMAGE_URLS 放行，只有平台能访问这台机器时才有意义。` }
      : { level: "reject", reason: "图片链接指向本机回环地址，平台在另一台机器上，永远读不到它。请改用对象存储或其他公网直链。" };
  }
  // 平台自身部署在校园内网，所以内网地址只告警不拦截。
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || host.endsWith(".local")) {
    return { level: "warn", reason: `图片链接指向内网地址 ${host}：只有平台同样在这个内网里才读得到。` };
  }
  return { level: "ok", reason: "" };
}

export async function probeImageUrl(rawUrl, { fetchImpl = fetch, timeoutMs = defaultTimeouts.image, allowLoopback = false } = {}) {
  const classified = classifyImageUrl(rawUrl, { allowLoopback });
  if (classified.level === "reject") return { reachable: false, blocked: true, ...classified };

  const attempt = async method => fetchImpl(rawUrl, {
    method,
    headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });

  let response;
  try {
    response = await attempt("HEAD");
    // 部分对象存储和 CDN 不支持 HEAD，用一个字节的 GET 复核。
    if (response.status === 405 || response.status === 403 || response.status === 501) response = await attempt("GET");
  } catch (error) {
    // 本机探测失败不代表平台读不到（可能只是本机出网受限），所以只记告警。
    return { reachable: null, blocked: false, level: classified.level, reason: `本机无法验证图片可访问性：${truncate(error.message, 120)}`, probeFailed: true };
  }

  return {
    reachable: response.ok,
    blocked: !response.ok,
    level: classified.level,
    reason: classified.reason,
    status: response.status,
    contentType: response.headers.get("content-type") || null,
    contentLength: Number(response.headers.get("content-length")) || null
  };
}

export function createAgentClient({ apiBase, appKey, fetchImpl = fetch, timeouts = {}, logger = console, allowLocalImageUrls = false } = {}) {
  const limits = { ...defaultTimeouts, ...timeouts };
  const secrets = [appKey].filter(Boolean);
  const clean = text => truncate(redactSecrets(text, secrets));

  async function postJson(path, payload, { stage, timeoutMs }) {
    if (!appKey) {
      throw new AgentGatewayError("config.missing_key", "【config.missing_key】本机未配置 BAILIAN_APP_KEY，无法调用智能体平台。", {
        hint: "请复制 .env.example 为 .env.local 并填写 BAILIAN_APP_KEY，然后重新运行 npm run demo。",
        responseStatus: 500
      });
    }

    let response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${appKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      throw new AgentGatewayError(`${stage}.${timedOut ? "timeout" : "network"}`,
        timedOut
          ? `【${stage}.timeout】请求平台 ${path} 超过 ${Math.round(timeoutMs / 1000)} 秒未返回。`
          : `【${stage}.network】无法连接平台 ${path}：${clean(error?.message || "网络错误")}`,
        {
          hint: timedOut
            ? "平台侧处理过慢或链路被中断。可稍后重试；如果长期如此，请向平台维护方反馈。"
            : "本机到平台的网络不通：请确认已连接校园网、平台地址可达（可用 BAILIAN_API_BASE 覆盖网关地址）。",
          responseStatus: 504
        });
    }

    const bodyText = await response.text().catch(() => "");
    if (!response.ok) {
      const fault = classifyPlatformFault(bodyText);
      throw new AgentGatewayError(`${stage}.http`, `【${stage}.http】平台 ${path} 返回 HTTP ${response.status}：${clean(bodyText) || "无响应体"}`, {
        hint: fault.hint || "平台网关返回了非 2xx 状态。请记录 stage 和状态码后向平台维护方反馈。",
        platformHttpStatus: response.status,
        ...fault
      });
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      const fault = classifyPlatformFault(bodyText);
      throw new AgentGatewayError(`${stage}.invalid_json`, `【${stage}.invalid_json】平台 ${path} 返回的不是合法 JSON：${clean(bodyText) || "空响应"}`, {
        hint: fault.hint || "响应可能来自反向代理或错误页，而不是智能体网关本身。",
        platformHttpStatus: response.status,
        ...fault
      });
    }

    return { body, httpStatus: response.status, requestId: body?.requestId || body?.data?.requestId || body?.traceId || null };
  }

  function rejected(stage, path, body, requestId, httpStatus) {
    const reason = body?.errorMsg || body?.message || body?.errorMessage || "";
    const fault = classifyPlatformFault(`${reason} ${body?.errorCode || ""}`);
    return new AgentGatewayError(`${stage}.rejected`, `【${stage}.rejected】平台返回 success=false：${clean(reason) || "平台未给出错误原因"}`, {
      hint: fault.hint || `平台明确拒绝了这次 ${path} 调用。请核对 agentCode/agentVersion 是否为已发布版本，以及当前 APP_KEY 是否有该智能体的调用权限。`,
      platformCode: body?.errorCode ?? body?.code ?? null,
      platformHttpStatus: httpStatus,
      requestId,
      ...fault
    });
  }

  return {
    async createSession({ agentCode, agentVersion, stage = "createSession" }) {
      const { body, requestId, httpStatus } = await postJson("/createSession", { agentCode, agentVersion }, { stage, timeoutMs: limits.createSession });
      if (body?.success !== true) throw rejected(stage, "/createSession", body, requestId, httpStatus);
      const sessionId = body?.data?.uniqueCode;
      if (!sessionId) {
        throw new AgentGatewayError(`${stage}.empty`, `【${stage}.empty】平台返回 success=true，但响应里没有 data.uniqueCode，拿不到会话号。`, {
          hint: "网关协议可能已变更，或该智能体版本未正确发布。请核对 agentCode/agentVersion。",
          requestId,
          platformHttpStatus: httpStatus,
          detail: { dataKeys: body?.data && typeof body.data === "object" ? Object.keys(body.data) : [] }
        });
      }
      return { sessionId, requestId };
    },

    async run({ sessionId, text, attachments = [], stage = "run" }) {
      const { body, requestId, httpStatus } = await postJson("/run",
        { sessionId, stream: false, delta: false, trace: false, message: { text, attachments } },
        { stage, timeoutMs: limits.run });
      if (body?.success !== true) throw rejected(stage, "/run", body, requestId, httpStatus);

      const content = body?.data?.message?.content;
      const contentTypes = Array.isArray(content) ? content.map(item => item?.type ?? null) : [];
      const output = Array.isArray(content) ? content.find(item => item?.type === "text")?.text?.value : undefined;
      if (!output || !String(output).trim()) {
        throw new AgentGatewayError(`${stage}.empty`, `【${stage}.empty】平台返回 success=true，但响应里没有文本输出（content 中没有 type=text 且非空的节点）。`, {
          hint: attachments.length
            ? "常见原因：① 工作流的视觉节点读不到图片（图片链接过期、需要签名或不是公网直链）；② 工作流最后没有文本输出节点；③ 工作流内部报错但网关仍返回 success=true。请先确认图片直链能在浏览器无登录打开。"
            : "常见原因：工作流最后没有文本输出节点，或工作流内部报错但网关仍返回 success=true。",
          requestId,
          platformHttpStatus: httpStatus,
          detail: { contentTypes, hasMessage: Boolean(body?.data?.message), attachmentCount: attachments.length }
        });
      }
      return { output, requestId };
    },

    // 图片不可访问是“未收到智能体结果”最常见的真实原因，所以在调用前先判定一次。
    async assertImageUsable(imageUrl, { probe = true } = {}) {
      const classified = classifyImageUrl(imageUrl, { allowLoopback: allowLocalImageUrls });
      if (classified.level === "reject") {
        throw new AgentGatewayError("image.rejected", `【image.rejected】图片链接无法用于平台调用：${classified.reason}`, {
          hint: "请上传图片到自有对象存储换取长期有效的公网直链，或填写其他公网可访问的 JPG/PNG 直链。",
          responseStatus: 400
        });
      }
      if (!probe) return { checked: false, level: classified.level, reason: classified.reason };

      const result = await probeImageUrl(imageUrl, { timeoutMs: limits.image, fetchImpl, allowLoopback: allowLocalImageUrls });
      if (result.reachable === false) {
        throw new AgentGatewayError("image.unreachable", `【image.unreachable】图片链接不可访问（HTTP ${result.status}），平台的视觉节点同样读不到它。`, {
          hint: "这个链接已失效或需要鉴权。临时图床直链通常在数小时到数天后过期，请改用自有对象存储的长期直链。",
          detail: { imageHttpStatus: result.status ?? null, imageContentType: result.contentType ?? null },
          responseStatus: 400
        });
      }
      if (result.probeFailed || result.level === "warn") logger.warn?.(`[图片检查] ${result.reason}`);
      return { checked: true, ...result };
    }
  };
}
