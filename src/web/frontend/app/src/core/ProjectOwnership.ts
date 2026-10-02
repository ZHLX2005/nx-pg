// nx-pg 个人本地使用，跨进程 ownership 锁不需要 —— 整个应用跑在同一个 server 进程 + 一个浏览器标签页内。
// 这里保留 ProjectOwnershipLifecycle 的最小 API（attach/activate/saveAs/dispose），让 Project.tsx 无需改动。
import type { Project } from "./Project";

export class ProjectOwnershipError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "PROJECT_LOAD_FAILED" | "PROJECT_BUSY";
  readonly owner?: { kind: "connectable"; endpoint: string } | { kind: "unconnectable_holder" };
  constructor(
    code: "PROJECT_NOT_FOUND" | "PROJECT_LOAD_FAILED" | "PROJECT_BUSY",
    owner?: { kind: "connectable"; endpoint: string } | { kind: "unconnectable_holder" },
  ) {
    super(code);
    this.code = code;
    this.owner = owner;
  }
}

export class ProjectOwnershipLease {
  constructor(
    public readonly ownershipId: string,
    public readonly canonicalPath: string,
  ) {}
  async makeConnectable(): Promise<void> {}
  async dispose(): Promise<void> {}
}

export class ProjectOwnershipLifecycle {
  private ownership?: ProjectOwnershipLease;
  private readonly project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  attach(ownership: ProjectOwnershipLease): void {
    this.ownership = ownership;
  }

  activate(): void {
    // 单进程：runtimeHost 始终不需要（仅当外部进程持有同一文件锁才有意义）
  }

  get ownershipId(): string | undefined {
    return this.ownership?.ownershipId;
  }

  get canonicalPath(): string | undefined {
    return this.ownership?.canonicalPath;
  }

  async saveAs(targetUri: { fsPath: string }, write: () => Promise<void>): Promise<void> {
    await write();
    // 单进程版：写盘成功后把工程 uri 切到新文件（原桌面版还有 ownership 租约迁移，web 版不需要）
    this.project.uri = targetUri as Project["uri"];
  }

  async dispose(disposeProject: () => Promise<void>): Promise<void> {
    try {
      await disposeProject();
    } finally {
      this.ownership = undefined;
    }
  }
}

export type ProjectOwnershipLoadResult<T> = { status: "opened"; value: T } | { status: "already_open" };

export async function loadWithProjectOwnership<T>(
  _projectPath: string,
  load: (ownership: ProjectOwnershipLease | undefined) => Promise<T>,
): Promise<ProjectOwnershipLoadResult<T>> {
  return { status: "opened", value: await load(undefined) };
}
