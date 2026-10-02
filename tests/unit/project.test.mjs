// 覆盖 project 模块的核心路径：workspace / fs / recent。
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';

process.env.NX_PG_STORE_DIR = resolve(process.cwd(), '.tmp-store');

test('fs.write → fs.read 字节完整往返', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: project } = await import('../../src/modules/project/index.js');
  const find = (id) => project.actions.find((a) => a.id === id);

  const path = 'unit.prg';
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0xaa]);

  try {
    await find('project.fs.mkdir').run({ path: 'sub' }, { transport: 'http' });
    const writeRes = await find('project.fs.write').run(
      { path: 'sub/' + path, b64: Buffer.from(payload).toString('base64') },
      { transport: 'http' },
    );
    assert.equal(writeRes.size, payload.length);

    const readRes = await find('project.fs.read').run({ path: 'sub/' + path }, { transport: 'http' });
    const got = new Uint8Array(Buffer.from(readRes.dataB64, 'base64'));
    assert.deepEqual([...got], [...payload]);

    const exists = await find('project.fs.exists').run({ path: 'sub/' + path }, { transport: 'http' });
    assert.equal(exists.exists, true);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('recent add → list → remove', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-2');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: project } = await import('../../src/modules/project/index.js');
  const find = (id) => project.actions.find((a) => a.id === id);
  try {
    await find('project.fs.write').run(
      { path: 'a.prg', b64: Buffer.from('hello').toString('base64') },
      { transport: 'http' },
    );
    await find('project.recent.add').run({ path: 'a.prg' }, { transport: 'http' });
    const list = await find('project.recent.list').run({}, { transport: 'http' });
    assert.equal(list.files.length, 1);
    assert.match(list.files[0].path, /a\.prg$/);
    await find('project.recent.remove').run({ path: 'a.prg' }, { transport: 'http' });
    const list2 = await find('project.recent.list').run({}, { transport: 'http' });
    assert.equal(list2.files.length, 0);
  } finally {
    rmSync(ws, { recursive: true, force: true });
    delete process.env.NX_PG_WORKSPACE;
  }
});

test('路径越界被拒', async () => {
  const ws = resolve(process.cwd(), '.tmp-workspace-3');
  process.env.NX_PG_WORKSPACE = ws;
  const { default: project } = await import('../../src/modules/project/index.js');
  const find = (id) => project.actions.find((a) => a.id === id);
  await assert.rejects(
    () => find('project.fs.read').run({ path: '../../../etc/passwd' }, { transport: 'http' }),
    /路径越界/,
  );
  delete process.env.NX_PG_WORKSPACE;
  rmSync(ws, { recursive: true, force: true });
});
