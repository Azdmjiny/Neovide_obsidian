import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { CursorRect, TrailPhysics } from './trail-physics';

interface TrailSettings {
  enabled: boolean;
  durationMs: number;
  strength: number;
  opacity: number;
  colorMode: 'theme' | 'custom';
  customColor: string;
  glow: boolean;
}

const DEFAULT_SETTINGS: TrailSettings = {
  enabled: true,
  durationMs: 125,
  strength: 1,
  opacity: 1,
  colorMode: 'theme',
  customColor: '#ffc0cb',
  glow: true,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function parseSettings(raw: unknown): TrailSettings {
  const data = raw && typeof raw === 'object' ? raw as Partial<TrailSettings> : {};
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_SETTINGS.enabled,
    durationMs: typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)
      ? clamp(data.durationMs, 60, 250) : DEFAULT_SETTINGS.durationMs,
    strength: typeof data.strength === 'number' && Number.isFinite(data.strength)
      ? clamp(data.strength, 0.5, 2) : DEFAULT_SETTINGS.strength,
    opacity: typeof data.opacity === 'number' && Number.isFinite(data.opacity)
      ? clamp(data.opacity, 0.2, 1) : DEFAULT_SETTINGS.opacity,
    colorMode: data.colorMode === 'custom' ? 'custom' : 'theme',
    customColor: typeof data.customColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.customColor)
      ? data.customColor : DEFAULT_SETTINGS.customColor,
    glow: typeof data.glow === 'boolean' ? data.glow : DEFAULT_SETTINGS.glow,
  };
}

class TrailController {
  readonly views = new Set<CursorTrailView>();
  readonly motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(public settings: TrailSettings) {}

  get active(): boolean {
    return this.settings.enabled && !this.motionPreference.matches;
  }

  refresh(): void {
    for (const view of this.views) view.refresh();
  }

  destroy(): void {
    for (const view of [...this.views]) view.destroy();
  }
}

class CursorTrailView {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private readonly physics: TrailPhysics;
  private resizeObserver: ResizeObserver | null = null;
  private frameId = 0;
  private needsSnap = true;
  private destroyed = false;
  private canvasWidth = 0;
  private canvasHeight = 0;

  private readonly onFocus = (): void => {
    this.stop();
    this.schedule();
  };
  private readonly onBlur = (): void => this.stop();
  private readonly onScroll = (): void => {
    this.stop();
    this.schedule();
  };

  constructor(private readonly view: EditorView, private readonly controller: TrailController) {
    this.physics = new TrailPhysics({
      durationMs: controller.settings.durationMs,
      strength: controller.settings.strength,
    });
    controller.views.add(this);
    this.view.dom.addEventListener('focusin', this.onFocus);
    this.view.dom.addEventListener('focusout', this.onBlur);
    this.view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    this.mount();
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.selectionSet || update.docChanged || update.viewportChanged || update.geometryChanged || update.focusChanged) {
      this.schedule();
    }
  }

  refresh(): void {
    this.physics.setOptions({
      durationMs: this.controller.settings.durationMs,
      strength: this.controller.settings.strength,
    });
    this.stop();
    if (this.controller.active) this.schedule();
  }

  private mount(): void {
    if (this.canvas || !this.view.dom.closest('.markdown-source-view.mod-cm6')) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'neovide-cursor-trail';
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    if (!context) return;
    this.canvas = canvas;
    this.context = context;
    this.view.dom.classList.add('neovide-cursor-editor');
    this.view.dom.appendChild(canvas);
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.stop();
      this.schedule();
    });
    this.resizeObserver.observe(this.view.dom);
    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.context) return;
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }

  private schedule(): void {
    if (!this.destroyed && this.frameId === 0) {
      this.frameId = requestAnimationFrame(this.frame);
    }
  }

  private readonly frame = (time: number): void => {
    this.frameId = 0;
    if (this.destroyed) return;
    this.mount();
    if (!this.canvas || !this.context || !this.controller.active || !this.view.hasFocus || this.view.composing) {
      this.stop();
      return;
    }
    const rect = this.readCursorRect();
    if (!rect) {
      this.stop();
      return;
    }
    if (this.needsSnap) {
      this.physics.snap(rect);
      this.needsSnap = false;
      return;
    }
    this.physics.move(rect);
    if (!this.physics.isMoving) {
      this.clear();
      return;
    }
    const moving = this.physics.tick(time);
    if (moving) {
      this.draw();
      this.schedule();
    } else {
      this.clear();
    }
  };

  private readCursorRect(): CursorRect | null {
    const selection = this.view.state.selection;
    if (selection.ranges.length !== 1 || !selection.main.empty || !this.canvas) return null;
    const coordinates = this.view.coordsAtPos(selection.main.head);
    if (!coordinates) return null;
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = coordinates.left - canvasRect.left;
    const y = coordinates.top - canvasRect.top;
    if (x < 0 || y < 0 || x > canvasRect.width || y + coordinates.bottom - coordinates.top > canvasRect.height) return null;
    const nativeCursor = this.view.dom.querySelector<HTMLElement>('.cm-cursorLayer .cm-cursor-primary, .cm-cursorLayer .cm-cursor');
    const nativeWidth = nativeCursor ? Number.parseFloat(getComputedStyle(nativeCursor).borderLeftWidth) : 0;
    return {
      x,
      y,
      width: Number.isFinite(nativeWidth) && nativeWidth > 0 ? nativeWidth : 2,
      height: Math.max(1, coordinates.bottom - coordinates.top),
    };
  }

  private draw(): void {
    if (!this.context) return;
    const points = this.physics.getPolygon();
    const first = points[0];
    if (!first) return;
    this.context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.context.beginPath();
    this.context.moveTo(first.x, first.y);
    for (const point of points.slice(1)) this.context.lineTo(point.x, point.y);
    this.context.closePath();
    const color = this.getColor();
    this.context.fillStyle = color;
    this.context.globalAlpha = this.controller.settings.opacity;
    if (this.controller.settings.glow) {
      this.context.shadowColor = color;
      this.context.shadowBlur = 0.5 * Math.max(2, this.canvasHeight > 0 ? this.readCursorHeight() : 0);
    }
    this.context.fill();
    this.context.globalAlpha = 1;
    this.context.shadowBlur = 0;
    this.context.shadowColor = 'transparent';
    this.view.dom.classList.add('neovide-cursor-animating');
  }

  private getColor(): string {
    const settings = this.controller.settings;
    if (settings.colorMode === 'custom') return settings.customColor;
    const cursor = this.view.dom.querySelector<HTMLElement>('.cm-cursorLayer .cm-cursor-primary, .cm-cursorLayer .cm-cursor');
    const color = cursor ? getComputedStyle(cursor).borderLeftColor : '';
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color;
    return getComputedStyle(this.view.dom).getPropertyValue('--text-accent').trim() || settings.customColor;
  }

  private readCursorHeight(): number {
    const points = this.physics.getPolygon();
    return points.length === 4 ? Math.max(1, Math.abs((points[2]?.y ?? 0) - (points[1]?.y ?? 0))) : 18;
  }

  private clear(): void {
    this.context?.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.view.dom.classList.remove('neovide-cursor-animating');
  }

  private stop(): void {
    if (this.frameId !== 0) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.needsSnap = true;
    this.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.view.dom.removeEventListener('focusin', this.onFocus);
    this.view.dom.removeEventListener('focusout', this.onBlur);
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.view.dom.classList.remove('neovide-cursor-editor');
    this.canvas?.remove();
    this.canvas = null;
    this.context = null;
    this.controller.views.delete(this);
  }
}

