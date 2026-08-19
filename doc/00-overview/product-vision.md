# LoomRealm 产品设计总览

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：方向稳定，当前 v1在首次实现冻结前允许直接收口  
> 主要定义：产品目标、适用范围、跨平台原则、第一阶段验收方向  
> 最近复核：2026-08-19

本文是 LoomRealm 最高层产品事实源。下层架构、协议、模块和实施文档不得通过实现便利反向改变这里的产品边界。

---

## 1. 产品目标

LoomRealm 是一个：

> **由只读 Game Package 声明业务 Subsystem topology，以 platform-neutral Subsystem Definition Module 表达业务实现，由 Main 管理运行/Frame authority，并由 Hostra Desktop / PWA Platform Composition 在不同物理环境中运行同一业务语义的模块化游戏运行平台。**

目标：

- 地图、菜单、对话、战斗等业务能力拆成边界明确的 Subsystem；
- Game Package显式声明当前 Session完整 Subsystem集合；
- 业务 Subsystem不依赖 Desktop/PWA/Transport；
- Main拥有唯一 Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority；
- Frame只承担调用与 ordinary input authority，不拥有 Render lifecycle；
- Subsystem拥有自身 business state、Input Interest与 Render Domain authoritative state；
- Renderer只镜像 Main authority、生产输入、复制/呈现 Render State，不成为 business authority；
- Platform负责 Process/Worker/Socket/Port/Window/Content/Provisioning physical topology，但不获得 application authority；
- Hostra Desktop与 PWA 对同一个 Game Package + Definition Module得到等价 logical outcome；
- 先通过可执行纵向链路证明边界，再扩展 Save、Sandbox、更多 Runtime等横向能力。

---

## 2. 总体链路

```text
Readonly Game Package
    │
    │ SubsystemDescriptor { key, module }
    ▼
LoomRealm Main
    │ logical Runtime / Frame / Data authority
    ▼
Platform Composition
    │
    ├── Hostra Desktop → Node Subsystem Runner
    └── PWA            → Worker Subsystem Runner
                         │
                         ▼
              same Definition Module
                         │
                         ▼
                @loomrealm/subsystem
                         │
             business / Input / Render / Content
```

Renderer：

```text
Main committed authority
        ↓
Web Renderer
        ⇅ Data Profile
Subsystem Runtime
```

---

## 3. Game Package / Business Artifact

Game Package v1只声明：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

```text
key
    logical Runtime identity

module
    package-local platform-neutral .mjs Subsystem Definition Module
```

Game Package不声明：

```text
Node/Worker launcher type
process argv/env
WebSocket/MessagePort
Platform provisioning
Data endpoint/ticket
```

Definition Module default export `SubsystemDefinitionFactory`，只表达业务。

---

## 4. Platform / Runner

Business module与 physical Runtime entry分离：

```text
same Definition Module
    ├── Hostra Node Runner
    └── PWA Worker Runner
```

Host-owned Runner负责：

```text
load/validate Definition Module
construct role-local Platform Ports
enter @loomrealm/subsystem host runtime
```

Platform差异停在 Runner/adapter/composition层，不传播到 business code。

---

## 5. Runtime / Frame Authority

Main管理：

```text
Session
Runtime public lifecycle
Frame identity/caller/lifecycle/outcome/Stack
Activation
InputTarget
Frame transaction/failure unwind
DataAuthority
```

Runtime Control：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Profile v1
```

```text
launch != connected != identified != ready
ready != Data Connection exists
```

Frame transaction timeout/loss ambiguity不得 retry/rollback，而进入 Runtime failure。

---

## 6. Author SDK Boundary

业务 author只使用：

```text
SubsystemScope
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

Frame outcome明确：

```text
completed
cancelled
failed
```

`frame.call()`只有明确 pre-commit recoverable rejection可以作为 catchable error继续 current Activation；Runtime-fatal/ambiguous path不能重新进入业务 continuation。

这保证高层 ergonomics不会绕过底层 authority/commit semantics。

---

## 7. User Input

ordinary input最终由以下交集产生：

```text
Main InputTarget(S,F,A)
× Subsystem Interest[F]
× Renderer Producer(C)
× current matching Data Connection
```

Interest是 Frame-scoped configuration，不是 authority。

```text
fresh Activation
    may reuse Interest config
    never reuse old Input State/Event

fresh Data carrier
    remote Interest/State start empty
    republish/rebaseline
```

---

## 8. Render

Subsystem拥有 `0..N Render Domains`。

