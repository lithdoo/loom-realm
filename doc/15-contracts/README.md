# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：Evolving per-contract  
> 主要定义：current 跨角色协议/Profile、Game document contract、Platform launch profiles、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md)、[ADR 0023](../decisions/0023-user-input-v1-semantic-closure.md)、[ADR 0024](../decisions/0024-renderer-subsystem-data-connection-v1-semantic-closure.md)、[ADR 0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 最近复核：2026-09-03

契约层只保留跨角色/跨实现必须一致的可观察语义。Platform physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。

```text
Game Entry document != Main bootstrap model
Game topology != Platform executable binding
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

---

## 1. Current Contract Map

```text
Game Package v1
    Game Entry document
    Descriptor {key}
    initial target/input
        ↓ matching Launcher

Hostra Game Launcher / Node Runner Profile v1
PWA Game Launcher / Worker Runner Profile v1

Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Control v1 + Frame / Call v1

Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Readonly Content API v1                 Active / Normative / Evolving
```

Renderer Control v1 frozen by [ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)。

---

## 2. Game / Launcher / Main Boundary

Game Package只验证 logical document：

```text
formatVersion
initial subsystem/input
subsystems[{key}]
```

Matching Launcher消费 Game Entry并完成 current-platform manifest/join/resolution/security PREPARE；Concrete Platform安装 PlatformLaunchPlan；Main只接收：

```text
LogicalGameBootstrap
+
MainPlatform narrow capability view
```

Main不读取 GameEntry、formatVersion、PlatformLaunchPlan、module/path/URL、Node/Worker options。

---

## 3. MainPlatform Through M7

M7 Frozen target：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding
```

`RendererControlBinding.acquire(rendererControlToken,signal)`只建立 one candidate physical Renderer Control carrier；成功 `renderer.hello` 的 Main authority transaction才授予 current Renderer participant。

Platform只生成/交付 fresh opaque material与 physical carrier；Main拥有 Session/attempt/token/currentness authority。

---

## 4. Runtime Control + Frame / Call

Runtime Control owns concrete Control/Frame protocol mechanics：

```text
one UTF-8 JSON text application unit
one reader/dispatcher
one serialized writer
shared same-sender strict-monotonic Request IDs
finite deadlines
terminal/pending first-wins
Response causal barrier
no retry/replay/reconnect
```

Frame / Call v1 Frozen authority：

```text
Main owns Frame/Stack/Activation/InputTarget
ACK-before-publication
post-commit no rollback
timeout/loss ambiguity → Runtime failure
whole-suffix fixed-point unwind
fresh surviving Caller Activation
```

Renderer Control不得反向改变这些 semantics。

---

## 5. Renderer Control v1 — Frozen

[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md) frozen semantics：

```text
one current Renderer participant
one bounded candidate attempt
renderer.hello id=1
renderer.state full Snapshot
initial AuthorityRevision=1
pure Main authority projection
exact hello outbound preflight before current switch
atomic hello currentness/replacement
Renderer initial Snapshot install before later state
active old-peer retirement
0..1 inFlight + 0..1 pendingLatest
Control/Session terminal fail-closed
representation limits do not become Frame/Runtime business limits
```

M7 Main Snapshot fields：

```text
runtimes
stack / current Activation
inputTarget
dataAuthorities=[]   // real Main Data policy starts M8
```

No physical endpoint/token/Port/executable material enters Snapshot。

---

## 6. Renderer Data / Input / Render

Renderer Data Profile v1 frozen identity：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Data Connection：Session + current Renderer + subsystemKey + generation，same generation/profile sequential reconnect allowed；Data loss != Runtime failure。

User Input effective gate：

```text
current Main InputTarget
∩ current Data Connection
∩ mirrored active Frame/Activation
∩ Interest[F]
∩ Producer availability
```

Render Update owns independent Domain/revision/presentation replication；Frame close/Data loss不自动等于 Render Domain destroy。

---

## 7. Unified Carrier Policy

Current message-oriented application profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

WebSocket / MessagePort / MemoryCarrier共享 application value model；Structured Clone不扩大 protocol payload。

Foundation treats string opaque；Wire owns generic JSON representation；protocol/profile package owns domain validation/state mechanics。

---

## 8. Authority Summary

```text
Game Package
    Game document validation

Launcher / Concrete Platform
    Game+platform PREPARE / physical realization

Platform Ports
    narrow physical capabilities/facts

Runtime Control / Renderer Control / Data profile packages
    protocol mechanics only

Main
    Session / Runtime / Frame / Activation / InputTarget / DataAuthority
    Runtime credential + Renderer currentness/token/revision authority

Subsystem
    business/local Frame/Input/Interest/Render state

Renderer
    read-only Main mirror + local producer/presentation/data consumers
```

---

## 9. Current Implementation Order

```text
M6 Hostra Runtime vertical ✅
→ M7 Frozen Renderer Control design, implementation next
→ M8 Data authority/binding integration
→ M9 Desktop physical Data Broker
→ M10/M11 Input/Render
→ M12 Content
→ M13 business map
→ M14 Desktop Full E2E including Hostra physical Renderer Control
→ M15 PWA Runtime vertical
→ M16 PWA Renderer Control + full equivalence
```

M7 logical `RendererControlBinding` + deterministic MemoryCarrier semantic qualification is distinct from M14/M16 physical Renderer transport qualification。

---

## 10. Freeze Governance

Frozen contracts can reopen only for demonstrated correctness/security contradiction、cross-Frozen-contract conflict或 real consumer证明 Frozen capability无法表达必要语义。

不得因：

```text
代码复用
generic framework
future feature speculation
transport preference
目录/命名对称
```

重新设计 current-v1。
