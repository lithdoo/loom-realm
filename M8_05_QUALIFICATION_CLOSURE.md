# M8 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：05  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md) → [M8 / 03](M8_03_DATA_ROLE_INTEGRATION.md) → [M8 / 04](M8_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md) · [Profile Conformance](doc/15-contracts/renderer-data-profile-conformance-v1.md)  
> 目标：定义唯一 M8 qualification matrix；只关闭 DataAuthority + role binding/current Data lifetime，不借 M8 提前实现 M9 Broker physical provisioning、M10 Input 或 M11 Render。

> **M8 closure = Main 产生 logical DataAuthority，Renderer/Subsystem 通过窄 Platform Bindings获得 paired current carrier，并由 real `@loomrealm/data` peers安全安装/退役；Data failure不改变 Runtime/Frame/Control authority。**

---

## 1. M8 Closure Scope

必须实现：

```text
@loomrealm/main
    DataAuthority allocation/revocation
    generation/profile policy
    non-empty Renderer Snapshot projection

@loomrealm/platform-ports
    RendererDataBinding
    SubsystemDataBinding

@loomrealm/subsystem/host
    optional Data binding + current peer lifetime

@loomrealm/renderer
    Control-authority-driven Data reconciliation

real @loomrealm/data consumers on both roles

deterministic paired MemoryCarrier vertical
```

不属于 M8：

```text
Desktop DataConnectionBroker / ticket / Runner provisioning IPC / Data WS
PWA MessageChannel provisioning
InputManager / Input producer/listener
RenderManager / Render Store / Domain API
Content
Hostra/PWA physical equivalence
```

---

## 2. Abstraction Budget

允许：

```text
one Main generation high-water fact per subsystem
one generation fact on the current Runtime instance
RendererDataBinding
SubsystemDataBinding
Subsystem current Data peer + one pending acquire
Renderer per-subsystem current peer + one pending acquire
small deterministic paired Binding fixture
```

禁止：

```text
DataAuthorityManager
DataConnectionRegistry framework
GenericDataBinding / UniversalConnection
public DataConnectionBroker interface in M8
ReconnectManager / retry scheduler
BindingError hierarchy
Data Store / ObserverHub / EventBus
InputManager / RenderManager placeholders
second DataCurrentBinding DTO shared across packages
transport endpoint/ticket DTO in role packages
application replay/resume cursor
lease/heartbeat/currentness protocol
```

---

## 3. Main Evidence

必须证明：

```text
not-ready → no authority
ready → S/G1/loomrealm.renderer-data/1
logical authority changes advance Renderer revision exactly once
Data transport loss alone does not change Main authority/revision
stopping/failure/replacement revokes authority
fresh Runtime for same S uses G2 > G1
Renderer replacement alone keeps G
no generation reuse/wrap
no physical material in Main/Snapshot
no shadow Data authority registry
```

---

## 4. Binding Evidence

必须证明：

```text
Renderer acquire is exact S/G/P driven
Subsystem Binding is Runtime-scoped and returns only G/P + carrier
one logical pair → two matching endpoints
pending acquire does not create role current state
abort prevents late installation
non-abort rejection does not cause busy retry
successful current peer terminal can lead to one fresh acquire while authority remains current
Binding absence remains valid
platform-ports stays Foundation-only
```

Binding不认证/分配 Main authority，不解析 `@loomrealm/data` application messages。

---

## 5. Role Evidence

Subsystem：

```text
ready + Binding → real SubsystemDataPeer
old terminal identity-safe
Data terminal does not fail Runtime/Frame
fresh carrier creates fresh peer
```

Renderer：

```text
Snapshot add authority → acquire/install
remove/replace authority → retire
late stale acquire closed
Control replacement/terminal aborts and retires all child Data
old Control/Data terminal cannot clear new state
Data terminal alone cannot clear Control
same S/G/P fresh carrier supported
```

