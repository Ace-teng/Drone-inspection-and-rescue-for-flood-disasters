// 上传图片的存储抽象。
//
// 目标：浏览器选图 → 后端校验 → 存到稳定的对象存储 → 得到平台能访问的 URL。
// 这里只定义校验规则和 driver 契约，具体存储实现由 driver 提供：
//   local       本地磁盘 data/uploads/，仅供开发与自动化测试（URL 是本机地址，平台读不到）
//   aliyun-oss  阿里云 OSS，需要真实 Bucket/Region 与后端环境变量后接入
//
// 安全约束：AccessKey 只从环境变量读取，绝不进入页面、日志、错误信息或仓库。
// describeStorage() 只输出缺失的变量“名字”，不输出任何取值。
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataDir } from "./paths.mjs";
import { createOssDriver } from "./oss-driver.mjs";

export const allowedUploadTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"]
]);

export const defaultMaxUploadBytes = 8 * 1024 * 1024;

export const ossRequiredEnv = ["OSS_REGION", "OSS_BUCKET", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"];

// 显式给了 OSS_ENDPOINT（自定义域名或本地联调地址）时不再要求 OSS_REGION。
function missingOssEnv(env) {
  return ossRequiredEnv.filter(name => {
    if (name === "OSS_REGION" && String(env.OSS_ENDPOINT || "").trim()) return false;
    return !String(env[name] || "").trim();
  });
}

export const localUploadDir = (env = process.env) => join(dataDir(env), "uploads");

export class UploadError extends Error {
  constructor(stage, message, options = {}) {
    super(message);
    this.name = "UploadError";
    this.stage = stage;
    this.hint = options.hint || "";
    this.responseStatus = options.responseStatus || 400;
    this.diagnostics = options.diagnostics || {};
  }

  toPayload() {
    return {
      error: this.message,
      stage: this.stage,
      hint: this.hint,
      platformFault: false,
      externalBlocker: false,
      diagnostics: this.diagnostics
    };
  }
}

export function maxUploadBytes(env = process.env) {
  const raw = Number(env.UPLOAD_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : defaultMaxUploadBytes;
}

// 只信内容，不信扩展名或客户端声明的类型。
export function sniffImageType(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => buffer[index] === byte)) return "image/png";
  return null;
}

export function normalizeContentType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