export default class NeovideCursorTrailPlugin extends Plugin {
  settings: TrailSettings = { ...DEFAULT_SETTINGS };
  private controller: TrailController | null = null;

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.controller = new TrailController(this.settings);
    const controller = this.controller;
    this.registerEditorExtension(ViewPlugin.fromClass(class extends CursorTrailView {
      constructor(view: EditorView) {
        super(view, controller);
      }
    }));
    const onMotionChange = (): void => controller.refresh();
    controller.motionPreference.addEventListener('change', onMotionChange);
    this.register(() => controller.motionPreference.removeEventListener('change', onMotionChange));
    this.addSettingTab(new TrailSettingTab(this.app, this));
  }

  onunload(): void {
    this.controller?.destroy();
    this.controller = null;
  }

  async updateSettings(settings: TrailSettings): Promise<void> {
    this.settings = parseSettings(settings);
    await this.saveData(this.settings);
    if (this.controller) {
      this.controller.settings = this.settings;
      this.controller.refresh();
    }
  }
}

class TrailSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: NeovideCursorTrailPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    new Setting(containerEl)
      .setName('启用光标拖尾')
      .setDesc('仅作用于 Markdown 编辑器。系统开启“减少动态效果”时自动暂停。')
      .addToggle((toggle) => toggle.setValue(settings.enabled).onChange(async (enabled) => {
        await this.plugin.updateSettings({ ...this.plugin.settings, enabled });
      }));

    new Setting(containerEl)
      .setName('动画时长')
      .setDesc('控制光标拖尾的回弹速度。')
      .addSlider((slider) => slider.setLimits(60, 250, 5).setValue(settings.durationMs).setDynamicTooltip()
        .onChange(async (durationMs) => {
          await this.plugin.updateSettings({ ...this.plugin.settings, durationMs });
        }));

    new Setting(containerEl)
      .setName('拖尾强度')
      .setDesc('数值越大，光标尾部拉伸越明显。')
      .addSlider((slider) => slider.setLimits(0.5, 2, 0.1).setValue(settings.strength).setDynamicTooltip()
        .onChange(async (strength) => {
          await this.plugin.updateSettings({ ...this.plugin.settings, strength });
        }));

    new Setting(containerEl)
      .setName('拖尾透明度')
      .addSlider((slider) => slider.setLimits(0.2, 1, 0.05).setValue(settings.opacity).setDynamicTooltip()
        .onChange(async (opacity) => {
          await this.plugin.updateSettings({ ...this.plugin.settings, opacity });
        }));

    new Setting(containerEl)
      .setName('辉光')
      .setDesc('保留原插件的柔和光晕。')
      .addToggle((toggle) => toggle.setValue(settings.glow).onChange(async (glow) => {
        await this.plugin.updateSettings({ ...this.plugin.settings, glow });
      }));

    new Setting(containerEl)
      .setName('拖尾颜色')
      .addDropdown((dropdown) => dropdown.addOption('theme', '跟随主题光标').addOption('custom', '自定义')
        .setValue(settings.colorMode).onChange(async (value) => {
          const colorMode = value === 'custom' ? 'custom' : 'theme';
          await this.plugin.updateSettings({ ...this.plugin.settings, colorMode });
          this.display();
        }));

    if (settings.colorMode === 'custom') {
      new Setting(containerEl)
        .setName('自定义颜色')
        .setDesc('输入六位十六进制颜色，例如 #ffc0cb。')
        .addText((text) => text.setPlaceholder('#ffc0cb').setValue(settings.customColor)
          .onChange(async (customColor) => {
            if (/^#[0-9a-fA-F]{6}$/.test(customColor)) {
              await this.plugin.updateSettings({ ...this.plugin.settings, customColor });
            }
          }));
    }
  }
}
