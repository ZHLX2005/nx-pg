// nx-pg 改动：
//   - 与原 project-graph 一致：双击空白建节点（ControllerClass._mouseup 检测双击后分发 mouseDoubleClick）
//   - mouseLeftMode === 'connectAndCut' 时双击不建节点（让 ControllerNodeConnection 接管）
//   - 单 c 键切换 selectAndMove ↔ connectAndCut（Edge 手势层抢走事件时的兜底）
//   - HUD：模式切换时屏幕中央显示 1 秒文字提示
import { Project, service } from "@/core/Project";
import { Settings } from "@/core/service/Settings";
import { ControllerClass } from "@/core/service/controlService/controller/ControllerClass";
import { Vector } from "@graphif/data-structures";
import { Rectangle } from "@graphif/shapes";
import type { Section } from "@/core/stage/stageObject/entity/Section";

/** 单 c 键切换左键模式 + HUD 提示 */
@service("leftButtonModeSwitch")
export class LeftButtonModeSwitch {
  private _hudFrames = 0;
  private _lastMode: "selectAndMove" | "connectAndCut" = "selectAndMove";

  constructor(private readonly project: Project) {}

  /** 单 c 键切换 */
  public onPressC = (): void => {
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
        ? "Mode · 连线（左键拖出）"
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

/**
 * 创建节点的控制器（nx-pg 与原 project-graph 行为一致：双击空白建节点）
 * 单 c 键切到 connectAndCut 时此 controller 不响应，让 ControllerNodeConnection 处理连线。
 */
export class ControllerEntityCreateClass extends ControllerClass {
  constructor(protected readonly project: Project) {
    super(project);
  }

  mouseDoubleClick = (event: MouseEvent): void => {
    if (!(event.button === 0)) {
      return;
    }
    if (Settings.mouseLeftMode === "draw") {
      // 绘制模式不能使用创建节点（nx-pg 未迁移画笔 UI，此分支实际不会触发）
      return;
    }
    if (Settings.mouseLeftMode === "connectAndCut") {
      // 连线模式 → 让 ControllerNodeConnection 处理
      return;
    }
    if (this.project.controller.camera.isPreGrabbingWhenSpace) {
      return;
    }

    this.project.rectangleSelect.shutDown();

    const pressLocation = this.project.renderer.transformView2World(new Vector(event.clientX, event.clientY));
    const clickedEntity = this.project.stageManager.findEntityByLocation(pressLocation);
    if (clickedEntity instanceof Section && this.project.sectionMethods.isSectionBigTitleActive(clickedEntity)) {
      return;
    }

    // 排除：在实体上双击或者在线上双击
    if (
      this.project.stageManager.isEntityOnLocation(pressLocation) ||
      this.project.stageManager.isAssociationOnLocation(pressLocation)
    ) {
      return;
    }

    // 是否是在Section内部双击
    const sections = this.project.sectionMethods.getSectionsByInnerLocation(pressLocation);

    if (this.project.controller.pressingKeySet.has("`") || this.project.controller.pressingKeySet.has("·")) {
      this.createConnectPoint(pressLocation, sections);
    } else if (Settings.doubleClickEmptySpaceAction === "createTextNode") {
      // 双击创建节点
      this.project.controllerUtils.addTextNodeByLocation(pressLocation, true);
    }
  };

  createConnectPoint(pressLocation: Vector, addToSections: Section[]) {
    this.project.nodeAdder.addConnectPoint(pressLocation, addToSections);
  }
}
