# LoomRealm

LoomRealm 是一个以程序主系统调用栈、独立模块子系统进程、JSON-RPC 和通用 Client Scope Tree 为核心的运行平台设计项目。

第一阶段使用面向 RPG Maker XP / Pokémon Essentials v21.1 内容的地图子系统验证完整纵向链路。

## 核心模型

```text
入口文件
→ 程序主系统启动初始子系统并压栈
→ 子系统直接处理渲染端输入并发布 Scope
→ 子系统可以调用其他子系统入栈
→ 被调用子系统出栈并返回结果
```

详细设计见：

- [`doc/architecture/main-system-and-subsystems.md`](./doc/architecture/main-system-and-subsystems.md)
- [`doc/architecture/system-overview.md`](./doc/architecture/system-overview.md)

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
