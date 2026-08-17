// 防文档腐烂：文档里提到的 stage、环境变量和文件必须真的存在。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.mjs";

const sourceFiles = [
  "real-demo-server.mjs",
  "lib/agent-gateway.mjs",
  "lib/object-storage.mjs",
  "lib/oss-driver.mjs",
  "lib/paths.mjs",
  "lib/test-images.mjs"
];
const docFiles = ["README.md", ".env.example", "docs/队员协作与验收说明.md", "docs/上传与对象存储配置.md"];

const source = sourceFiles.map(file => readFileSync(join(repoRoot, file), "utf8")).join("\n");
const docs = docFiles.map(file => readFileSync(join(repoRoot, file), "utf8")).join("\n");

test("文档提到的文件都存在", () => {
  for (const file of [...sourceFiles, ...docFiles]) assert.ok(existsSync(join(repoRoot, file)), `${file} 不存在`);
  for (const match of docs.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (target.startsWith("http")) continue;
    assert.ok(existsSync(join(repoRoot, target)), `文档链接指向不存在的文件：${target}`);
  }
  for (const match of docs.matchAll(/`((?:assets|lib|tests|docs|data)\/[^`]+?)`/g)) {
    const target = match[1].replace(/\/$/, "");
    if (target.startsWith("data/")) continue; // 运行期目录，可能还没生成
    assert.ok(existsSync(join(repoRoot, target)), `文档提到不存在的路径：${match[1]}`);
  }
});

test("文档提到的环境变量都被代码读取", () => {
  const names = new Set([...docs.matchAll(/\b(BAILIAN_[A-Z_]+|DEMO_[A-Z_]+|OSS_[A-Z_]+|UPLOAD_[A-Z_]+|STORAGE_DRIVER)\b/g)].map(match => match[1]));
  for (const name of names) assert.ok(source.includes(name), `文档写了 ${name}，但代码里没有读取它`);
});

test("文档提到的 stage 都能在代码里找到", () => {
  const stages = new Set([...docs.matchAll(/`((?:config|input|image|upload|createSession|run|review|workOrder)\.[a-zA-Z_.*]+)`/g)].map(match => match[1]));
  assert.ok(stages.size >= 10, `文档里的 stage 太少了：${stages.size}`);
  for (const stage of stages) {
    if (stage.endsWith("*")) {
      assert.ok(source.includes(`${stage.replace(/\.\*$/, "")}.`), `代码里找不到 ${stage} 这一类 stage`);
      continue;
    }
    const leaf = stage.split(".").pop();
    const found = source.includes(`"${stage}"`) || source.includes(`\${stage}.${leaf}`) || source.includes(`.${leaf}\``);
    assert.ok(found, `文档写了 stage ${stage}，但代码里没有产生它`);
  }
});

test("代码里出现的密钥类变量名不会被写进文档的取值示例", () => {
  // .env.example 只允许有变量名，不允许出现看起来像真实密钥的取值。
  const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
  for (const line of example.split(/\r?\n/)) {
    const match = line.match(/^\s*#?\s*(BAILIAN_APP_KEY|OSS_ACCESS_KEY_ID|OSS_ACCESS_KEY_SECRET)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim();
    assert.ok(value === "" || /[<>]|粘贴|你的|例如/.test(value), `.env.example 里 ${match[1]} 出现了疑似真实取值：${value}`);
  }
});
