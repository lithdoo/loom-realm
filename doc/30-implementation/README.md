# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：current 分包、测试、delivery milestone 与 implementation fact-source 入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 最近复核：2026-09-04

实施层只落地 current architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。精确 milestone closure 由 `phase-1-delivery-plan.md` 与对应 Frozen M/ADR 文档定义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish/dependency boundary；
- [仓库与目录方案](./repository-layout.md) — monorepo、Runner、provisioning 与 app placement；
- [测试策略](./testing-strategy.md) — package、role、vertical、cross-platform qualification；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — M0..M16 顺序/closure 摘要。

---

## Frozen Milestone Plans

```text
M7_01 ... M7_05
    Renderer Control logical vertical
    ✅ implemented / qualified

M8_01 ... M8_05
    logical DataAuthority + role-facing Data seam
    ✅ implemented / qualified

M9_01 ... M9_05
    Desktop Data Broker / Runner late provisioning physical core
    🔒 implementation frozen / pending code
```

M9 fact chain：

```text
ADR 0028
→ M9_01 Main→Platform full-view authority sink
→ M9_02 exact HostedRuntime→Hostra provisioner handoff
→ M9_03 paired WS install/cutover/post-install delivery
→ M9_04 production vertical + Broker contract harness
→ M9_05 unique qualification gate
```

---

## 当前 Implemented Baseline

```text
M1  Foundation / Wire                         ✅
M2  Game Package                              ✅
M3  Runtime Control mechanics                 ✅
M4  Subsystem Runtime/Frame core              ✅
M5  Main Runtime/Frame authority              ✅
M6  Hostra Runtime physical vertical          ✅ Qualified 2026-09-03
M7  Renderer Control                          ✅ Qualified 2026-09-03
M8  Data logical authority / role integration ✅ Qualified 2026-09-04
M9  Desktop Data Broker / late provisioning   ✅ Qualified 2026-09-04
```

Qualification evidence：[m8-qualification.md](./m8-qualification.md) · [m9-qualification.md](./m9-qualification.md)。

---

## M9 Desktop DataConnectionBroker — Implemented / Qualified

M9 implementation is qualified on 2026-09-04；evidence is recorded in [m9-qualification.md](./m9-qualification.md)。ADR 0028 + root `M9_01`–`M9_05` remain the semantic source。

Exact new public/shared surfaces：

```text
@loomrealm/platform-ports
    DataConnectionAuthorityEntry
    DataConnectionAuthorityView
    DataConnectionAuthoritySink

@loomrealm/main MainPlatform
    dataConnections?: DataConnectionAuthoritySink

@loomrealm/game-launcher-hostra
    HostraRuntimeDataPrepareRequest
    HostraRuntimeDataProvisioner
    optional onRuntimeDataProvisioner hook
```

M8 `RendererDataBinding` / `SubsystemDataBinding` remain unchanged。

---

## M9 Ownership Snapshot

```text
Main
    remains only logical Data authority owner
    projects current Renderer + exact HostedRuntime + S/G/P

DataConnectionAuthoritySink
    full replacement
    synchronous / non-blocking / non-throwing

apps/desktop
    session-scoped DataConnectionBroker
    two-sided Data WS opaque relay
    RendererDataBinding realization
    Broker contract harness

@loomrealm/game-launcher-hostra
    exact Node-child provisioning mechanics only
    Runtime-scoped provisioner handoff

Runner
    prepare private Data WS carrier
    post-install committed/current-deliverable carrier
    SubsystemDataBinding delivery
```

No Broker policy is placed in launcher；no Hostra/WS code enters Core roles/protocol packages。

---

## M9 Installation / Failure Rule

```text
paired prepared
→ latest Main-view revalidation
→ old current retires
→ new candidate becomes sole current
→ role delivery happens after install
```

Runner `commit()` is post-install delivery ACK。

```text
new B installed
→ Runner delivery fails
→ B current→retired
→ old A never resurrects
→ Main DataAuthority / Runtime / Frame unchanged
```

No rollback/2PC/retry/currentness framework。

---

## Current Main-facing Platform View

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

Both optional capabilities may be absent in older/headless compositions without fake providers。

---

## Repository Placement at M9

M9 materializes the first real app workspace：

```text
apps/desktop
```

Root npm workspaces add：

```text
apps/*
```

`apps/desktop` is M9 Broker/test physical composition, not yet full BrowserWindow product shell。M14 owns full Desktop product E2E。

---

## Qualification Ownership

```text
platform-ports
    exact M9 shared surface / Foundation-only dependency

main
    optional sink / full-view projection / token correlation / mutation ordering

game-launcher-hostra
    provisioner handoff + Node IPC + Runner Data delivery

apps/desktop
    Broker authority/candidate/install/retire harness
    two-sided WS relay
    real M9 physical vertical

M10
    User Input fresh business publication baseline

M11
    Render fresh business publication baseline

M14/M16
    full physical product/platform equivalence
```

Root gate：

```text
npm run test:m9
```

M9 does not claim full Connection-v1 cross-platform conformance or M10/M11 child business baselines。

---

## Current Implementation Order

```text
M1–M8 ✅
↓
M9 Desktop Data Broker / Late Provisioning   ✅ qualified 2026-09-04
↓
M10 User Input
M11 Render
M12 Content
M13 loom.map
M14 Desktop Full E2E
M15 PWA Runtime vertical
M16 PWA Full E2E / equivalence
```

---

## Implementation Governance

Forbidden for M9 coding：

```text
AuthorityEventBus / ObserverHub
ConnectionRegistry / ConnectionManager
RuntimeDirectory public service
GenericTransaction / 2PC
retry/backoff framework
second Renderer currentness lease/epoch
Data application hello/ready/resume messages
PWA abstraction solely for symmetry
```

Frozen changes follow ADR 0028 reopen rules。After implementation/qualification, add `m9-qualification.md` and update status/navigation; qualification evidence must not redefine the architecture。
