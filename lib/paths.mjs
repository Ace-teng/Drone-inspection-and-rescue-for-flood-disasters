// 仓库内的路径解析。全部基于模块位置，不依赖启动时的工作目录，
// 这样从任何目录双击启动器或运行 npm run demo 结果都一致。
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const testImageDir = join(repoRoot, "assets", "test-images");
export const catalogPath = join(testImageDir, "test-image-catalog.json");

// 运行期目录（审批记录、本地上传）。默认 <仓库>/data，已在 .gitignore；
// 自动化测试用 DEMO_DATA_DIR 指到临时目录，免得把测试数据写进真实审计记录。
export function dataDir(env = process.env) {
  const custom = String(env.DEMO_DATA_DIR || "").trim();
  if (!custom) return join(repoRoot, "data");
  return isAbsolute(custom) ? custom : resolve(repoRoot, custom);
}
