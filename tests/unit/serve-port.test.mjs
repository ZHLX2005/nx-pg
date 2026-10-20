// serve 的端口协商 + 开浏览器策略（core/serve-port.js）。
//
// 这里锁住的是**口径**本身，不是某一个项目的实现：
//   1. NX_SERVE_NO_OPEN 是所有 nx-xx 共享的开关，与 --no-open 是「或」关系；
//   2. 端口被占时先认领（/api/bootstrap 的 app.name），认领得到就复用，认领不到就顺延；
//   3. findFreePort 给出的端口必须真能监听。
//
// 第 2 条的 reuse 分支必须用**本项目真实的 APP_NAME** 起假面板，
// 否则测的其实是 shift 分支——这正是要防的坑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {
  NO_OPEN_ENV,
  isEnvTruthy,
  autoOpenEnabled,
  probePanel,
  findFreePort,
  resolvePortConflict,
  describeOccupant,
} from '../../src/core/serve-port.js';
import { APP_NAME } from '../../src/core/paths.js';

// 临时起一个假面板：/api/bootstrap 返回带 app.name 的信封（与真实面板同形）。
function startFakePanel(appName) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/bootstrap') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { app: { name: appName, version: '0.0.0' } } }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });
  return new Promise((resolve_) => {
    server.listen(0, '127.0.0.1', () => {
      resolve_({ server, port: server.address().port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve_) => server.close(() => resolve_()));
}

// 借一个操作系统刚放出来的端口（随后释放），用来当「从哪开始找空闲端口」的起点。
async function releasedPort() {
  const probe = net.createServer();
  await new Promise((resolve_) => probe.listen(0, '127.0.0.1', resolve_));
  const port = probe.address().port;
  await new Promise((resolve_) => probe.close(resolve_));
  return port;
}

test('isEnvTruthy：1 / true / yes / on 才算开，0 不算', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'Yes', 'on', 'ON', ' 1 ']) {
    assert.equal(isEnvTruthy(v), true, `${v} 应算真值`);
  }
  for (const v of ['0', 'false', 'no', 'off', '', ' ', undefined, null]) {
    assert.equal(isEnvTruthy(v), false, `${v} 不应算真值`);
  }
});

test('autoOpenEnabled：环境变量与 --no-open 任一为真即不打开', () => {
  const saved = process.env[NO_OPEN_ENV];
  try {
    delete process.env[NO_OPEN_ENV];
    assert.equal(autoOpenEnabled(undefined), true, '没设环境变量、没给 flag → 允许打开');
    assert.equal(autoOpenEnabled(false), true);

    for (const v of ['1', 'true', 'yes', 'on']) {
      process.env[NO_OPEN_ENV] = v;
      assert.equal(autoOpenEnabled(undefined), false, `NX_SERVE_NO_OPEN=${v} → 不打开`);
    }

    process.env[NO_OPEN_ENV] = '0';
    assert.equal(autoOpenEnabled(undefined), true, '0 不算真值 → 仍允许打开');

    delete process.env[NO_OPEN_ENV];
    assert.equal(autoOpenEnabled(true), false, '--no-open 单独也能关掉');
  } finally {
    if (saved === undefined) delete process.env[NO_OPEN_ENV];
    else process.env[NO_OPEN_ENV] = saved;
  }
});

test('probePanel：端口上不是面板时返回 null', async () => {
  const srv = net.createServer((sock) => sock.destroy());
  await new Promise((resolve_) => srv.listen(0, '127.0.0.1', resolve_));
  const port = srv.address().port;
  try {
    assert.equal(await probePanel(port, '127.0.0.1', 800), null);
  } finally {
    await closeServer(srv);
  }
});

test('probePanel：面板的 bootstrap 能被读到', async () => {
  const { server, port } = await startFakePanel(APP_NAME);
  try {
    const panel = await probePanel(port, '127.0.0.1', 800);
    assert.ok(panel, '应探到面板');
    assert.equal(panel.app.name, APP_NAME);
  } finally {
    await closeServer(server);
  }
});

test('findFreePort：返回的端口确实能监听', async () => {
  const start = await releasedPort();
  const port = await findFreePort(start, '127.0.0.1');
  assert.ok(port >= start, `期望不小于 ${start}，实际 ${port}`);

  const srv = net.createServer();
  await new Promise((resolve_, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', resolve_);
  });
  await closeServer(srv);
});

test('resolvePortConflict：端口上就是本项目的面板 → reuse', async () => {
  const { server, port } = await startFakePanel(APP_NAME);
  try {
    const decision = await resolvePortConflict(port, APP_NAME, '127.0.0.1');
    assert.equal(decision.action, 'reuse');
    assert.equal(decision.port, port, 'reuse 不换端口');
    assert.equal(decision.occupant, APP_NAME);
  } finally {
    await closeServer(server);
  }
});

test('resolvePortConflict：端口上是别的服务 → shift 到下一个空闲端口', async () => {
  const { server, port } = await startFakePanel('someone-else');
  try {
    const decision = await resolvePortConflict(port, APP_NAME, '127.0.0.1');
    assert.equal(decision.action, 'shift');
    assert.ok(decision.port > port, `shift 端口应大于原端口，实际 ${decision.port} <= ${port}`);
    assert.equal(decision.occupant, 'someone-else');
  } finally {
    await closeServer(server);
  }
});

test('describeOccupant：探测不到时叫「未知服务」', () => {
  assert.equal(describeOccupant(null), '未知服务');
  assert.equal(describeOccupant('other-app'), 'other-app');
});
