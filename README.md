# LoomRealm

LoomRealm 是一个通过只读游戏包声明运行拓扑、由 Main 编排独立 Subsystem Runtime，并由 Web Renderer 呈现 Subsystem 声明式 Render State 的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

## 设计文档

文档从上到下：产品目标 → 系统架构 → 正式契约 → 模块设计 → 实施计划。

推荐入口：

- [系统架构总览](./doc/10-architecture/system-overview.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Game Package v2](./doc/15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./doc/15-contracts/nodejs-launcher-profile-v1.md)
- [Subsystem Control Protocol v1](./doc/15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame / Call Protocol v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## 核心模型

```text
Game Entry
→ declare all required Subsystems
→ Main validates / launches Runtime Containers
→ Subsystem Control v1 binds identity / ready / shutdown
→ Frame / Call manages Main-owned call/input Context
→ Renderer uses Main committed InputTarget
→ User Input uses current Frame/Activation
→ Render uses independent Subsystem-owned identity
```

## 当前协议状态

```text
Game Package v2 / Desktop Launcher v1       Frozen
Subsystem Control Protocol v1               Frozen
Frame / Call Protocol v1 Batch A            Frozen
Frame / Call Protocol v1 Batch B            Frozen
Frame / Call Protocol v1 Batch C            Frozen
Frame / Call Protocol v1 Batch D            Frozen
Frame / Call Protocol v1 Batch E-F          Draft
```

Batch B 冻结七个 RPC：Main→Subsystem `initialize/activate/suspend/resume/close`，Subsystem→Main `call/return`。

Batch C 冻结正常 transaction：ordinary call 不依赖 reverse `frame.suspend`；call/return Response 先于 dependent reverse RPC；activate/resume ACK 先于 InputTarget publication；pre-commit 可 abort、post-commit 只能 forward recovery。

Batch D 冻结异常边界：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

全部 Frame Request 必须有 finite deadline；v1 不自动 retry/replay，不定义 operationId/idempotency journal。call target not-found/unavailable 和 initialize business rejection 可恢复；Frame identity/state/Activation/Stack/ownership divergence、Frozen protocol/schema error 与 ambiguous timeout Runtime-fatal。v1 无 caller-driven `frame.cancel`。

下一冻结目标是 **Frame / Call Batch E：Runtime failure deterministic Stack unwind**。

## Desktop Runtime 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
```

Desktop v1 使用 `nodejs` Launcher、安全 Installation Root entry、Host-selected Node、`shell=false`、token-before-spawn、Runtime Supervisor；Subsystem Control v1 冻结 hello/status/shutdown，Main 拥有 shutdown intent，`stopped` 只来自实际 Runtime termination observation。当前不定义 automatic restart / same-attempt reconnect / application heartbeat，也不宣称 Node.js OS sandbox。

Frame 不是 Process、业务状态 ownership 或 Render ownership 单元。Render lifecycle 不从 Frame suspend/close 推导。普通业务内容通过独立 Readonly Content API 获取。

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