```text
Frame create/close/suspend
    does not create/destroy/hide Render Domain

Data carrier replacement
    does not destroy authoritative Domain
```

Renderer复制 declarative authoritative state并映射到 DOM/Canvas/WebGL等本地 presentation。

---

## 9. Renderer Data

Main发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Platform DataConnectionBroker建立实际 Renderer/Subsystem endpoints；endpoint/ticket/Port不是 authority。

Runtime已经 ready 后的 Data material通过 Platform provisioning path动态交付，不污染 Runtime Control/Renderer Control/business payload。

Data provisioning/loss本身不失败 Runtime、不 unwind Frame。

---

## 10. Cross-platform Messaging

当前 message-oriented profiles统一：

```text
one application unit = one UTF-8 JSON text string
```

因此 WebSocket与 MessagePort拥有相同 application value model；Structured Clone只用于 Platform bootstrap/Port transfer。

跨平台 equivalence比较 logical authority/outcome，而不是物理 trace。

---

## 11. Content / Execution Boundary

Game Package运行期间只读。

必须区分：

```text
Definition Module executable capability
    trusted Runner加载已声明/验证 module

Content API
    readonly logical data/resource access
```

Content API不得提供任意 executable path/capability；Render/business payload不得携 physical path/credential。

Desktop trusted executable JavaScript当前不等于 OS sandbox。

---

## 12. 第一阶段目标

Phase 1必须跑通同一个 `loom.map` Definition Module：

```text
Game Package {key,module}
→ required Runtime Runner ready
→ initial Frame
→ map Content load
→ Frame-scoped input
→ world movement/collision/Portal
→ declarative Render
→ nested Subsystem call/return
→ Data reconnect
→ Renderer reload
→ shutdown
```

并分别在：

```text
Hostra Desktop
PWA
```

得到等价 logical outcome。

Pokémon Essentials v21.1 / RPG Maker XP兼容仅是 `loom.map` 的验证 corpus，不是 LoomRealm长期核心格式。

---

## 13. 长期设计原则

1. **状态唯一权威**：每份 authoritative state只有一个 owner；
2. **业务与 Platform分离**：Definition Module不探测运行平台；
3. **Platform physical ownership不是 application authority**；
4. **协议域分离**：Runtime Control / Renderer Control / Data / Input / Render / Content各自拥有 identity/lifecycle/recovery；
5. **Frame 与 Render/Data 解耦**；
6. **能力通过 ports注入，不通过 service locator/global context寻找**；
7. **Business API隐藏 protocol mechanics，但不能弱化 protocol semantics**；
8. **Game Package只读，execution capability与 ordinary Content capability分离**；
9. **Protocol/package/process/platform boundary互不等价**；
10. **主要定义依赖保持单向 DAG**；
11. **先完成 cross-platform vertical slice，再扩横向能力**；
12. **没有真实兼容义务时不为旧草案制造虚假版本负担；有真实兼容承诺后严格治理版本。**

---

## 14. 当前非目标

- 完整 RPG/Pokémon产品功能；
- Game content editor；
- Save System；
- untrusted executable sandbox / publisher trust；
- automatic Runtime restart/checkpoint；
- lazy/optional Subsystem；
- multiple Runtime instances per key；
- remote Runtime / multiple Renderer；
- Frame replay/migration/caller-driven cancellation；
- Render history replay/cross-Domain transaction；
- arbitrary plugin execution；
- 为预测性复用创建 platform/Runner mega-package。

---

## 15. 发展方向

当前主线：

```text
architecture/contracts closed enough
→ implement foundation/wire
→ Definition Module + Subsystem SDK
→ Runtime/Frame vertical slice
→ Desktop Runner/Control
→ Renderer/Data Profile/Broker
→ Input/Render/Content
→ loom.map
→ Desktop E2E
→ PWA Runner/provisioning
→ PWA E2E
→ abstract-trace equivalence
```

未来能力只有在当前 vertical slice证明后按真实需求增加。

---

## 16. 阅读顺序

1. 本文；
2. [文档分层与变更规则](./document-governance.md)；
3. [系统架构总览](../10-architecture/system-overview.md)；
4. [平台组合系统](../10-architecture/platform-composition-system.md)；
5. Runtime hosting / stack / communication / rendering / subsystem architecture；
6. [运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)；
7. [正式契约目录](../15-contracts/README.md)；
8. [模块设计目录](../20-modules/README.md)；
9. [实施计划目录](../30-implementation/README.md)。

专题文档与本文冲突时，必须先更新本层产品方向，再向下传播。