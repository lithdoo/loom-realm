# LoomRealm

LoomRealm 是一个通过只读游戏包启动、由程序主系统管理模块子系统调用栈，并使用 Web 渲染端呈现 Client Scope Tree 的运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` 子系统的纵向验证场景。

## 设计文档

文档按照从粗到细的顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

推荐入口：

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档分层与变更规则](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [模块设计目录](./doc/20-modules/README.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## 核心模型

```text
游戏包入口
→ 程序主系统创建初始 Frame
→ 模块子系统入栈并拥有业务状态
→ 活动子系统直接处理输入并发布 Scope
→ 子系统可以调用其他子系统入栈
→ 被调用子系统返回结果并出栈
→ 调用者恢复
```

程序主系统只管理调用关系、生命周期和通信通道；模块子系统管理自身业务状态和 Client State；渲染端维护 Store、DOM 和非权威表现状态。

## 文档站点

GitHub Pages 部署完成后：

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