Role实现不得复制 `@loomrealm/data` reader/writer/schema/terminal mechanics。

---

## 6. Vertical Evidence

Production path必须是：

```text
Main Runtime ready
→ Main DataAuthority commit
→ real Renderer Control publication
→ Renderer Binding acquire
+
Subsystem Binding acquire
→ deterministic paired MemoryCarrier
→ real RendererDataPeer / SubsystemDataPeer
```

必须覆盖：

```text
initial installation
late G1 acquisition after revoke
same-generation carrier loss/replacement
G1→G2 authority replacement
Renderer A→B replacement with same G
Binding absent
Binding terminal
Session terminal
Data failure isolation
```

禁止 test直接写 Main private authority、直接构造 current Renderer Snapshot、直接注入 role current peer。

---

## 7. `@loomrealm/data` Evidence Boundary

Existing package-local qualification保持 green：

```text
single reader
single serialized writer
role direction/static validation
terminal first-wins
no retry/replay
fresh peer has no inherited writer/reader state
```

M8只新增“真实 role consumer”证据。

以下仍不在 M8 claim：

```text
fresh Desired Interest republish
Input State/Event/Reset effective semantics
fresh Render registry/snapshot publication
Render revision/patch/event stateful semantics
Hostra WebSocket vs PWA MessagePort abstract trace equivalence
```

因此 M8 complete 不得表述为“Renderer Data Profile fully conformant”。

---

## 8. Dependency Evidence

M8 target：

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/data depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/subsystem/host depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/data

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
    @loomrealm/platform-ports
    @loomrealm/data
```

禁止 Main↔Renderer reverse dependency、role→concrete Platform、platform-ports→protocol/role。

---

## 9. Regression Evidence

必须保持 M1–M7，特别检查：

```text
M6 Hostra Runtime-only path remains valid without fake Data Binding
M7 Renderer Control capability-absent/present/replacement semantics unchanged
Renderer Control dataAuthorities representation remains exact
Data failure cannot become Runtime failure
Frame call/return/unwind semantics unchanged
Session terminal still owns outer cleanup
@loomrealm/data package-local tests remain green
```

---

## 10. Implementation Checklist

```text
[ ] Main DataAuthority allocation/revocation implemented
[ ] generation monotonic high-water implemented
[ ] profile fixed to loomrealm.renderer-data/1
[ ] non-empty Renderer Snapshot projection implemented
[ ] Data transport loss leaves Main authority unchanged

[ ] RendererDataBinding implemented
[ ] SubsystemDataBinding implemented
[ ] abort / terminal settlement implemented
[ ] no generic Binding/Broker framework introduced

[ ] Subsystem optional Data integration implemented
[ ] Renderer Control-driven Data reconciliation implemented
[ ] stale acquire/current terminal identity-safe
[ ] Control parent terminal retires Renderer Data
[ ] Data terminal does not mutate Control/Runtime/Frame authority

[ ] deterministic paired MemoryCarrier vertical passes
[ ] same-generation fresh carrier passes
[ ] G1→G2 replacement passes
[ ] Renderer A→B same-G replacement passes
[ ] capability-absent paths pass

[ ] no InputManager/RenderManager placeholder abstractions
[ ] M1–M7 regression green
[ ] build/type/test/pack clean
```

---

## 11. Documentation Closure After Implementation

Implementation qualification完成后，再新增/更新：

```text
doc/30-implementation/m8-qualification.md
README current implementation status
phase-1-delivery-plan M8 status
package/module docs current status
```

Frozen contracts不因实现完成改变语义。

---

## 12. Freeze Statement

M8只关闭 logical DataAuthority + role-facing current Data connection integration。任何需要 endpoint/ticket/IPC/WebSocket、Input business state、Render business state或跨平台 physical equivalence 的实现都必须留给 M9/M10/M11/M14/M16，而不是通过 M8 新增泛化 abstraction提前吸收。
