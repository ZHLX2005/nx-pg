// smoke：核心脚手架能用——server 启动 + 命令表 + api 通。
import { ACTIONS, MODULES } from '../src/runtime/registry.js';
import { startServer } from '../src/runtime/server.js';

const modIds = MODULES.map((m) => m.id);
if (!modIds.includes('home')) {
  throw new Error('home 模块缺失: ' + JSON.stringify(modIds));
}
const cliActions = ACTIONS.filter((a) => Array.isArray(a.cli)).map((a) => a.id);
if (!cliActions.includes('home.bootstrap')) {
  throw new Error('home.bootstrap action 缺失');
}

const server = await startServer({ port: 0, host: '127.0.0.1' });
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

// /api/health（结构：{ ok, data }）
const health = await (await fetch(`${base}/api/health`)).json();
if (!health?.ok || health?.data?.status !== 'ok') throw new Error('health 非 ok: ' + JSON.stringify(health));

// /api/bootstrap（结构：{ ok, data }）
const boot = await (await fetch(`${base}/api/bootstrap`)).json();
if (!boot?.data?.app?.name) throw new Error('bootstrap 缺少 app.name: ' + JSON.stringify(boot));

// 未知路由 → 404
const missing = await fetch(`${base}/api/does-not-exist`);
if (missing.status !== 404) throw new Error('未知路由应 404，得到 ' + missing.status);

// 未知静态路径 → 404
const static404 = await fetch(`${base}/no-such-asset.txt`);
if (static404.status !== 404) throw new Error('未知静态路径应 404');

server.close();
console.log('smoke OK · ' + modIds.length + ' modules · ' + ACTIONS.length + ' actions');
