# M9 / 01 — Desktop DataConnectionBroker

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：01  
> 最近复核：2026-09-04  
> 前置：[M8 / 05](M8_05_QUALIFICATION_CLOSURE.md)  
> 冻结决策：[ADR 0028](doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Platform Composition](doc/10-architecture/platform-composition-system.md)  
> 目标：冻结 Main → Platform Data installation authority feed、Desktop Broker slot/candidate/current lifecycle 与失效边界；只增加真实 M9 consumer 所需的最窄 shared fact sink。

> **Main 是唯一 Data authority。Broker 只消费 Main committed full view；Renderer acquire、ticket、socket 与 provisioning ACK 都不能创造 authority。**

---

## 1. Frozen Position

```text
Main committed authority
    current Renderer participant
    ready Runtime / DataAuthority(S,G,P)
        ↓
DataConnectionAuthoritySink.replace(full view)
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
Main authority != Platform candidate != current Data Connection
```

M8 Bindings只是 role 对 **already-current-deliverable carrier** 的等待，不是 Broker installation 的授权输入。

---

## 2. Exact Shared Port Surface

`@loomrealm/platform-ports` 增加：

```ts
export interface DataConnectionAuthorityEntry {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly runtime: HostedRuntime;
}

export interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly DataConnectionAuthorityEntry[];
}

export interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}
```

`@loomrealm/main` 的 consumer-owned view 增加：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

No generic AuthorityStream、Observer、Broker interface、service locator 或 callback registry。

---

## 3. Optionality / Initial State

```text
dataConnections absent
→ no Platform Data installation authority feed
→ Runtime/Frame/Renderer Control/M8 logical DataAuthority remain valid

present
→ Main MUST establish replace(null) before any non-null view
```

Non-null view only exists while Main has one current Renderer participant。Main may have logical DataAuthority with no Renderer；that still projects to Renderer Control state/revision normally, but Platform sink remains `null` until a Renderer becomes current。

`replace(null)` means：

```text
no current Renderer Data installation authority
→ all pending/current Broker Data material loses install/current status
```

---

## 4. Current Renderer Correlation

Main retains the accepted Renderer candidate's exact `rendererControlToken` for the lifetime of that **current participant only**。

```text
hello authentication consumes T as a one-shot credential
T is never valid for authentication again
Main may retain the value as inert Platform-private correlation
```

规则：

```text
T possession grants no Data authority
Renderer cannot present T to authorize Data
T never enters Data application wire
Broker trusts T only because current Main view names it
```

The retained current token counts as live opaque material for Main's defensive no-reuse check。When that Renderer ceases current, Main drops the retained correlation value；no historical token set is kept。

This does not create a second Renderer lease/epoch/currentness protocol；M7 currentness remains `currentRendererPeer` authority in Main。

---

## 5. Runtime / Entry Identity

`DataConnectionAuthorityEntry.runtime` is the exact `HostedRuntime` object returned for the Main-owned Runtime attempt。

```text
same subsystemKey + different HostedRuntime object
!= same physical target
```

Main emits an entry only when its current committed DataAuthority exists for that Runtime。Phase 1 M9 therefore emits ready-derived `S/1/loomrealm.renderer-data/1` entries。

Entry invariants：

```text
one entry maximum per subsystemKey
subsystemKey matches the owning Runtime record
generation/profile exactly equal Main DataAuthority
runtime object is the exact current HostedRuntime
ordering deterministic; ordering has no authority meaning
```

PID、WS URL、ticket、candidateId、Frame/Activation never enter the view。

---

## 6. `replace()` Contract

`replace()` is a synchronous **full replacement** and MUST be：

```text
non-blocking
non-throwing
free of network/IPC waits
free of user/business callbacks
```

Concrete sink implementation MUST first atomically replace its in-memory authoritative view and synchronously make stale pending/current Broker material non-installable/non-current。Physical socket/IPC close may converge asynchronously after that logical invalidation。

Therefore ordinary transport/cleanup failure cannot escape `replace()` and cannot interrupt Main's serialized mutation。

A provider that throws from `replace()` violates the frozen Platform port contract and fails qualification；M9 defines no semantic recovery for a non-conforming provider。

---

## 7. Main Commit Discipline

When `dataConnections` exists, Main updates it inside the existing serialized authority lane before that lane completes。

Required changes：

```text
Session start
→ replace(null)

Renderer A accepted current
→ retain A token
→ replace(view for A + all current DataAuthority entries)

Renderer A → B replacement
→ B becomes current in existing M7 transaction
→ retain B token / drop A token
→ replace(full B view)
→ old A Data invalid immediately

current Renderer terminal with no replacement
→ clear current token
→ replace(null)

Runtime/DataAuthority add/remove/replace while Renderer current
→ replace(updated full view)

Session terminal
→ replace(null) before asynchronous physical cleanup
```

`replace()` does not bump `rendererRevision` and does not enter Renderer Snapshot。Renderer Control publication and Data physical invalidation derive from the same committed Main state but do not form a new cross-plane total-order protocol。

---

## 8. Broker Slot / Candidate Budget

For the latest non-null view：

```text
(rendererControlToken, subsystemKey)
    → 0..1 current Data Connection
```

Broker private state may contain only what real physical work needs：

```text
latest authoritative view | null
per-S current pair | none
pending physical candidates
Renderer committed-carrier delivery cell per S
```

Different subsystem slots are independent。Broker copies G/P from Main view and never allocates/repairs generation。

Before install, candidate may physically create/connect/prepare but is：

```text
not current
not a Connection instance
not allowed to expose child application traffic
not a cardinality occupant
```

Candidate failure disposes only candidate material；Main authority/Runtime/Frame remain unchanged。

---

## 9. Current / Retirement

Paired installation commit is the only transition into Broker current。

Current pair retires on：

```text
physical close/read/write failure
Main view removes/replaces exact S/G/P
current Renderer token changes/clears
exact HostedRuntime changes/terminates
Session null/terminal
same-generation successful supersede
child Data-fatal carrier retirement
explicit Platform Data-slot shutdown
```

Logical retirement happens before best-effort physical close。Retired carrier never becomes current again；old traffic/unsent queues are never replayed or migrated。

---

## 10. Ownership / Placement

```text
@loomrealm/main
    authority owner + sink producer

@loomrealm/platform-ports
    exact narrow sink fact types only

apps/desktop
    sink implementation + Desktop Broker + Data WS relay

@loomrealm/game-launcher-hostra
    exact Runtime-owned child IPC/provisioner mechanics only

@loomrealm/data
    Data application protocol mechanics
```

No Broker policy in launcher；no physical candidate state in Main/Renderer/Subsystem role packages。

---

## 11. Qualification

Must prove：

```text
exact exported type names/fields
MainPlatform.dataConnections optional
initial replace(null)
non-null view requires exact current Renderer
current Renderer token is auth-consumed but retained only as inert live correlation
live current token participates in Main duplicate-material defense
entries exact/unique/deterministic and use HostedRuntime object identity
replace is full replacement / synchronous / non-blocking / non-throwing
replace changes no rendererRevision by itself
Renderer replacement invalidates old Data in the same Main mutation lane
Runtime/DataAuthority change updates full view
Session terminal sends null before async cleanup
Renderer acquire/ticket/socket cannot authorize install
no generic authority/event/registry abstraction
```

---

## 12. Frozen Closure

M9/01 is implementation-closed when every Main→Broker authority arrow has the exact surface and ordering above。Coding may choose private helper/file layout only；it may not invent a second authority source、observer framework、Broker service API or alternate currentness identity。
