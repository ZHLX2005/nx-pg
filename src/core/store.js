// 后端 JSON store：基于文件 + 内存缓存。
// 设计要点：所有写都立刻落盘（个人本地使用，数据完整性 > 高吞吐），
// 不引入额外 npm 依赖（node:fs 就够）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = (() => {
  // 1) env 覆盖（测试/调试）
  if (process.env.NX_PG_STORE_DIR) return resolve(process.env.NX_PG_STORE_DIR);
  // 2) 包根目录向下（开发态：src/core/store.js → <pkgRoot>/）
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..');
})();

const STORE_DIR = resolve(ROOT, '.nx-pg-store');

class Store {
  constructor(name) {
    this.file = resolve(STORE_DIR, name);
    this.data = {};
    try {
      this.data = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      // 不存在或解析失败 → 空 store
    }
  }
  async get(key) {
    return this.data[key];
  }
  async set(key, value) {
    this.data[key] = value;
    this._persist();
  }
  async delete(key) {
    delete this.data[key];
    this._persist();
  }
  async entries() {
    return Object.entries(this.data);
  }
  async save() {
    this._persist();
  }
  _persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

export async function createStore(name) {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  return new Store(name);
}

export function storePath() {
  return STORE_DIR;
}
