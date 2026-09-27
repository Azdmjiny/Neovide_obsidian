# Neovide Cursor Trail

A smooth, four-corner spring cursor trail for Obsidian's desktop Markdown editor, adapted from [Neovide-Cursor](https://github.com/30d98f9b2/Neovide-Cursor). It works in both Source mode and Live Preview. Each editor pane animates independently, so the trail does not fly between files or panes.

## Installation

Once the plugin is listed in the community directory, open **Settings → Community plugins → Browse** in Obsidian, search for **Neovide Cursor Trail**, and install it.

Until then, you can install it manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](https://github.com/Azdmjiny/Neovide_obsidian/releases/latest).
2. Put the three files in `<your vault>/.obsidian/plugins/neovide-cursor-trail/`.
3. Enable **Neovide Cursor Trail** under **Settings → Community plugins**.

The plugin does not require VS Code or Custom CSS and JS Loader.

## Settings

You can adjust the animation duration, trail strength, opacity, glow, and color, or turn the effect off. By default, the trail follows the current theme's editor cursor color. You can also enter a custom six-digit hex color. The animation pauses when your system's **Reduce motion** setting is enabled.

## Scope

- Works only in the desktop Markdown editor, in Source mode and Live Preview.
- Animates the primary cursor only. The native cursor remains visible while selecting text, using multiple cursors, composing text with an input method, scrolling, or moving focus away from the editor.
- Does not animate cursors in Canvas, search fields, property fields, Reading view, or Obsidian mobile.

## Build from source

Use Node.js 22 or newer to build and run the tests:

```sh
npm ci
npm run build
npm test
```

The build writes `main.js` to the repository root. Install it together with `manifest.json` and `styles.css`.

## Release process

Keep the versions in `package.json`, `manifest.json`, and `versions.json` in sync. Push a tag that exactly matches the version in `manifest.json` (for example, `0.1.0`, without a `v` prefix). GitHub Actions builds and tests the plugin, then creates a draft release containing the three installable files. Add release notes and publish the release. For the first community directory submission, sign in at [Obsidian Community](https://community.obsidian.md), connect your GitHub account, and submit this repository. The plugin becomes searchable in Obsidian after the directory accepts it.

## Credits and license

The four-corner spring model and motion parameters are adapted from [30d98f9b2/Neovide-Cursor](https://github.com/30d98f9b2/Neovide-Cursor) by [LengineerC](https://github.com/LengineerC). Azdmjiny maintains this plugin and added its Obsidian integration, settings, and lifecycle management. The plugin is licensed under MIT; the original copyright notice is preserved in [LICENSE](LICENSE).
