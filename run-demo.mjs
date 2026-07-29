import { existsSync, readFileSync } from 'node:fs';

const envFile = '.env.local';
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
