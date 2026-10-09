import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { repoRoot } from './lib/paths.mjs';

console.log(`项目目录：${repoRoot}`);
try {
  const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const branch = git('branch', '--show-current') || 'detached HEAD';
  console.log(`代码版本：${branch} @ ${git('rev-parse', '--short', 'HEAD')}`);
  if (branch !== 'main') console.warn('当前不是 main 分支；若界面与队员不同，请检查分支是否包含最新前端提交。');
} catch { /* 下载的 ZIP 没有 Git 元数据，仍可正常启动。 */ }

const envFile = join(repoRoot, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const item = line.trim();
    if (!item || item.startsWith('#')) continue;
    const index = item.indexOf('=');
    if (index < 1) continue;
    const name = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[name]) process.env[name] = value;
  }
}

if (!process.env.BAILIAN_APP_KEY || process.env.BAILIAN_APP_KEY.includes('在这里粘贴')) {
  console.error('\n未找到百炼密钥。请复制 .env.example 为 .env.local，并填写 BAILIAN_APP_KEY 后重试。\n');
  process.exit(1);
}

await import('./real-demo-server.mjs');
