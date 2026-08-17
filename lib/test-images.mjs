// 演示素材清单读取器。
// assets/test-images/test-image-catalog.json 是素材与公网直链的唯一来源；
// 网页选择器、/api/test-images 与本地预览都从这里派生，避免多处重复维护同一份映射。
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export { catalogPath, repoRoot, testImageDir } from "./paths.mjs";
import { catalogPath, testImageDir } from "./paths.mjs";

export const imageContentTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

// 临时图床的直链只能存活数小时到数天，过期后平台读图会静默失败。
// 清单里一旦出现这些域名就在启动日志里报警，避免又一次把 demo 建在会过期的链接上。
export const ephemeralImageHosts = [
  "uguu.se", "catbox.moe", "litterbox.catbox.moe", "0x0.st",
  "file.io", "tmpfiles.org", "pomf.cat", "transfer.sh", "gofile.io"
];

function isEphemeralHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ephemeralImageHosts.some(bad => host === bad || host.endsWith(`.${bad}`));
  } catch { return false; }
}

function normalizePublicUrl(url, warnings, label) {
  const value = String(url || "").trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    warnings.push(`${label} 的 publicUrl 不是 http(s) 直链，已忽略。`);
    return null;
  }
  if (isEphemeralHost(value)) {
    warnings.push(`${label} 的 publicUrl 指向临时图床（${new URL(value).hostname}），这类链接会过期，已忽略。请改用自有对象存储。`);
    return null;
  }
  return value;
}

export function loadTestImageCatalog({ env = process.env } = {}) {
  const warnings = [];
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch (error) {
    warnings.push(`无法读取素材清单 ${catalogPath}：${error.message}`);
  }

  const images = (Array.isArray(raw.images) ? raw.images : []).flatMap(item => {
    const file = String(item?.file || "").trim();
    if (!file || file !== file.replace(/[\\/]/g, "")) {
      warnings.push(`素材清单包含非法文件名，已跳过：${JSON.stringify(item?.file ?? null)}`);
      return [];
    }
    const path = join(testImageDir, file);
    const contentType = imageContentTypes[extname(file).toLowerCase()];
    if (!contentType) {
      warnings.push(`素材 ${file} 的扩展名不受支持（仅 jpg/jpeg/png），已跳过。`);
      return [];
    }
    const exists = existsSync(path);
    if (!exists) warnings.push(`素材文件缺失：${path}`);
    return [{
      file,
      label: String(item?.label || file),
      scenario: String(item?.scenario || ""),
      publicUrl: normalizePublicUrl(item?.publicUrl, warnings, `素材 ${file}`),
      path,
      contentType,
      exists,
      bytes: exists ? statSync(path).size : 0
    }];
  });

  const source = raw.defaultSource || {};
  const overrideUrl = String(env.DEMO_DEFAULT_IMAGE_URL || "").trim();
  const defaultSource = {
    id: String(source.id || "default-source"),
    label: String(source.label || "默认演示图片"),
    publicUrl: overrideUrl
      ? normalizePublicUrl(overrideUrl, warnings, "环境变量 DEMO_DEFAULT_IMAGE_URL")
      : normalizePublicUrl(source.publicUrl, warnings, "默认素材"),
    publicUrlNote: String(source.publicUrlNote || ""),
    overridden: Boolean(overrideUrl)
  };

  return { defaultSource, images, warnings };
}

// 只允许访问清单里登记的素材，防止通过路径穿越读取仓库其他文件。
export function resolveCatalogImage(catalog, name) {
  const wanted = String(name || "").trim();
  return catalog.images.find(image => image.file === wanted && image.exists) || null;
}
