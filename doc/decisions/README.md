# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、替代关系与重新评估条件  
> 最近复核：2026-08-19

ADR记录“为什么这样设计”；当前可实现事实仍以 `00-overview`、`10-architecture`、`15-contracts` 为准。Superseded ADR只保留历史，不形成第二份 current contract。

---

## 决策列表

1. [ADR 0001：每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [ADR 0002：平台 Transport Binding](./0002-platform-transport-profiles.md)
3. [ADR 0003：统一只读 Content API](./0003-readonly-content-api.md)
4. [ADR 0004：Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)
5. [ADR 0005：Game Entry 声明 Subsystem Topology](./0005-game-entry-subsystem-launchers.md)
6. [ADR 0006：Frame 与 Render 生命周期解耦](./0006-frame-render-decoupling.md)
7. [ADR 0007：Subsystem Descriptor MVP（Superseded）](./0007-subsystem-descriptor-mvp.md)
8. [ADR 0008：Desktop Node.js Direct-entry Launcher（Superseded）](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [ADR 0009：Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md)
10. [ADR 0010：Frame / Call v1 Batch A](./0010-freeze-frame-call-protocol-v1-batch-a.md)
11. [ADR 0011：Frame / Call v1 Batch B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [ADR 0012：Frame / Call v1 Batch C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [ADR 0013：Frame / Call v1 Batch D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [ADR 0014：Frame / Call v1 Batch E](./0014-freeze-frame-call-protocol-v1-batch-e.md)
15. [ADR 0015：Frame / Call v1 Batch F / Freeze](./0015-freeze-frame-call-protocol-v1-batch-f.md)
16. [ADR 0016：协议边界清理与 Data Authority](./0016-protocol-boundary-cleanup.md)
17. [ADR 0017：平台是系统级 Composition Boundary](./0017-system-level-platform-composition.md)
18. [ADR 0018：首次实现前直接收口当前 v1](./0018-preimplementation-v1-closure.md)

---

## 当前替代 / 修正关系

```text
ADR 0004 Render lifetime assumption
    → ADR 0006 supersedes Frame-owned Render lifecycle

ADR 0005
    → retains Game Entry topology declaration
    → old launcher declaration portion updated by ADR 0018

ADR 0007
    → Superseded by ADR 0018

ADR 0008
    → Superseded by ADR 0018

ADR 0009
    → current Control lifecycle-only decision
    → Data provisioning explicitly remains outside Control

ADR 0010–0015
    → Frame / Call v1 semantic freeze

ADR 0015 old PWA structured-object transport mapping
    → one-time preimplementation correction by ADR 0018
    → current mapping = UTF-8 JSON text string

ADR 0016
    → current DataAuthority / Data Profile / protocol-minimization direction

ADR 0017
    → Platform owns complete physical Session composition

ADR 0018
    → records direct current-v1 closure before first conformant implementation
```

---

## Current v1 Model

### Game / Runtime

```text
Game Package v1
    Descriptor {key,module}
        ↓
Host-owned Platform Runner
    Node Runner / Worker Runner
        ↓
Subsystem Definition Module
```

Business module不是 Process/Worker entry policy。

### Runtime Control

```text
Runtime Control Application Profile v1
= Subsystem Control v1
+ Frame / Call v1
```

Frame / Call v1仍 Active / Normative / Frozen；ADR 0018只修正首次实现前 PWA carrier representation，不改变七方法/transaction/authority/error/unwind semantics。

### Renderer Data

```text
Renderer Control
    DataAuthority {subsystemKey,generation,dataProfile}
        ↓
Renderer Data Application Profile v1
    loomrealm.renderer-data/1
    = Data Connection v1
    + User Input v1
    + Render Update v1
```

`connectionProfile` 不再是 current字段。

### Platform Provisioning

```text
Hostra
    Broker → Runner provisioning IPC → Data WebSocket

PWA
    Broker → Worker provisioning path → transferred MessagePort
```

Provisioning不是 Runtime/Renderer/Data application protocol；失败不自动失败 Runtime或 unwind Frame。

---

## Current Carrier Rule

Current message-oriented Profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

```text
WebSocket   text message
MessagePort postMessage(string)
Memory      string
```

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## Compatibility Governance

当前治理依据：[文档分层与变更规则](../00-overview/document-governance.md)。

关键区分：

```text
Frozen design
    = semantic design closed by default

real compatibility boundary
    = shipped/independent/persisted interoperability obligation
```

没有真实 compatibility boundary时，不为从未实现的旧草案制造 v1/v2 dual track。

Frozen incompatible preimplementation correction必须经过：

```text
explicit Accepted ADR
minimal scope
statement of unchanged semantics
current Contract direct update
new conformance fixtureSetRevision
full dependent-doc propagation
```

ADR 0018是一次性当前实例；first conformant baseline形成后不能继续把它当通用 breaking-change豁免。

---

## Platform Relation

```text
platform-neutral roles
    Main / Renderer / Subsystem / Content
              │
         Platform Ports
              │
     ┌────────┴────────┐
     ▼                 ▼
Hostra Desktop        PWA
```

```text
ADR 0002
    transport/binding can differ

ADR 0017
    complete physical Session composition belongs to Platform

ADR 0018
    Definition Module / Runner / provisioning / Data Profile / SDK projection closed before first implementation
```

Platform architecture不自动产生 `platform-*` npm package。

---

## Maintenance Rules

- ADR不复制完整协议正文；
- Current Contract覆盖 Superseded/历史 ADR字段示例；
- Superseded状态必须显式；
- protocol/profile version表示真实 interoperability boundary，不表示设计稿迭代次数；
- first conformant baseline之后，incompatible change遵守正常 version/migration治理；
- Platform/Transport不得覆盖 application authority/transaction/error/recovery；
- Conformance fixture可增加既有语义覆盖；incompatible Frozen correction必须遵守治理规则。