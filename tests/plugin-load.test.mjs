import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('built plugin loads, registers an editor extension, updates settings, and unloads', async () => {
  const code = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const registered = { extensions: [], cleanups: [], tabs: [], saved: [] };
  class Plugin {
    app = {};
    async loadData() { return null; }
    async saveData(data) { registered.saved.push(data); }
    registerEditorExtension(extension) { registered.extensions.push(extension); }
    register(cleanup) { registered.cleanups.push(cleanup); }
    addSettingTab(tab) { registered.tabs.push(tab); }
  }
  class PluginSettingTab { constructor() {} }
  const listeners = new Map();
  const media = {
    matches: false,
    addEventListener(_name, handler) { listeners.set(handler, true); },
    removeEventListener(_name, handler) { listeners.delete(handler); },
  };
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'obsidian') return { Plugin, PluginSettingTab, Setting: class {} };
      if (name === '@codemirror/view') return { ViewPlugin: { fromClass: (klass) => klass } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    window: { matchMedia: () => media },
  });
  const PluginClass = module.exports.default;
  assert.equal(typeof PluginClass, 'function');
  const plugin = new PluginClass();
  await plugin.onload();
  assert.equal(registered.extensions.length, 1);
  assert.equal(registered.tabs.length, 1);
  assert.equal(listeners.size, 1);

  await plugin.updateSettings({ ...plugin.settings, durationMs: 160, enabled: false });
  assert.equal(registered.saved[0].durationMs, 160);
  assert.equal(registered.saved[0].enabled, false);
  plugin.onunload();
  for (const cleanup of registered.cleanups) cleanup();
  assert.equal(listeners.size, 0);
});

test('source and live preview editors animate independently and clean up on disable', async () => {
  const code = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  let ExtensionClass;
  const frames = new Map();
  let nextFrameId = 1;
  const mediaListeners = new Set();
  const media = {
    matches: false,
    addEventListener(_event, listener) { mediaListeners.add(listener); },
    removeEventListener(_event, listener) { mediaListeners.delete(listener); },
  };
  class Plugin {
    app = {};
    cleanups = [];
    async loadData() { return null; }
    async saveData() {}
    registerEditorExtension(extension) { ExtensionClass = extension; }
    register(cleanup) { this.cleanups.push(cleanup); }
    addSettingTab() {}
  }
  const module = { exports: {} };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'obsidian') return { Plugin, PluginSettingTab: class {}, Setting: class {} };
      if (name === '@codemirror/view') return { ViewPlugin: { fromClass: (klass) => klass } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    window: { matchMedia: () => media, devicePixelRatio: 1 },
    document: { createElement: () => makeCanvas() },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(callback) { const id = nextFrameId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    getComputedStyle(element) {
      return {
        borderLeftWidth: element?.native ? '2px' : '0px',
        borderLeftColor: 'rgb(255, 192, 203)',
        getPropertyValue: () => '#ffc0cb',
      };
    },
  });

  function makeCanvas() {
    const context = {
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
      globalAlpha: 1,
    };
    return {
      className: '', width: 0, height: 0, removed: false,
      style: {}, setAttribute() {}, getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 300 }),
      remove() { this.removed = true; },
    };
  }

  function makeEditor(mode) {
    const classes = new Set();
    const children = [];
    const dom = {
      mode, children,
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      closest: () => (mode === 'source' || mode === 'live-preview' ? {} : null),
      appendChild: (child) => children.push(child),
      addEventListener() {}, removeEventListener() {},
      querySelector: () => ({ native: true }),
    };
    return {
      dom, classes, hasFocus: true, composing: false,
      scrollDOM: { addEventListener() {}, removeEventListener() {} },
      state: { selection: { ranges: [{}], main: { empty: true, head: 0 } } },
      cursorX: 10,
      coordsAtPos() { return { left: this.cursorX, right: this.cursorX, top: 20, bottom: 40 }; },
    };
  }

  function runFrames(time) {
    const current = [...frames.entries()];
    for (const [id, callback] of current) {
      frames.delete(id);
      callback(time);
    }
  }

  const plugin = new module.exports.default();
  await plugin.onload();
  const source = makeEditor('source');
  const live = makeEditor('live-preview');
  const sourceExtension = new ExtensionClass(source);
  const liveExtension = new ExtensionClass(live);
  runFrames(1000); // Initial position is visible without a trail.
  assert.equal(source.dom.children.length, 1);
  assert.equal(live.dom.children.length, 1);

  source.cursorX = 100;
  sourceExtension.update({ selectionSet: true });
  runFrames(1016);
  assert.equal(source.classes.has('neovide-cursor-animating'), true);
  assert.equal(live.classes.has('neovide-cursor-animating'), false);

  await plugin.updateSettings({ ...plugin.settings, enabled: false });
  assert.equal(source.classes.has('neovide-cursor-animating'), false);
  assert.equal(frames.size, 0);

  await plugin.updateSettings({ ...plugin.settings, enabled: true });
  runFrames(2000);
  live.cursorX = 120;
  liveExtension.update({ selectionSet: true });
  runFrames(2016);
  assert.equal(live.classes.has('neovide-cursor-animating'), true);

  media.matches = true;
  for (const listener of mediaListeners) listener();
  assert.equal(live.classes.has('neovide-cursor-animating'), false);
  plugin.onunload();
  for (const cleanup of plugin.cleanups) cleanup();
  assert.equal(source.dom.children[0].removed, true);
  assert.equal(live.dom.children[0].removed, true);
  assert.equal(mediaListeners.size, 0);
});
