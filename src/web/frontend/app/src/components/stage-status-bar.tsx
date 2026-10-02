// nx-pg 画布状态栏（左下角）：缩放比例 / 实体计数 / 渲染帧率。
//
// 为什么是 DOM 而不是画布文字：
// 原 project-graph 只有一条画布内调试信息（renderer.renderDebugDetails），
// 且要 Settings.showDebug 打开、颜色由主题决定、在缩放很小时几乎看不清。
// 状态栏走 DOM 后能复用主题 CSS 变量、随 UI 缩放走 App.tsx 的 zoom 容器、
// 并且文字尺寸不随摄像机缩放变小 —— 这三点是「画布文字」做不到的。
//
// 为什么轮询而不是订阅：
// 实体计数与 fps 没有任何变更事件可订阅（stage 数组是普通数组，renderer.fps 每秒才写一次），
// 且本组件绝不能触发 project.loop()（那会让「鼠标移开画布后停止渲染」的既有行为失效）。
// 4Hz 定时器只读字段、不碰渲染管线，是这里唯一不改变原行为的选择。
import { Project } from "@/core/Project";
import { cn } from "@/utils/cn";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { isClassroomModeAtom } from "@/state";

/** 轮询间隔。1Hz 太跳（fps 要读秒级累计），10Hz 又白烧 CPU；4Hz 兼顾两者。 */
const POLL_INTERVAL_MS = 250;

interface StageStats {
  /** 节点数：场上所有实体（含文本 / 分区 / 图片 / SVG / URL 等各种 ConnectableEntity），不含连线 */
  nodeCount: number;
  /** 连线数：所有可被 Edge 连接的关系 */
  edgeCount: number;
  /** 选中实体数 */
  selectedCount: number;
  /** 摄像机当前缩放倍数 */
  scale: number;
  /** renderer 每秒统计的帧率；画布暂停渲染时为上一轮的残留值 */
  fps: number;
}

function readStats(project: Project): StageStats {
  return {
    // 复用 renderer 调试信息里同一套口径，避免状态栏数字与画布调试数字对不上。
    // 注意 nodeCount 用 getEntities() 而非 getTextNodes()+getSections()：
    // 后者漏掉 ImageNode / UrlNode / SvgNode 等其他 ConnectableEntity，
    // 粘贴一张图片后状态栏会显示「节点 0」，与画布上明明有一个节点矛盾。
    nodeCount: project.stageManager.getEntities().length,
    edgeCount: project.stageManager.getLineEdges().length,
    selectedCount: project.stageManager.getSelectedEntities().length,
    scale: project.camera.currentScale,
    fps: project.renderer.fps,
  };
}

/**
 * 把缩放倍数格式化成用户读得懂的字符串。
 *
 * 1 以下的小数用百分比之外还要给有效位数：currentScale 会被 toFixed(4) 截断，
 * 直接 String() 可能吐出 "0.30000000000000004" 这类浮点噪声。
 */
function formatScale(scale: number): string {
  if (!Number.isFinite(scale) || scale <= 0) return "—";
  if (scale >= 1) return `${Math.round(scale * 100)}%`;
  if (scale >= 0.01) return `${(scale * 100).toFixed(1).replace(/\.0$/, "")}%`;
  return scale.toExponential(1);
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium tabular-nums">{value}</span>
    </span>
  );
}

export default function StageStatusBar({ project, maxFps }: { project: Project; maxFps: number }) {
  const isClassroomMode = useAtomValue(isClassroomModeAtom);
  // 惰性初始化：首帧就有值，渲染期间读 stats 不用判空。
  // 这里刻意**不用** project.isRunning 当渲染门槛 —— isRunning 只表示 rAF 循环
  // 是否在跑，而画布本来就要等鼠标移入才 loop()（Canvas.tsx 的 mousemove 监听）。
  // 若拿它当门槛，React 的子组件 effect 先于父组件 effect 执行，App.tsx 里
  // Settings.watch("pauseRenderWhenTabUnfocused") 触发的 activeResourceTab.loop()
  // 尚未跑完，状态栏首帧就会判 false → 永久返回 null，整轮功能等于没上线。
  // fps 是「上一次统计值」，画布暂停时它冻结 60 属于合理语义（渲染确实停着）。
  const [stats, setStats] = useState<StageStats>(() => readStats(project));

  useEffect(() => {
    const timer = setInterval(() => setStats(readStats(project)), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [project]);

  return (
    <div
      // pointer-events-none!：末尾的 ! 是必需的，不是冗余。
      // 本组件渲染在 App.tsx 的「已缩放 UI 层」内，而那层的 className 是
      // `*:pointer-events-auto`，编译成 :is(.\*\:pointer-events-auto>*) —— 特异性 (0,2,0)，
      // 高于普通 .pointer-events-none 的 (0,1,0)。所以这里光写 pointer-events-none
      // 会被父层的规则压过，状态栏会吃掉画布左下角的点击/框选。
      // 带 ! 提升到 (0,2,0) 以上才稳定生效（状态栏是纯展示，任何情况下都不该拦画布）。
      className={cn(
        "bg-popover/95 supports-backdrop-blur:bg-popover/80 border-border/50 text-muted-foreground pointer-events-none! absolute bottom-2 left-2 z-10 flex items-center gap-3 rounded-lg border px-2.5 py-1 text-xs shadow-xl backdrop-blur-md transition-opacity",
        isClassroomMode ? "opacity-0" : "opacity-60 hover:opacity-100",
      )}
    >
      <StatItem label="缩放" value={formatScale(stats.scale)} />
      <span aria-hidden className="bg-border h-3 w-px" />
      <StatItem label="节点" value={String(stats.nodeCount)} />
      <StatItem label="连线" value={String(stats.edgeCount)} />
      <StatItem label="选中" value={String(stats.selectedCount)} />
      <span aria-hidden className="bg-border h-3 w-px" />
      <StatItem label="FPS" value={String(stats.fps)} />
      <span aria-hidden className="bg-border h-3 w-px" />
      <StatItem label="上限" value={String(maxFps)} />
    </div>
  );
}
