import test from 'node:test';
import assert from 'node:assert/strict';

test('CLI ↔ HTTP 对照表唯一性', async () => {
  const { ACTIONS } = await import('../../src/runtime/registry.js');
  const seen = new Set();
  for (const a of ACTIONS) {
    if (seen.has(a.id)) throw new Error('id 重复: ' + a.id);
    seen.add(a.id);
  }
});

test('api 调用 home.bootstrap', (_, done) => {
  import('../../src/runtime/server.js').then(async ({ startServer }) => {
    const server = await startServer({ port: 0, host: '127.0.0.1' });
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/bootstrap`);
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.app.name, 'nx-pg');
    } finally {
      server.close();
      done();
    }
  });
});
