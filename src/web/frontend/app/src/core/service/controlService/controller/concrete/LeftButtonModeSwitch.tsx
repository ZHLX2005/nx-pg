// 单 c 键切换左键「创建」与「连线/删除」模式 + HUD 提示。
//
// 背景：Edge 等浏览器自带手势层会吞掉画布上的左键事件，此时用户无法用左键拖出连线。
// 单 c 键把 mouseLeftMode 在 selectAndMove ↔ connectAndCut 之间切换，作为兜底。
//
// 两档的真实语义（由既有 controller 分发，本服务只负责切换与提示）：
//   selectAndMove  = 创建模式：双击空白建节点、左键拖框选、拖动节点
//   connectAndCut  = 连线/删除模式：左键拖出连线（ControllerNodeConnection），
//                    左键划过节点/连线切割删除（ControllerCutting）
// 原 project-graph 的 Settings.mouseLeftMode 已有这两档，ControllerNodeConnection
// 的 mousedown 分支已按此分发，所以这里只做「切换 + 提示」，不新增交互语义。
//
// 独立成文件的原因：ControllerEntityCreate.tsx 会被 Controller 总控用
// import.meta.glob("./concrete/*.tsx") 扫描并按「第一个名字含 Class 的导出」实例化。
// 同模块里再塞第二个导出（本服务）虽不匹配 Class，但会让该文件的导出表变复杂、
// 也容易在后续维护中被误改——拆开更稳。
import { Project, service } from "@/core/Project";
import { Settings } from "@/core/service/Settings";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";

@service("leftButtonModeSwitch")
export class LeftButtonModeSwitch {
  private _hudFrames = 0;
  private _lastMode: "selectAndMove" | "connectAndCut" = "selectAndMove";
  /** 防抖：同一物理按键可能被处理两次（见下方 onPressC 注释），50ms 内的重复调用只算一次 */
  private _lastPressAt = 0;

  constructor(private readonly project: Project) {}

  /**
   * 单 c 键切换。
   *
   * 为什么要防抖：Canvas.tsx 会把 window 上的 keydown 重定向成一个新的 KeyboardEvent
   * 派发到 canvas 元素上。当原始事件本身就是「派发到 canvas 且 bubbles:true」时
   * （自动化测试就是这么造的），同一次按键会走两条路各触发一次 → 连切两下 = 净零。
   * 真实键盘事件不冒泡到 window 的那条路不成立（合成事件 bubbles 默认 false），
   * 所以只会在测试/合成事件场景出现；加一道时间窗让两条路径都安全。
   */
  public onPressC = (): void => {
    const now = performance.now();
    if (now - this._lastPressAt < 50) return;
    this._lastPressAt = now;

    const next: "selectAndMove" | "connectAndCut" =
      Settings.mouseLeftMode === "connectAndCut" ? "selectAndMove" : "connectAndCut";
    Settings.mouseLeftMode = next;
    this._lastMode = next;
    this._hudFrames = 60;
  };

  /** HUD 倒计时（被 renderer 的 tick 调用） */
  public tick = (): void => {
    if (this._hudFrames > 0) this._hudFrames--;
  };

  /** HUD 渲染（renderer 的 renderViewElements 钩子） */
  public renderHUD = (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
    if (this._hudFrames <= 0) return;
    const text =
      this._lastMode === "connectAndCut"
        ? "Mode · 连线/删除（左键拖出连线，划过节点切割删除）"
        : "Mode · 创建（双击空白建节点）";
    ctx.save();
    ctx.font = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const textW = ctx.measureText(text).width;
    const boxW = textW + 28;
    const boxH = 36;
    const x = (w - boxW) / 2;
    const y = 80;
    const border = this.project.stageStyleManager.currentStyle.SelectRectangleBorder;
    const fill = this.project.stageStyleManager.currentStyle.SelectRectangleFill;
    ctx.fillStyle = fill.toString();
    ctx.strokeStyle = border.toString();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const rect = new Rectangle(new Vector(x, y), new Vector(boxW, boxH));
    ctx.rect(rect.location.x, rect.location.y, rect.size.x, rect.size.y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = border.toString();
    ctx.fillText(text, x + boxW / 2, y + boxH / 2);
    ctx.restore();
  };
}
