// GamepadService —— nx-pg 新开发项（原项目只有 gamepadDeadzone 设置残骸，无实现）。
//
// 设计（对齐 Camera 的喷气式飞机物理模型，手感与 WASD 一比一）：
//   - rAF 轮询 navigator.getGamepads()（Gamepad API 无事件推送，只能轮询）
//   - 左摇杆 → camera.accelerateCommander（Camera.tick 里会乘 moveAmplitude·(1/scale)²，
//     所以这里只给归一化方向向量，缩放自适应由相机自己完成）
//   - 死区读 Settings.gamepadDeadzone（0~1，径向判定而非分轴判定，摇杆斜向不抖）
//   - 按键：A(0)=F 重置视野、B(1)=Esc 关面板/取消、RB(5)/LB(4)=缩放、start(9)=Ctrl+S 保存
//   - 摇杆按下 L3(10) = 相机原地重置（等价双击空白）
//
// 生命周期：main.tsx 启动一次 start()；无手柄时轮询成本可忽略（getGamepads 空数组）。
import { Vector } from "@graphif/data-structures";
import { Settings } from "@/core/service/Settings";
import { store, activeTabAtom } from "@/state";
import { Project } from "@/core/Project";

export namespace GamepadService {
  let rafHandle = -1;
  let running = false;
  /** 上一帧连接状态，用于边沿检测（避免 repeat 触发） */
  const prevButtons: boolean[][] = [];

  export function start(): void {
    if (running) return;
    running = true;
    const loop = () => {
      tick();
      rafHandle = requestAnimationFrame(loop);
    };
    rafHandle = requestAnimationFrame(loop);
  }

  export function stop(): void {
    running = false;
    if (rafHandle !== -1) {
      cancelAnimationFrame(rafHandle);
      rafHandle = -1;
    }
  }

  function tick(): void {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      tickStick(pad);
      tickButtons(pad);
    }
  }

  /** 左摇杆 → 相机动力命令（径向死区） */
  function tickStick(pad: Gamepad): void {
    const project = activeProject();
    if (!project) return;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const deadzone = Settings.gamepadDeadzone;
    const v = new Vector(ax, ay);
    // 径向死区：斜向推杆时单轴可能超死区但合矢量不足，分轴判定会导致斜向抖动
    if (v.magnitude() < deadzone) {
      project.camera.accelerateCommander = Vector.getZero();
      return;
    }
    // 死区外归一化为方向命令；Camera.tick 负责乘动力系数与摩擦
    const dir = v.normalize();
    project.camera.accelerateCommander = dir;
  }

  function tickButtons(pad: Gamepad): void {
    const project = activeProject();
    if (!project) return;
    const prev = prevButtons[pad.index] ?? [];
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const justPressed = (i: number) => pressed(i) && !prev[i];

    // A(0)：F 键语义——重置视野到全部内容
    if (justPressed(0)) {
      project.camera.reset();
    }
    // B(1)：Esc 语义——停相机 + 清选择（避免误触发的持续移动）
    if (justPressed(1)) {
      project.camera.stopImmediately();
    }
    // LB(4)/RB(5)：键盘 +/- 缩放语义（与 camera.zoomInByKeyboardPress 同参数）
    if (pressed(5)) project.camera.zoomInByKeyboardPress();
    if (pressed(4)) project.camera.zoomOutByKeyboardPress();
    // start(9)：Ctrl+S 保存
    if (justPressed(9)) {
      void project.save();
    }
    prevButtons[pad.index] = pad.buttons.map((b) => b.pressed);
  }

  function activeProject(): Project | undefined {
    const tab = store.get(activeTabAtom);
    return tab instanceof Project ? tab : undefined;
  }
}
