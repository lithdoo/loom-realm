# LoomRealm

LoomRealm 是一个通过只读游戏包声明运行拓扑、由 Main 编排独立 Subsystem Runtime，并由 Web Renderer 呈现 Subsystem 声明式 Render State 的模块化游戏运行平台设计项目。

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
- [Game Package v2 Bootstrap / Descriptor](./doc/15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./doc/15-contracts/nodejs-launcher-profile-v1.md)
- [模块设计目录](./doc/20-modules/README.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## 核心模型

```text
Game Entry
→ 一次声明全部 Subsystem Descriptor
→ Main 校验完整 Descriptor 集合
→ Desktop Main 启动并监督每个 required Subsystem Process
→ Subsystem 主动连接 Main，完成 hello / ready
→ Main 在已 ready Runtime 上管理 Frame / Call / Activation
→ Renderer 与每个 Subsystem 建立独立 System Data Connection
→ User Input 按 Frame/Activation 路由
→ Render 按独立 Render identity 发布和恢复
```

核心所有权：

```text
Main
    Session / Runtime topology
    Frame Stack / Activation / Input Target

Subsystem
    authoritative business state
    Frame input handling
    Render contexts / Render lifecycle

Renderer
    Render Store / presentation
    Frame input routing mirror
    non-authoritative local presentation state
```

Frame 是调用和普通输入上下文，不是 Process、业务状态或 Render ownership 单元。Render 生命周期不从 Frame suspend / close 推导。

Desktop Bootstrap 明确区分：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

当前 Desktop v1：

- `launcher.type = nodejs`；
- `launcher.entry` 必须安全解析到 Installation Root 内；
- Host 选择 Node Runtime，Process creation 不经过 Shell；
- Bootstrap Token 在 Process spawn 前注册；
- Process 由 Runtime Supervisor 管理；
- failed Runtime 不自动 restart；
- executable Subsystem JavaScript 属于 trusted code，当前不宣称 Node.js OS sandbox。

普通业务内容通过独立 Readonly Content API 获取；Content API 不暴露任意物理路径或执行能力。

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
