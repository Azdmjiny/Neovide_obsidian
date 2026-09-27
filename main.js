"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NeovideCursorTrailPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");

// src/trail-physics.ts
var RELATIVE_CORNERS = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 }
];
var MOTION_PROFILE = {
  shortMoveColumns: 8,
  shortDurationMs: 50,
  rankFactors: [1, 0.9, 0.5, 0.3],
  leadingAlignment: 0.5,
  leadingDurationSeconds: 0.02,
  resetThresholdSeconds: 0.075,
  maxTrailDistanceFactor: 100
};
var clamp = (value, min, max) => Math.min(Math.max(value, min), max);
function normalize(point) {
  const length = Math.hypot(point.x, point.y);
  return length === 0 ? { x: 0, y: 0 } : { x: point.x / length, y: point.y / length };
}
var DampedSpring = class {
  constructor() {
    this.position = 0;
    this.velocity = 0;
    this.animationLength = 0.125;
  }
  reset() {
    this.position = 0;
    this.velocity = 0;
  }
  update(dt) {
    if (this.animationLength <= dt || Math.abs(this.position) < 1e-3) {
      this.reset();
      return;
    }
    const omega = 4 / this.animationLength;
    const a = this.position;
    const b = this.position * omega + this.velocity;
    const decay = Math.exp(-omega * dt);
    this.position = (a + b * dt) * decay;
    this.velocity = decay * (-a * omega - b * dt * omega + b);
  }
};
var Corner = class {
  constructor(relative) {
    this.xSpring = new DampedSpring();
    this.ySpring = new DampedSpring();
    this.point = { x: 0, y: 0 };
    this.previousDestination = { x: 0, y: 0 };
    this.relative = relative;
  }
  destination(rect) {
    return {
      x: rect.x + (this.relative.x + 0.5) * rect.width,
      y: rect.y + (this.relative.y + 0.5) * rect.height
    };
  }
  snap(rect) {
    this.point = this.destination(rect);
    this.previousDestination = { ...this.point };
    this.xSpring.reset();
    this.ySpring.reset();
  }
  move(rect, movement, rank, options) {
    const destination = this.destination(rect);
    const direction = normalize(movement);
    const cornerDirection = normalize(this.relative);
    const alignment = direction.x * cornerDirection.x + direction.y * cornerDirection.y;
    const isShortMove = Math.abs(movement.x / Math.max(rect.width, 1)) <= MOTION_PROFILE.shortMoveColumns && Math.abs(movement.y) < 1e-3;
    const baseTime = isShortMove ? Math.min(options.durationMs, MOTION_PROFILE.shortDurationMs) : options.durationMs;
    const factor = MOTION_PROFILE.rankFactors[rank] ?? 1;
    const length = alignment > MOTION_PROFILE.leadingAlignment ? MOTION_PROFILE.leadingDurationSeconds : baseTime / 1e3 * factor * options.strength;
    this.xSpring.animationLength = length;
    this.ySpring.animationLength = length;
    if (length > MOTION_PROFILE.resetThresholdSeconds) {
      this.xSpring.reset();
      this.ySpring.reset();
    }
    this.xSpring.position = destination.x - this.point.x;
    this.ySpring.position = destination.y - this.point.y;
    this.previousDestination = destination;
  }
  update(rect, dt) {
    const destination = this.destination(rect);
    if (destination.x !== this.previousDestination.x || destination.y !== this.previousDestination.y) {
      this.xSpring.position = destination.x - this.point.x;
      this.ySpring.position = destination.y - this.point.y;
      this.previousDestination = destination;
    }
    this.xSpring.update(dt);
    this.ySpring.update(dt);
    const maxDistance = Math.max(rect.width, rect.height) * MOTION_PROFILE.maxTrailDistanceFactor;
    this.xSpring.position = clamp(this.xSpring.position, -maxDistance, maxDistance);
    this.ySpring.position = clamp(this.ySpring.position, -maxDistance, maxDistance);
    this.point = {
      x: destination.x - this.xSpring.position,
      y: destination.y - this.ySpring.position
    };
    return Math.abs(this.xSpring.position) > 0.5 || Math.abs(this.ySpring.position) > 0.5;
  }
};
var TrailPhysics = class {
  constructor(options = { durationMs: 125, strength: 1 }) {
    this.corners = RELATIVE_CORNERS.map((relative) => new Corner(relative));
    this.target = null;
    this.previousTime = 0;
    this.moving = false;
    this.options = options;
  }
  setOptions(options) {
    this.options = {
      durationMs: clamp(options.durationMs, 60, 250),
      strength: clamp(options.strength, 0.5, 2)
    };
  }
  snap(rect) {
    this.target = { ...rect };
    for (const corner of this.corners) corner.snap(rect);
    this.previousTime = 0;
    this.moving = false;
  }
  move(rect) {
    const old = this.target;
    if (!old) {
      this.snap(rect);
      return false;
    }
    if (old.x === rect.x && old.y === rect.y && old.width === rect.width && old.height === rect.height) return false;
    if (!this.moving) this.previousTime = 0;
    const movement = { x: rect.x - old.x, y: rect.y - old.y };
    const direction = normalize(movement);
    const ranked = this.corners.map((corner, index) => ({ index, alignment: direction.x * normalize(corner.relative).x + direction.y * normalize(corner.relative).y })).sort((a, b) => a.alignment - b.alignment);
    for (let rank = 0; rank < ranked.length; rank++) {
      const index = ranked[rank]?.index;
      if (index !== void 0) this.corners[index]?.move(rect, movement, rank, this.options);
    }
    this.target = { ...rect };
    this.moving = true;
    return true;
  }
  tick(now) {
    if (!this.target || !this.moving) return false;
    if (this.previousTime !== 0 && now - this.previousTime > 250) {
      this.snap(this.target);
      return false;
    }
    const dt = this.previousTime === 0 ? 0 : Math.min((now - this.previousTime) / 1e3, 1 / 30);
    this.previousTime = now;
    let moving = false;
    for (const corner of this.corners) {
      if (corner.update(this.target, dt)) moving = true;
    }
    this.moving = moving;
    return this.moving;
  }
  getPolygon() {
    return this.corners.map((corner) => ({ ...corner.point }));
  }
  get isMoving() {
    return this.moving;
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  durationMs: 125,
  strength: 1,
  opacity: 1,
  colorMode: "theme",
  customColor: "#ffc0cb",
  glow: true
};
var clamp2 = (value, min, max) => Math.min(Math.max(value, min), max);
function parseSettings(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_SETTINGS.enabled,
    durationMs: typeof data.durationMs === "number" && Number.isFinite(data.durationMs) ? clamp2(data.durationMs, 60, 250) : DEFAULT_SETTINGS.durationMs,
    strength: typeof data.strength === "number" && Number.isFinite(data.strength) ? clamp2(data.strength, 0.5, 2) : DEFAULT_SETTINGS.strength,
    opacity: typeof data.opacity === "number" && Number.isFinite(data.opacity) ? clamp2(data.opacity, 0.2, 1) : DEFAULT_SETTINGS.opacity,
    colorMode: data.colorMode === "custom" ? "custom" : "theme",
    customColor: typeof data.customColor === "string" && /^#[0-9a-fA-F]{6}$/.test(data.customColor) ? data.customColor : DEFAULT_SETTINGS.customColor,
    glow: typeof data.glow === "boolean" ? data.glow : DEFAULT_SETTINGS.glow
  };
}
var TrailController = class {
  constructor(settings) {
    this.settings = settings;
    this.views = /* @__PURE__ */ new Set();
    this.motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  get active() {
    return this.settings.enabled && !this.motionPreference.matches;
  }
  refresh() {
    for (const view of this.views) view.refresh();
  }
  destroy() {
    for (const view of [...this.views]) view.destroy();
  }
};
var CursorTrailView = class {
  constructor(view, controller) {
    this.view = view;
    this.controller = controller;
    this.canvas = null;
    this.context = null;
    this.resizeObserver = null;
    this.frameId = 0;
    this.needsSnap = true;
    this.destroyed = false;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    this.onFocus = () => {
      this.stop();
      this.schedule();
    };
    this.onBlur = () => this.stop();
    this.onScroll = () => {
      this.stop();
      this.schedule();
    };
    this.frame = (time) => {
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
    this.physics = new TrailPhysics({
      durationMs: controller.settings.durationMs,
      strength: controller.settings.strength
    });
    controller.views.add(this);
    this.view.dom.addEventListener("focusin", this.onFocus);
    this.view.dom.addEventListener("focusout", this.onBlur);
    this.view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
    this.mount();
    this.schedule();
  }
  update(update) {
    if (update.selectionSet || update.docChanged || update.viewportChanged || update.geometryChanged || update.focusChanged) {
      this.schedule();
    }
  }
  refresh() {
    this.physics.setOptions({
      durationMs: this.controller.settings.durationMs,
      strength: this.controller.settings.strength
    });
    this.stop();
    if (this.controller.active) this.schedule();
  }
  mount() {
    if (this.canvas || !this.view.dom.closest(".markdown-source-view.mod-cm6")) return;
    const canvas = document.createElement("canvas");
    canvas.className = "neovide-cursor-trail";
    canvas.setAttribute("aria-hidden", "true");
    const context = canvas.getContext("2d");
    if (!context) return;
    this.canvas = canvas;
    this.context = context;
    this.view.dom.classList.add("neovide-cursor-editor");
    this.view.dom.appendChild(canvas);
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.stop();
      this.schedule();
    });
    this.resizeObserver.observe(this.view.dom);
    this.resizeCanvas();
  }
  resizeCanvas() {
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
  schedule() {
    if (!this.destroyed && this.frameId === 0) {
      this.frameId = requestAnimationFrame(this.frame);
    }
  }
  readCursorRect() {
    const selection = this.view.state.selection;
    if (selection.ranges.length !== 1 || !selection.main.empty || !this.canvas) return null;
    const coordinates = this.view.coordsAtPos(selection.main.head);
    if (!coordinates) return null;
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = coordinates.left - canvasRect.left;
    const y = coordinates.top - canvasRect.top;
    if (x < 0 || y < 0 || x > canvasRect.width || y + coordinates.bottom - coordinates.top > canvasRect.height) return null;
    const nativeCursor = this.view.dom.querySelector(".cm-cursorLayer .cm-cursor-primary, .cm-cursorLayer .cm-cursor");
    const nativeWidth = nativeCursor ? Number.parseFloat(getComputedStyle(nativeCursor).borderLeftWidth) : 0;
    return {
      x,
      y,
      width: Number.isFinite(nativeWidth) && nativeWidth > 0 ? nativeWidth : 2,
      height: Math.max(1, coordinates.bottom - coordinates.top)
    };
  }
  draw() {
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
    this.context.shadowColor = "transparent";
    this.view.dom.classList.add("neovide-cursor-animating");
  }
  getColor() {
    const settings = this.controller.settings;
    if (settings.colorMode === "custom") return settings.customColor;
    const cursor = this.view.dom.querySelector(".cm-cursorLayer .cm-cursor-primary, .cm-cursorLayer .cm-cursor");
    const color = cursor ? getComputedStyle(cursor).borderLeftColor : "";
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    return getComputedStyle(this.view.dom).getPropertyValue("--text-accent").trim() || settings.customColor;
  }
  readCursorHeight() {
    const points = this.physics.getPolygon();
    return points.length === 4 ? Math.max(1, Math.abs((points[2]?.y ?? 0) - (points[1]?.y ?? 0))) : 18;
  }
  clear() {
    this.context?.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.view.dom.classList.remove("neovide-cursor-animating");
  }
  stop() {
    if (this.frameId !== 0) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.needsSnap = true;
    this.clear();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.resizeObserver?.disconnect();
    this.view.dom.removeEventListener("focusin", this.onFocus);
    this.view.dom.removeEventListener("focusout", this.onBlur);
    this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    this.view.dom.classList.remove("neovide-cursor-editor");
    this.canvas?.remove();
    this.canvas = null;
    this.context = null;
    this.controller.views.delete(this);
  }
};
var NeovideCursorTrailPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.controller = null;
  }
  async onload() {
    this.settings = parseSettings(await this.loadData());
    this.controller = new TrailController(this.settings);
    const controller = this.controller;
    this.registerEditorExtension(import_view.ViewPlugin.fromClass(class extends CursorTrailView {
      constructor(view) {
        super(view, controller);
      }
    }));
    const onMotionChange = () => controller.refresh();
    controller.motionPreference.addEventListener("change", onMotionChange);
    this.register(() => controller.motionPreference.removeEventListener("change", onMotionChange));
    this.addSettingTab(new TrailSettingTab(this.app, this));
  }
  onunload() {
    this.controller?.destroy();
    this.controller = null;
  }
  async updateSettings(settings) {
    this.settings = parseSettings(settings);
    await this.saveData(this.settings);
    if (this.controller) {
      this.controller.settings = this.settings;
      this.controller.refresh();
    }
  }
};
var TrailSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;
    new import_obsidian.Setting(containerEl).setName("\u542F\u7528\u5149\u6807\u62D6\u5C3E").setDesc("\u4EC5\u4F5C\u7528\u4E8E Markdown \u7F16\u8F91\u5668\u3002\u7CFB\u7EDF\u5F00\u542F\u201C\u51CF\u5C11\u52A8\u6001\u6548\u679C\u201D\u65F6\u81EA\u52A8\u6682\u505C\u3002").addToggle((toggle) => toggle.setValue(settings.enabled).onChange(async (enabled) => {
      await this.plugin.updateSettings({ ...this.plugin.settings, enabled });
    }));
    new import_obsidian.Setting(containerEl).setName("\u52A8\u753B\u65F6\u957F").setDesc("\u63A7\u5236\u5149\u6807\u62D6\u5C3E\u7684\u56DE\u5F39\u901F\u5EA6\u3002").addSlider((slider) => slider.setLimits(60, 250, 5).setValue(settings.durationMs).setDynamicTooltip().onChange(async (durationMs) => {
      await this.plugin.updateSettings({ ...this.plugin.settings, durationMs });
    }));
    new import_obsidian.Setting(containerEl).setName("\u62D6\u5C3E\u5F3A\u5EA6").setDesc("\u6570\u503C\u8D8A\u5927\uFF0C\u5149\u6807\u5C3E\u90E8\u62C9\u4F38\u8D8A\u660E\u663E\u3002").addSlider((slider) => slider.setLimits(0.5, 2, 0.1).setValue(settings.strength).setDynamicTooltip().onChange(async (strength) => {
      await this.plugin.updateSettings({ ...this.plugin.settings, strength });
    }));
    new import_obsidian.Setting(containerEl).setName("\u62D6\u5C3E\u900F\u660E\u5EA6").addSlider((slider) => slider.setLimits(0.2, 1, 0.05).setValue(settings.opacity).setDynamicTooltip().onChange(async (opacity) => {
      await this.plugin.updateSettings({ ...this.plugin.settings, opacity });
    }));
    new import_obsidian.Setting(containerEl).setName("\u8F89\u5149").setDesc("\u4FDD\u7559\u539F\u63D2\u4EF6\u7684\u67D4\u548C\u5149\u6655\u3002").addToggle((toggle) => toggle.setValue(settings.glow).onChange(async (glow) => {
      await this.plugin.updateSettings({ ...this.plugin.settings, glow });
    }));
    new import_obsidian.Setting(containerEl).setName("\u62D6\u5C3E\u989C\u8272").addDropdown((dropdown) => dropdown.addOption("theme", "\u8DDF\u968F\u4E3B\u9898\u5149\u6807").addOption("custom", "\u81EA\u5B9A\u4E49").setValue(settings.colorMode).onChange(async (value) => {
      const colorMode = value === "custom" ? "custom" : "theme";
      await this.plugin.updateSettings({ ...this.plugin.settings, colorMode });
      this.display();
    }));
    if (settings.colorMode === "custom") {
      new import_obsidian.Setting(containerEl).setName("\u81EA\u5B9A\u4E49\u989C\u8272").setDesc("\u8F93\u5165\u516D\u4F4D\u5341\u516D\u8FDB\u5236\u989C\u8272\uFF0C\u4F8B\u5982 #ffc0cb\u3002").addText((text) => text.setPlaceholder("#ffc0cb").setValue(settings.customColor).onChange(async (customColor) => {
        if (/^#[0-9a-fA-F]{6}$/.test(customColor)) {
          await this.plugin.updateSettings({ ...this.plugin.settings, customColor });
        }
      }));
    }
  }
};
