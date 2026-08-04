# LoomRealm

LoomRealm 是一个通过只读游戏包声明运行拓扑、由 Main 编排独立 Subsystem Runtime，并由 Web Renderer 呈现 Subsystem 声明式 Render State 的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

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
- [Subsystem Control Protocol v1](./doc/15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame / Call Protocol v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [模块设计目录](./doc/20-modules/README.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## 核心模型

```text
Game Entry
→ 声明全部 required Subsystem
→ Main 校验并启动 Runtime
→ Subsystem Control v1 完成 Runtime identity / ready / shutdown
→ Frame / Call 在 ready Runtime 上管理 call/input Context
→ Renderer 与每个 Subsystem 建立独立 Data Connection
→ User Input 按 current Frame/Activation 路由
→ Render 按独立 Render identity 发布和恢复
```

核心所有权：

```text
Main
    Runtime topology / shutdown / Supervisor
    Frame identity / caller / lifecycle / Stack
    Activation / Input Target

Subsystem
    authoritative business state
    Frame Input Context handling
    Render Context / lifecycle

Renderer
    read-only Main Control mirror
    Frame Input routing mirror
    Render Store / presentation
```

## 当前协议状态

```text
Game Package v2 / Desktop Launcher v1       Frozen
Subsystem Control Protocol v1               Frozen
Frame / Call Protocol v1 Batch A            Frozen
Frame / Call Protocol v1 Batch B            Frozen
Frame / Call Protocol v1 Batch C-F          Draft
```

Frame Batch A 冻结 identity/lifecycle/Activation；Batch B 冻结 exact RPC surface：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

关键规则：

- Frame lifecycle = `starting / active / suspended / closing / closed`；
- outcome = `completed / cancelled / failed`，与 lifecycle 分离；
- v1 无 Frame `ready / initialized / frame.status`；
- Frame/Activation Session 内不复用；
- Caller relationship Main-owned，不进入 Subsystem Frame wire；
- `frame.call` 不等待 Child 最终 outcome；
- Child outcome 经 `frame.return → Main → frame.resume` 交付；
- `frame.resume` 同时交付 outcome + replacement Activation；
- `frame.close` 无 reason；
- no `system.call / system.return / frame.result`。

下一冻结目标是 **Frame / Call Batch C：transaction / commit barrier / rollback**。

Frame 不是 Process、business state ownership 或 Render ownership 单元。Render lifecycle 不从 Frame suspend/close 推导。

## Desktop Runtime 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
```

Desktop v1：

- `launcher.type = nodejs`；
- `launcher.entry` 安全解析到 Installation Root 内；
- Host 选择 Node Runtime，Process creation 不经过 Shell；
- Bootstrap Token 在 spawn 前注册；
- Process 由 Runtime Supervisor 管理；
- Subsystem Control v1 冻结 `hello / status / shutdown`；
- Main 拥有正常 Runtime shutdown intent；
- `stopped` 只来自实际 Runtime termination observation；
- no application Control heartbeat / same-attempt reconnect / resume / automatic restart；
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