// 用 UUID + 日期分层，避免同名文件互相覆盖，也方便按天清理。
export function buildObjectKey({ prefix = "", extension, id = randomUUID(), now = new Date() } = {}) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const cleanPrefix = String(prefix || "").replace(/^\/+/, "").replace(/\/*$/, prefix ? "/" : "");
  return `${cleanPrefix}${year}/${month}/${day}/${id}.${extension}`;
}

export const uploadedKeyPattern = /^(?:[A-Za-z0-9._-]+\/)*\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png)$/;

// 校验一份上传内容。返回可用于生成对象名的结果，或抛出带 stage 的 UploadError。
export function validateUpload({ buffer, declaredType, limitBytes }) {
  const contentType = normalizeContentType(declaredType);
  if (!allowedUploadTypes.has(contentType)) {
    throw new UploadError("upload.unsupported_type", `【upload.unsupported_type】只支持 JPG 和 PNG，收到的是 ${contentType || "未声明的类型"}。`, {
      hint: `请选择 .jpg / .jpeg / .png 图片。允许的 Content-Type：${[...allowedUploadTypes.keys()].join("、")}。`,
      responseStatus: 415,
      diagnostics: { declaredContentType: contentType || null }
    });
  }
  if (!buffer || buffer.length === 0) {
    throw new UploadError("upload.empty", "【upload.empty】上传内容为空。", { hint: "请重新选择图片文件后再上传。" });
  }
  if (buffer.length > limitBytes) {
    throw new UploadError("upload.too_large", `【upload.too_large】图片 ${(buffer.length / 1024 / 1024).toFixed(2)} MB 超过上限 ${(limitBytes / 1024 / 1024).toFixed(2)} MB。`, {
      hint: "请压缩图片后重试，或调整环境变量 UPLOAD_MAX_BYTES。",
      responseStatus: 413,
      diagnostics: { bytes: buffer.length, limitBytes }
    });
  }
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    throw new UploadError("upload.not_an_image", "【upload.not_an_image】文件内容不是 JPG 或 PNG（文件头校验失败）。", {
      hint: "请确认选择的是真实图片文件，而不是改了扩展名的其他文件。",
      diagnostics: { declaredContentType: contentType }
    });
  }
  if (sniffed !== contentType) {
    throw new UploadError("upload.type_mismatch", `【upload.type_mismatch】声明的类型是 ${contentType}，但文件内容是 ${sniffed}。`, {
      hint: "请不要手工改扩展名；重新导出为对应格式后再上传。",
      diagnostics: { declaredContentType: contentType, detectedContentType: sniffed }
    });
  }
  return { contentType: sniffed, extension: allowedUploadTypes.get(sniffed), bytes: buffer.length };
}

// 供网页与测试判断存储是否就绪；只返回变量名，不返回任何取值。
export function describeStorage(env = process.env) {
  const requested = String(env.STORAGE_DRIVER || "").trim().toLowerCase();
  const ossPresent = ossRequiredEnv.filter(name => String(env[name] || "").trim());
  const driver = requested || (ossPresent.length ? "aliyun-oss" : "");
  const maxBytes = maxUploadBytes(env);
  const allowedTypes = [...allowedUploadTypes.keys()];

  if (driver === "local") {
    return { driver, configured: true, missingEnv: [], maxBytes, allowedTypes, publicUrls: false,
      note: "本地磁盘存储：仅供开发与自动化测试，生成的是本机地址，平台读不到。" };
  }
  if (driver === "aliyun-oss") {
    const missingEnv = missingOssEnv(env);
    return { driver, configured: missingEnv.length === 0, missingEnv, maxBytes, allowedTypes, publicUrls: true,
      note: missingEnv.length
        ? "阿里云 OSS 配置不完整。"
        : "阿里云 OSS：上传对象会被标记为公共读，以便平台匿名取图。" };
  }
  return { driver: "", configured: false, missingEnv: missingOssEnv(env), maxBytes, allowedTypes, publicUrls: true,
    note: "未配置对象存储。请在 .env.local 配置 OSS_* 变量，或设置 STORAGE_DRIVER=local 仅做本地联调。" };
}

function localDriver({ baseUrl, prefix, env }) {
  const root = localUploadDir(env);
  return {
    name: "local",
    publicUrls: false,
    root,
    async put({ buffer, objectKey }) {
      const target = join(root, objectKey);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, buffer);
      return { url: `${String(baseUrl).replace(/\/+$/, "")}/uploaded-image/${objectKey}`, objectKey };
    },
    prefix
  };
}

// driver 注册表：上传接口、校验和网页都不关心用的是哪个 driver。
const drivers = { local: localDriver, "aliyun-oss": ({ env }) => createOssDriver({ env }) };

export function createStorageDriver({ env = process.env, baseUrl = "" } = {}) {
  const summary = describeStorage(env);
  const factory = summary.configured ? drivers[summary.driver] : null;
  if (!factory) {
    return {
      name: summary.driver || "none",
      publicUrls: summary.publicUrls,
      unavailable: summary,
      async put() {
        throw new UploadError("upload.storage_unconfigured", `【upload.storage_unconfigured】对象存储不可用：${summary.note}`, {
          hint: summary.missingEnv.length
            ? `缺少环境变量：${summary.missingEnv.join("、")}。请只在后端 .env.local 里配置，不要写进页面或提交到 Git。`
            : "请检查 STORAGE_DRIVER 配置。",
          responseStatus: 503,
          diagnostics: { driver: summary.driver || null, missingEnv: summary.missingEnv }
        });
      }
    };
  }
  return factory({ baseUrl, env, prefix: String(env.OSS_PREFIX || "flood-demo").trim() });
}
