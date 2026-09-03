# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：Evolving per-contract  
> 主要定义：current 跨角色协议/Profile、Game document contract、Platform launch profiles、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
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
Hostra Game Launcher / Node Runner Profile v1
PWA Game Launcher / Worker Runner Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
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

Game Package只验证 logical document；Matching Launcher完成 Game+current-platform PREPARE；Main只接收：

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
RendererControlBinding?   // optional physical capability
```

Optionality：

```text
RendererControlBinding absent
→ no Renderer Control attempt for that composition
→ Runtime/Frame Session remains valid

present
→ Binding establishes candidate carrier
→ renderer-control peer negotiates protocol v1
→ Main authenticates token / grants currentness
```

`RendererControlBinding.acquire(rendererControlToken,signal)`只建立 one candidate physical carrier；它不认证 token、不协商 protocol version、不决定 current Renderer。

Platform只生成/交付 fresh opaque material与 physical carrier；Main拥有 Session/attempt/token/currentness authority。

---

## 4. Runtime Control + Frame / Call

Runtime Control owns concrete Control/Frame protocol mechanics：one UTF-8 JSON text unit、one reader/dispatcher、one writer、strict sender IDs、finite deadlines、terminal/pending first-wins、Response causal barrier、no retry/replay/reconnect。

Frame / Call v1 Frozen：Main owns Frame/Stack/Activation/InputTarget；ACK-before-publication；post-commit no rollback；timeout/loss ambiguity→Runtime failure；fixed-point unwind；fresh surviving Caller Activation。

Renderer Control不得反向改变这些 semantics。

---

## 5. Renderer Control v1 — Frozen

[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)：

```text
optional physical capability availability
one current Renderer participant
one bounded candidate attempt when capability present
renderer.hello id=1
renderer-control peer owns protocolVersions validation/version selection
Main owns token authentication/currentness
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

M7 Main Snapshot：runtimes + stack/Activation + inputTarget + `dataAuthorities=[]`。

No physical endpoint/token/Port/executable material enters Snapshot。

---

## 6. Renderer Data / Input / Render

Renderer Data Profile v1 identity：`loomrealm.renderer-data/1 = Data Connection v1 + User Input v1 + Render Update v1`。

Data Connection：Session + current Renderer + subsystemKey + generation；Data loss != Runtime failure。

User Input effective gate future composition：Main InputTarget ∩ current Data Connection ∩ active Frame/Activation ∩ Interest[F] ∩ Producer availability。

Render Update owns independent Domain/revision/presentation replication；Frame close/Data loss不自动等于 Render Domain destroy。

---

## 7. Unified Carrier Policy

Current message-oriented application profiles统一：

```text
one carrier unit = one UTF-8 JSON text string
```

Foundation treats string opaque；Wire owns generic JSON representation；protocol package owns domain validation/state mechanics。

---

## 8. Authority Summary

```text
Game Package
    Game document validation

Launcher / Concrete Platform
    Game+platform PREPARE / physical realization

Platform Ports
    narrow optional/required physical capabilities/facts

Runtime Control / Renderer Control / Data profile packages
    protocol mechanics only

Main
    Session / Runtime / Frame / Activation / InputTarget / DataAuthority
    Runtime credential + Renderer token/currentness/revision authority

Renderer
    read-only Main mirror + local future Data/Input/Render consumers
```

---

## 9. Current Implementation Order

```text
M6 Hostra Runtime vertical ✅
→ M7 Frozen Renderer Control design, implementation next
→ M8 Data authority/binding
→ M9 Desktop Data Broker
→ M10/M11 Input/Render
→ M12 Content
→ M13 business map
→ M14 Desktop Full E2E + Hostra physical Renderer Control
→ M15 PWA Runtime vertical
→ M16 PWA Renderer Control + full equivalence
```

M7 logical optional `RendererControlBinding` + deterministic MemoryCarrier qualification is distinct from M14/M16 physical Renderer transport qualification。

---

## 10. Freeze Governance

Frozen contracts can reopen only for demonstrated correctness/security contradiction、cross-Frozen-contract conflict或 real consumer证明 Frozen capability无法表达必要语义。

不得因代码复用、generic framework、future speculation、transport preference、目录/命名对称重新设计 current-v1。