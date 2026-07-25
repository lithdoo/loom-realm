# LoomRealm

LoomRealm 是面向 RPG Maker XP / Pokémon Essentials v21.1 游戏内容的运行时设计项目。

## 文档站点

GitHub Pages 部署完成后，文档地址为：

- https://lithdoo.github.io/loom-realm/

文档源文件位于 [`doc/`](./doc/README.md)，使用 VitePress 构建。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run docs:dev
```

生产构建与预览：

```bash
npm run docs:build
npm run docs:preview
```

检查 Markdown 内部链接：

```bash
npm run docs:check-links
```

## 部署

合并到 `main` 后，GitHub Actions 会构建 `doc/.vitepress/dist` 并部署到 GitHub Pages。

仓库首次启用时，需要在 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
