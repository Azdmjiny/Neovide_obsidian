# Neovide Cursor Trail for Obsidian

把 [Neovide-Cursor](https://github.com/30d98f9b2/Neovide-Cursor) 的四角弹簧光标拖尾移植到 Obsidian 桌面版 Markdown 编辑器。支持源码模式和实时预览模式；每个编辑器面板独立运行，切换文件或面板时不会跨面板飞行。

## 安装

上架后，在 Obsidian 桌面版的“设置 → 第三方插件 → 浏览”中搜索 **Neovide Cursor Trail** 并安装。

上架前可手动安装：从 GitHub Release 下载 `main.js`、`manifest.json`、`styles.css`，放入笔记库的 `.obsidian/plugins/neovide-cursor-trail/`，然后在“设置 → 第三方插件”中启用本插件。

插件目录至少需要 `manifest.json`、`main.js` 和 `styles.css`。不需要 VS Code 或 Custom CSS and JS Loader。

## 设置

在插件设置页可调整启用状态、动画时长、拖尾强度、透明度、辉光以及颜色。颜色默认跟随当前主题的编辑器光标；也可以输入自定义的六位十六进制颜色。系统开启“减少动态效果”时会自动暂停动画。

## 适用范围

- 仅 Obsidian 桌面端 Markdown 编辑器，包括源码模式与实时预览模式。
- 一次只绘制当前编辑器的主光标；选择文本、多光标、输入法组合输入、滚动、失焦时保留原生光标。
- Canvas、搜索框、属性输入框、阅读模式及移动端不绘制拖尾。

## 从源码构建

需要 Node.js 18 或更新版本：

```sh
npm install
npm run build
npm test
```

构建产物为根目录的 `main.js`，安装时连同 `manifest.json`、`styles.css` 一起复制到插件目录。

## 发布

发布前确保 `package.json`、`manifest.json` 和 `versions.json` 的版本号一致。将源码推送到公开 GitHub 仓库后，推送与清单版本完全相同的标签（例如 `0.1.0`，不带 `v` 前缀）。GitHub Actions 会构建、测试并创建带有三个插件文件的草稿 Release。填写发布说明并公开发布后，在 [Obsidian 社区目录](https://community.obsidian.md/plugins) 登录、关联 GitHub 账号并提交仓库地址。插件审核通过后才会出现在应用内搜索结果中。

## 致谢与许可

四角弹簧模型和运动参数改编自 [30d98f9b2/Neovide-Cursor](https://github.com/30d98f9b2/Neovide-Cursor)，原作者 [LengineerC](https://github.com/LengineerC)。本插件由 Azdmjiny 维护，基于 MIT 许可证发布；原项目的版权声明保留在 `LICENSE` 中。Obsidian 接入、配置和生命周期管理为本移植版本新增。
