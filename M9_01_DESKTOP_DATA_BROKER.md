# M9 / 01 — Desktop DataConnectionBroker

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：01  
> 最近复核：2026-09-04  
> 前置：[M8 / 05](M8_05_QUALIFICATION_CLOSURE.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Platform Composition](doc/10-architecture/platform-composition-system.md) · [Hostra Desktop Composition](doc/20-modules/desktop-host/README.md)  
> 目标：关闭 Desktop session-scoped Data broker 的 authority feed、candidate/current slot 与 failure boundary；只增加真实 M9 consumer 所需的一个 Main→Platform sink，不建立通用状态同步框架。

> **Main 仍是唯一 Data authority；Broker 只消费 Main committed fact，并把它实现成 physical Data Connection。**

---

## 1. Position

```text
Main committed authority
    Runtime / current Renderer / DataAuthority(S,G,P)
        ↓
DataConnectionAuthoritySink
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
Main authority != Broker candidate != current Data Connection
```

`RendererDataBinding.acquire(S,G,P)` 只是 role 对已授权 Data carrier 的等待，不是 Main authority source，也不是 installation commit 的授权条件。

---

## 2. Minimal Main → Platform Seam

`@loomrealm/platform-ports` 增加当前真实 Desktop consumer 所需的最窄 fact sink：

```ts
interface DataConnectionAuthorityEntry {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly runtime: HostedRuntime;
}

interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly DataConnectionAuthorityEntry[];
}

interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}
```

`MainPlatform` 增加一个 optional capability：

```ts
readonly dataConnections?: DataConnectionAuthoritySink;
```

Optionality：

```text
absent
→ Main Runtime/Frame/Renderer Control 正常
→ Platform 不获得 Data installation authority

present
→ Main 在既有 serialized authority lane 中同步 replace current view
```

这不是公共 Broker API。它只把 Main 已提交的 current physical-binding fact交给同一 session-scoped Platform。

---

## 3. View Identity

`DataConnectionAuthoritySink` 本身 session-scoped，所以 Session 不重复进入 DTO。

Current Renderer 使用已被 Main 接受的 exact `rendererControlToken` 作为 **Platform-private correlation key**：

```text
Main accepted Renderer candidate token T
→ current view.rendererControlToken = T
```

规则：

```text
T possession alone grants nothing
T MUST NOT enter Data application wire
T MUST NOT be accepted from Renderer as authority proof
Broker only trusts T because Main current view names it
```

Main 可在 current Renderer lifetime 内保留该 token 仅用于 M9 physical correlation；不得创建第二套 Renderer lease/epoch/currentness protocol。

Target Runtime 使用 Main 已持有的 exact `HostedRuntime` object identity。Broker 只可绑定到同一个 object；same-key fresh Runtime 不是同一 target。

---

## 4. Replace Semantics

`replace(view)` 是 **full replacement**，不是增量 event stream。

Main 在影响以下任一事实的既有 serialized commit 中调用：

```text
current Renderer changes/clears
Runtime ready/current target changes
DataAuthority add/remove/replace
Session terminal
```

语义：

```text
replace(newView)
→ newView immediately becomes the only installable authority view
→ stale pending candidates immediately become non-installable
→ stale current pairs synchronously lose Broker current status
→ physical close may converge asynchronously
```

```text
replace(null)
→ no current Renderer Data installation authority
→ retire/invalidate all current + pending Data material
```

`replace` MUST NOT await network I/O。Concrete sink must fail closed for its own transport/cleanup failures and MUST NOT turn Data failure into Runtime/Frame failure。

No EventBus、ObserverHub、AuthorityRegistry、generic state replication API。

---

## 5. Broker Slot Model

For the current Main view：

```text
(rendererControlToken, subsystemKey)
    → 0..1 current Data Connection
```

Broker private state only needs：

```text
latest authoritative view
per-S current pair | none
pending physical candidates
role-facing committed-carrier delivery cells
```

Different subsystem slots are independent。

`generation/profile` are copied from Main view；Broker never allocates or repairs them。

---

## 6. Candidate Boundary

Candidate MAY physically create/connect/prepare before install, but before commit：

```text
not current
no child traffic exposure
no Input/Render baseline
no cardinality slot
```

Candidate failure：

```text
dispose candidate material
→ Main authority unchanged
→ Runtime/Frame unchanged
```

If the same Main view remains current, Platform MAY create a fresh candidate；this is physical establishment work, not Data protocol retry/replay。

---

## 7. Current / Retirement

Successful paired commit is the only transition into Broker current。

Current pair retires on：

```text
physical Data loss
Main view removes/replaces exact S/G/P
current Renderer token changes/clears
Session end
exact HostedRuntime terminal/replaced
successful same-generation supersede
child Data-fatal retirement
```

Retired carrier never becomes current again；old traffic/queues are never migrated。

---

## 8. Placement

```text
@loomrealm/main
    owns authority + calls DataConnectionAuthoritySink

@loomrealm/platform-ports
    owns only the narrow sink fact types

apps/desktop
    provides sink + owns Broker/Data WS composition

@loomrealm/game-launcher-hostra
    owns Node child + runtime-scoped provisioning mechanics

@loomrealm/data
    owns Data application protocol mechanics
```

Broker does not enter Main/Renderer/Subsystem/business packages；launcher does not absorb Broker policy。

---

## 9. Closure

M9/01 is closed when Main can synchronously replace one exact session-scoped Data installation view and Desktop Broker can invalidate/revalidate candidates/current pairs solely from that view。

No implementation-time authority seam remains unspecified；no generic state framework is introduced。
