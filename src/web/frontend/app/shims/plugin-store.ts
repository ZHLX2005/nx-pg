// ---------- @tauri-apps/plugin-store ----------
// kv 存储 → localStorage（个人本地使用，容量与可靠性足够）。

export class Store {
  private readonly key: string;
  private cache: Record<string, unknown> = {};

  constructor(storeName: string) {
    this.key = "nxpg-store:" + storeName;
    try {
      this.cache = JSON.parse(localStorage.getItem(this.key) ?? "{}");
    } catch {
      this.cache = {};
    }
  }

  // 原 LazyStore 接口：阻塞直到 store 加载完。Web 版是同步 localStorage，调用即返回。
  async init(): Promise<void> {}
  async createResource(_scope: string): Promise<void> {}

  async get<T>(key: string): Promise<T | undefined> {
    return (this.cache[key] as T) ?? undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.cache[key] = value;
    this.persist();
  }

  async delete(key: string): Promise<void> {
    delete this.cache[key];
    this.persist();
  }

  async clear(): Promise<void> {
    this.cache = {};
    this.persist();
  }

  async entries(): Promise<[string, unknown][]> {
    return Object.entries(this.cache);
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.cache);
  }

  async values(): Promise<unknown[]> {
    return Object.values(this.cache);
  }

  async has(key: string): Promise<boolean> {
    return key in this.cache;
  }

  async save(): Promise<void> {
    this.persist();
  }

  async reload(): Promise<void> {
    try {
      this.cache = JSON.parse(localStorage.getItem(this.key) ?? "{}");
    } catch {
      this.cache = {};
    }
  }

  onKeyChanged(_key: string, _cb: (value: unknown) => void): () => void {
    return () => {};
  }

  private persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.cache));
    } catch (e) {
      console.warn("[nx-pg] localStorage 持久化失败", e);
    }
  }
}

export class LazyStore extends Store {}
export const load = async (name: string, _opts?: unknown) => new Store(name);
