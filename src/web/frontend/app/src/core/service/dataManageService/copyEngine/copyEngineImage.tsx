import { Project } from "@/core/Project";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { MouseLocation } from "../../controlService/MouseLocation";
import { Settings } from "@/core/service/Settings";
import { applyBlackAndWhite, prepareImageBlobForImport } from "../imageUtils";
import { toast } from "sonner";
import { createImageNodeFromBlob } from "../imageNodeFactory";

export class CopyEngineImage {
  constructor(private project: Project) {}

  public async pasteImageFromTauriClipboard() {
    // 从系统粘贴板里读取图片
    const image = await readImage();
    const { width: origW, height: origH } = await image.size();

    if (origW <= 0 || origH <= 0) return;

    const rgba = await image.rgba();
    const expectedLength = origW * origH * 4;
    const clamped = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
    const data =
      clamped.length === expectedLength
        ? clamped
        : (() => {
            const fixed = new Uint8ClampedArray(expectedLength);
            fixed.set(clamped.slice(0, Math.min(clamped.length, expectedLength)));
            return fixed;
          })();

    const origCanvas = document.createElement("canvas");
    origCanvas.width = origW;
    origCanvas.height = origH;
    const origCtx = origCanvas.getContext("2d")!;
    origCtx.putImageData(new ImageData(data, origW, origH), 0, 0);

    let w = origW;
    let h = origH;
    if (Settings.resizePastedImages) {
      const maxSize = Settings.maxPastedImageSize;
      const maxDim = Math.max(w, h);
      if (maxDim > maxSize) {
        const scale = maxSize / maxDim;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(origCanvas, 0, 0, w, h);

    if (Settings.compressImageToBlackAndWhite) {
      applyBlackAndWhite(canvas);
    }

    const outputType = Settings.compressImageToBlackAndWhite
      ? "image/png"
      : Settings.compressImageToWebp
        ? "image/webp"
        : "image/png";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            if (outputType === "image/webp" && !b.type.includes("webp")) {
              toast.warning("当前系统 webview 不支持 WebP 编码，已回退为 PNG");
            }
            resolve(b);
          } else reject(new Error("canvas.toBlob returned null"));
        },
        outputType,
        Settings.compressImageToBlackAndWhite
          ? undefined
          : Settings.compressImageToWebp
            ? Settings.webpQuality
            : undefined,
      );
    });

    await this.pasteImageBlob(blob);
  }

  private async pasteImageBlob(blob: Blob) {
    const location = this.project.renderer.transformView2World(MouseLocation.vector());
    await createImageNodeFromBlob(this.project, blob, {
      location,
    });
  }

  /**
   * 从浏览器剪贴板里取图片并落成 ImageNode。
   *
   * nx-pg 重写要点（原版这里是 Tauri 的 readImage + Image.rgba，Web 端无对应物）：
   * 1. navigator.clipboard.read() 需要权限且只在用户手势+安全上下文下可用，
   *    无条件 await 会把整个 paste 打断成 unhandled rejection —— 必须包 try/catch。
   * 2. 返回布尔值而不是 undefined：调用方靠它判断「剪贴板里到底有没有图」，
   *    返回 undefined 会被当成 falsy，图片其实已经贴上了却被后续逻辑当成失败。
   */
  public async pasteImageFromWebClipboard(): Promise<boolean> {
    const clipboard = navigator.clipboard as any;
    if (!clipboard || typeof clipboard.read !== "function") {
      toast.error("当前浏览器不支持读取剪贴板图片，请用 Chrome / Edge");
      return false;
    }

    let items: Array<{ types: readonly string[]; getType: (type: string) => Promise<Blob> }>;
    try {
      items = (await clipboard.read()) as typeof items;
    } catch (err) {
      // 权限被拒 / 非安全上下文（http 访问）都会走到这里。
      // 必须给用户一句人话，否则只表现为「按了 Ctrl+V 什么都没发生」。
      toast.error("浏览器拒绝了剪贴板读取权限，请在地址栏左侧允许剪贴板后重试");
      return false;
    }

    let pasted = false;
    for (const item of items ?? []) {
      // 优先挑 png：截图软件写入的通常是 image/png，而部分应用会给 webp，
      // 直接取第一个 image/* 可能拿到浏览器解不动的格式。
      const imageType =
        item.types.find((t) => t === "image/png") ??
        item.types.find((t) => t.startsWith("image/"));
      if (!imageType) continue;
      try {
        const blob = await item.getType(imageType);
        const prepared = await prepareImageBlobForImport(blob);
        await this.pasteImageBlob(prepared.blob);
        pasted = true;
      } catch (err) {
        toast.error(`粘贴图片失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return pasted;
  }
}
