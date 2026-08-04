# LoomRealm

LoomRealm 是一个通过只读游戏包声明运行拓扑、由 Main 编排独立 Subsystem Runtime，并由 Web Renderer 呈现 Subsystem 声明式 Render State 的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

## 设计文档

推荐入口：

- [系统架构总览](./doc/10-architecture/system-overview.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Subsystem Control Protocol v1](./doc/15-contracts/subsystem-control-lifecycle-protocol.md)
- [Frame / Call Protocol v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## 核心模型

```text
Game Entry
→ declare required Subsystems
→ Main validates / launches Runtime Containers
→ Subsystem Control binds identity / ready / shutdown / failed
→ Frame / Call manages Main-owned call/input Context
→ Main publishes committed InputTarget
→ Renderer routes current Frame/Activation input
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
Frame / Call Protocol v1 Batch E            Frozen
Frame / Call Protocol v1 Batch F            Next / Final
```

Batch B：exact seven Frame RPC。

Batch C：call/return acceptance transaction、Response-before-dependent-RPC、ACK-before-InputTarget publication、post-commit no rollback。

Batch D：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

finite deadline；no automatic retry/replay；recoverable rejection与 Runtime-fatal divergence/protocol error分离；无 caller-driven `frame.cancel`。

Batch E：

```text
Runtime failed
→ failedRuntimeKeys
→ lowest failed-runtime Frame = root
→ whole root..top suffix Top→Bottom unwind
→ failed Runtime Frames logical retire
→ healthy descendants best-effort close
→ cleanup failure expands failed set/root until fixed point
→ preserve accepted root outcome
   or failed(SUBSYSTEM_RUNTIME_FAILED)
→ fresh-resume final healthy Caller
   or Stack empty
```

Recovery不新增 `frame.abort/frame.unwind`、replay或 Frame resync。Runtime crash不能覆盖已 accepted terminal outcome；旧 Activation永不恢复。

下一步只有 **Batch F：Limits / Fixtures / Profile / Version Completion**，完成后整个 Frame / Call v1 转为 Active / Normative / Frozen。

## Desktop Runtime 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
```

Desktop v1 使用 `nodejs` Launcher、Host-selected Node、`shell=false`、token-before-spawn、Runtime Supervisor；Subsystem Control v1 管 hello/status/shutdown/failed，`stopped` 只来自实际 Runtime termination observation。当前不定义 automatic restart/same-attempt reconnect/application heartbeat。

Frame 不是 Process、业务状态 ownership 或 Render ownership 单元。Render lifecycle 不从 Frame suspend/close/unwind推导。业务内容通过独立 Readonly Content API 获取。

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
