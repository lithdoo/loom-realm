# M9 / 01 — Desktop DataConnectionBroker

> 状态：**Implementation Boundary Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：01  
> 最近复核：2026-09-04  
> 前置：[M8 / 05](M8_05_QUALIFICATION_CLOSURE.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Platform Composition](doc/10-architecture/platform-composition-system.md) · [Hostra Desktop Composition](doc/20-modules/desktop-host/README.md)  
> 目标：关闭 Desktop session-scoped Data broker 的 authority binding、candidate/current slot 与 failure boundary；不新增 Data application protocol，不把 Broker 做成公共框架。

> **Broker 只把 current Main authority 实现成 physical Data Connection；它不创造 authority，也不成为新的业务层。**

---

## 1. Position

```text
Main current DataAuthority(S,G,P)
+ current Renderer participant
+ current target Runtime
        ↓
Desktop DataConnectionBroker
        ↓
physical candidate pair
        ↓
paired installation commit
        ↓
RendererDataBinding / SubsystemDataBinding
```

必须保持：

```text
DataAuthority != candidate != current Data Connection
```

`RendererDataBinding.acquire(S,G,P)` 是 Renderer 对当前 authority 的消费请求，不是 Main authority source。

---

## 2. Ownership

Broker owns only：

```text
session-scoped physical Data slots
candidate creation/disposal
Renderer/Runner endpoint pairing
paired readiness
serialized install/cutover
current carrier retirement
same-generation fresh physical replacement
```

Broker does not own：

```text
generation/profile policy
Runtime/Frame authority
Renderer currentness decision
Input/Render state
Data wire parsing
application retry/replay
```

`S/G/P`、endpoint、ticket、candidate id 都不是 authority credential。

---

## 3. Authority Feed

Installation commit 前 Broker MUST 能看到与 Main committed state 同步的 current：

```text
Session
Renderer participant
target Runtime
S/G/P
```

不得仅依据以下事实安装：

```text
Renderer acquire request
Subsystem acquire request
endpoint/ticket valid
WebSocket connected
```

Desktop composition 的具体 in-process correlation 可以保持 private；不得把 participant handle、ticket 或 Broker state 加入 Renderer Snapshot / Data application wire。

M9 默认不增加新的公共 Core port。若真实实现证明现有 composition seam 无法在 Main commit boundary 提供上述 revalidation fact，才允许以**最小真实 consumer capability** reopen M9/01；不得先创建 Observer/EventBus/AuthorityRegistry/service locator。

---

## 4. Slot Model

每个 current Renderer participant：

```text
subsystemKey S → 0..1 current Data Connection
```

Broker 私有状态只需要：

```text
current pair | none
pending physical candidates
current authoritative binding
```

不需要公共 `ConnectionRegistry`、generic state machine 或跨 protocol connection framework。

不同 subsystem slots 相互独立。

---

## 5. Candidate Boundary

Candidate 在 commit 前可以经历 physical creating/connecting/prepared，但：

```text
not current
no child traffic exposure
no Input/Render baseline
no cardinality slot
```

Candidate establishment failure：

```text
dispose physical material
→ keep parent Runtime/Frame authority unchanged
```

若 authority 仍 current，Platform MAY继续等待/建立 fresh candidate；不增加 retry protocol 或 backoff framework。

---

## 6. Current / Retirement

成功 commit 后 candidate 才成为 sole current。

以下任一发生时 current pair 必须 retire：

```text
physical Data loss
Main authority removal/replacement
Renderer replacement/control loss
Session end
target Runtime terminal/replacement
same-generation successful supersede
```

Retired carrier 永不重新 current；旧 traffic 不迁移到 fresh carrier。

---

## 7. Placement

```text
apps/desktop
    owns Desktop DataConnectionBroker + Desktop Data WS composition

@loomrealm/game-launcher-hostra
    owns Node Runner process + private provisioning integration only

@loomrealm/data
    owns Data application protocol mechanics

@loomrealm/main
    remains authority owner
```

Launcher 不吞并 Renderer/DataBroker/Content；Broker 不进入 business/role packages。

---

## 8. Closure

M9/01 关闭时，Desktop Broker 只具有真实 physical pairing 所需的 session/slot/candidate/current state，并能在 commit-time 以 Main current authority 为准做 revalidation。

任何为了未来 PWA、通用连接管理或 M10/M11 方便而增加的公共抽象都不属于 M9/01。
