# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-17

实施层描述如何落地当前协议；内部机制可以调整，但不得改变上层 authority/lifecycle/recovery 语义。

## 当前 Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish boundary 的权威来源
- [仓库与目录方案](./repository-layout.md) — monorepo 物理布局与 workspace 依赖规则
- [测试策略](./testing-strategy.md)
- [第一阶段交付计划](./phase-1-delivery-plan.md)

## 当前实施前提

```text
Game Package v1
Desktop Node.js Launcher Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Renderer Control v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

没有 Renderer Component Profile、Standard Input Mapping Profile、Content Access Profile、Range Profile、Event FIFO Profile 或 Desktop/PWA Data Bootstrap application protocol。

协议当前已足够支撑实现；剩余 payload/limits/conformance 允许在开发过程中由真实 use case 驱动继续细化，而不是阻塞 vertical slice。

## 分包基线

实施默认采用：

```text
能力一包
角色一包
技术 Adapter 一包
平台只组合
协议版本与 package semver 分离
```

关键边界：

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
```

因此不再采用“每份协议一个 npm package”，也不默认建立大而全的 `host-desktop` / `host-pwa` 公共包。

当前目标包族：

```text
contract/capability
    @loomrealm/wire
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/data
    @loomrealm/content
    @loomrealm/game-package

runtime/role
    @loomrealm/main
    @loomrealm/subsystem
    @loomrealm/renderer
    @loomrealm/content-service

technical adapter
    @loomrealm/launcher-node
    @loomrealm/transport-websocket
    @loomrealm/transport-messageport
    @loomrealm/content-fs
    @loomrealm/content-http
    @loomrealm/content-service-worker

business
    @loomrealm/map
    @loomrealm/map-essentials

composition roots
    apps/desktop
    apps/pwa
    apps/cli
```

具体职责、依赖和发布原则见 [独立分包与发布架构](./package-architecture.md)。

## 协议设计成熟度与实施含义

详细链路目的、成熟度和剩余协议工作以 [正式契约目录 · 链路协议设计进度](../15-contracts/README.md#11-链路协议设计进度) 为 source of truth。

这里的百分比表示**协议设计成熟度**，不是代码实现完成度、测试覆盖率或发布进度。

| 协议 | 设计成熟度 | 对实施阶段的含义 |
|---|---:|---|
| Game Package v1 | ≈95% | schema/topology 已稳定，可实现 validator/loader |
| Desktop Node.js Launcher v1 | 100% / Frozen | 可直接实现 Launcher/Supervisor |
| Subsystem Control v1 | ≈95% | wire/lifecycle 已基本稳定 |
| Runtime Control Application Profile v1 | ≈95% | Control/Frame 组合规则可直接落地 |
| Frame / Call v1 | 100% / Frozen | 核心调用栈实现不再等待设计 |
| Main ⇄ Renderer Control v1 | ≈95% | authority snapshot 模型可实现并在实现中做 Frozen review |
| Data Connection v1 | ≈95% | lifecycle/identity 已闭合 |
| User Input v1 | ≈80–85% | Core 可实现；standard payload 随真实输入路径继续闭合 |
| Render Update v1 | ≈85–90% | Registry/Snapshot/Patch/Event 可进入原型，limits 随实现收敛 |
| Content API v1 | ≈85–90% | 核心 HTTP/Fetch 语义足够实现 |

整体协议架构成熟度粗略 ≈90%。工作重心从“继续设计协议”转为“实现 + executable conformance + 实现驱动细化”。

## Runtime / Frame

```text
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1
```

关键约束：

```text
Control hello selects v1
Frame v1 statically bound
hello before Frame operation
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready has no Data endpoint
```

Frame v1 已直接包含 suspend provenance：child-call suspension 可通过对应 Child outcome + fresh `frame.resume` 恢复；administrative `frame.suspend` 没有 generic resume。

## Renderer / Data / Input / Render

Renderer Control：Main 发布 full committed Authority Snapshot，不携 endpoint/ticket/MessagePort。

Data Connection：

```text
Renderer Control DataAuthority
→ technical adapter establishes carrier
→ Data Connection current/retired
```

Desktop/PWA 可分别选择 WebSocket/MessagePort adapter，但这些 adapter 只负责 carrier，不拥有 Data authority。

User Input：

```text
InputTarget/Activation
∩ Interest
∩ Producer availability
```

标准 keyboard/pointer/gamepad canonical payload 属于 User Input v1；DOM/OS/device adapter 属于 Renderer implementation。

Render Update：

```text
Registry
Snapshot(revision)
Patch(R→R+1, insert/remove/move/update)
Event
```

`tag` 是 opaque string；Renderer 如何映射/呈现属于实现。

## Content

Content API 只定义 logical readonly HTTP/Fetch semantics。

具体 filesystem、HTTP、Service Worker/OPFS 能力通过 `content-*` adapter 实现；Desktop bearer 注入和 PWA same-origin wiring 留在 composition root/adapter，不形成新的 application protocol。

## Conformance

[测试策略](./testing-strategy.md) 覆盖 Control、Runtime Profile、Frame、Renderer Control、Data Connection、User Input、Render Update、Content。

正式兼容判断只检查跨实现必须一致的行为，不检查：

```text
Component Factory/Registry
DOM/OS mapping implementation
Host token/ticket/Port delivery mechanism
queue concrete capacity/drop preference
Patch-vs-Snapshot heuristic
cache/index implementation
```

可复用协议 fixture/helper 应跟随最接近的 capability package，通过 `*/testing` subpath 提供；仓库级 E2E/test Subsystem 不发布。

## 实施原则

1. 先建立 package dependency graph 和最小 public surface，再实现 vertical slice；
2. Current Contract 与实现并行推进，真实互操作缺口才回补 contract；
3. 不为未实现历史设计保留 fallback/dual-stack；
4. Launcher/Control/Frame/Renderer Control/Data/Input/Render/Content domain boundary 不因 package 合并而合并；
5. Runtime `ready` 不得成为 Data endpoint discovery；
6. Main RuntimeFailureUnwindCoordinator 是唯一 Stack recovery authority；
7. Renderer/Transport 不得计算 unwind root 或恢复旧 Activation；
8. technical adapter 只负责实际技术绑定，不成为 application authority；
9. Desktop/PWA 作为 composition root，默认不成为大而全公共 package；
10. npm semver 与 protocol version 分离；
11. bounded implementation policy 不应为了统一数值被错误升级成协议；
12. Tracking 文档不定义正式 wire 行为。

## 当前实施顺序

```text
workspace / package skeleton
    ↓
wire + game-package
    ↓
runtime-control + main + subsystem
    ↓
launcher-node + WebSocket adapter
    ↓
Frame / Control vertical slice + conformance
    ↓
renderer-control + data + renderer
    ↓
content + content-service + Desktop content adapters
    ↓
loom.map
    ↓
apps/desktop vertical slice
    ↓
MessagePort / Service Worker adapters + apps/pwa
```

协议 payload/limits 在对应实现落地时同步细化，不再作为启动开发的前置阻塞。

治理原则：**只协议化必须互操作的事实；只拆分有独立能力、消费者和发布价值的 package。**
