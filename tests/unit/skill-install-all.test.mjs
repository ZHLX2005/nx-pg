// skill install --all：一次装齐 assets/ 下全部 skill。
// 铁律与单个安装一致——先全员预检，任一冲突就整批不落盘。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installAllBundledSkills,
  bundledSkillNames,
  DEFAULT_SKILLS_DIR,
} from '../../src/runtime/skill.js';
import homeModule from '../../src/modules/home/index.js';

const action = homeModule.actions.find((a) => a.id === 'home.skillInstall');
const temp = () => mkdtemp(join(tmpdir(), 'nxpg-skillall-'));

test('installAllBundledSkills：装齐 assets 下所有带 SKILL.md 的 skill', async () => {
  const dir = await temp();
  try {
    const names = (await bundledSkillNames()).sort();
    assert.ok(names.length >= 1, 'assets/ 下应至少有 nx-pg 自己');
    const r = await installAllBundledSkills({ to: dir });
    assert.equal(r.status, 'ok');
    assert.equal(r.all, true);
    assert.deepEqual(r.skills.map((s) => s.name), names);
    assert.deepEqual((await readdir(dir)).sort(), names);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('installAllBundledSkills：幂等，第二次全部 skipped', async () => {
  const dir = await temp();
  try {
    await installAllBundledSkills({ to: dir });
    const again = await installAllBundledSkills({ to: dir });
    assert.equal(again.status, 'ok');
    assert.ok(again.skills.every((s) => s.skipped), '第二次应全部 skipped');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('installAllBundledSkills：有差异 → 整批 conflict，加 --force 才覆盖', async () => {
  const dir = await temp();
  try {
    const names = (await bundledSkillNames()).sort();
    await installAllBundledSkills({ to: dir });

    const victim = join(dir, names[0], 'SKILL.md');
    const original = await readFile(victim, 'utf8');
    await writeFile(victim, original + '\n<!-- 本地改动 -->\n', 'utf8');

    const r = await installAllBundledSkills({ to: dir });
    assert.equal(r.status, 'conflict');
    assert.equal(r.skills.length, 1);
    assert.match(await readFile(victim, 'utf8'), /本地改动/, '冲突时不许动任何文件');

    const forced = await installAllBundledSkills({ to: dir, force: true });
    assert.equal(forced.status, 'ok');
    assert.equal(await readFile(victim, 'utf8'), original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('命令层：--all 与 --name 互斥', async () => {
  await assert.rejects(() => action.run({ all: true, name: 'nx-pg' }), /互斥/);
  // 只给 --all 时走得通（落到默认目录，这里只验不抛错）
  const r = await action.run({ all: true, to: DEFAULT_SKILLS_DIR + '-nxpg-probe', force: true });
  assert.equal(r.all, true);
  await rm(DEFAULT_SKILLS_DIR + '-nxpg-probe', { recursive: true, force: true });
});
