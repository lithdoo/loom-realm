# Hostra Desktop Composition 设计

> 层级：模块设计  
> 状态：M6 Runtime Vertical Implemented / M9 Data Core Implementation Frozen / M14 Full E2E Planned  
> 稳定程度：M6 Qualified Baseline / M9 Preimplementation Frozen / Later Slices Evolving  
> 主要定义：Hostra Desktop Platform Composition realization：Hostra Launcher PREPARE、Node Runner、Runtime Control WebSocket、M9 Desktop Data Broker/Runner late provisioning，以及 M14 BrowserWindow/Renderer Control/Data/Input/Render/Content full composition target  
> 依赖：[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-09-04

本文描述完整 Hostra Desktop Platform Composition target。当前 M6 已 qualified；M9 physical Data core 已冻结待实施；M14 才是 full Desktop product E2E。

---

## 1. Milestone Shape

### M6 Qualified Baseline

```text
apps/desktop / Hostra product entry concept
→ session-scoped HostraPlatform
→ HostraPlatform.prepareGame(...)
→ @loomrealm/game-launcher-hostra PREPARE
→ HostraLaunchPlan + LogicalGameBootstrap
→ runMain({bootstrap, platform})
→ RuntimeHosting
→ Host-owned Node Runner
→ Runtime Control WebSocket
→ @loomrealm/subsystem/host
```

M6 excludes Renderer/Data/Input/Render/Content physical product composition。

### M9 Frozen Data Core

```text
M6 Runtime path
+
Main DataConnectionAuthoritySink
+
apps/desktop DataConnectionBroker
+
exact HostedRuntime → HostraRuntimeDataProvisioner handoff
+
Node child provisioning IPC
+
two-sided Data WebSocket relay
+
M8 RendererDataBinding / SubsystemDataBinding
```

M9 uses deterministic/test physical Renderer hosting；no BrowserWindow/physical Renderer Control product requirement。

### M14 Full Desktop Target

```text
M9 core
+
Hostra BrowserWindow/Web Renderer
+
M7 Frozen RendererControlBinding physical realization
+
Renderer Control WebSocket
+
M10 Input
+
M11 Render
+
M12 Content
→ full Desktop E2E
```

Hostra owns physical topology only；Main retains Runtime/Frame/Activation/InputTarget/DataAuthority/Renderer-currentness authority。

---

## 2. Hostra PREPARE

Product bootstrap invokes `HostraPlatform.prepareGame(...)`; HostraPlatform delegates Game/launch preparation to `@loomrealm/game-launcher-hostra`：

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ validate launch.hostra.json
→ exact Game↔Hostra key-set join
→ safe .mjs resolution / containment
→ Host-selected Node + Runner preflight
→ freeze HostraLaunchPlan
→ project LogicalGameBootstrap
```

Any PREPARE failure：

```text
process create = 0
business module import = 0
Runtime Control establish = 0
```

`apps/desktop` does not duplicate Game/manifest validation。

---

## 3. Main Installation Boundary Through M9

Main receives only：

```text
LogicalGameBootstrap
+
Main-facing narrow capability view
```

Through M9：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?         // physical Hostra realization still M14
dataConnections?                // DataConnectionAuthoritySink; M9 Desktop realization
```

M9 deterministic Desktop composition may provide both a test physical RendererControlBinding and the real Data authority sink for qualification；M6 Runtime-only composition may omit both。

Main never receives HostraLaunchPlan、module/path、Node child、WS endpoint/ticket or provisioner handle。

---

## 4. Runner Model

Physical Runtime entry remains Host-owned Node Runner。Business module remains exact `HostraLaunchPlan[key].module`。

Capability growth：

```text
M6  RuntimeControlBinding
M8  SubsystemDataBinding role seam in subsystem host
M9  Runner provisioning implementation feeds real current-deliverable Data carriers
M12 ContentClient
```

Game common document/Hostra manifest cannot choose Node executable、Runner entry、IPC/WS credentials or Data provisioning policy。

---

## 5. Hostra Shell Separation

```text
Hostra Shell / product lifecycle
    product/window lifecycle

Hostra Game Launcher
    Game validation + executable PREPARE + RuntimeHosting + child-owned provisioning mechanics

Runtime Control
    Main ⇄ Subsystem Control/Frame semantics

Renderer Control
    Main committed Renderer authority mirror

Desktop Data Broker
    Main full-view authority realization + paired Data WS lifecycle

Platform provisioning
    child IPC / endpoint/ticket/candidate material

Renderer Data
    Data application protocol peers
```

Same process may coordinate these, but ownership remains separate。

---

## 6. Runtime Bootstrap — M6 Unchanged

```text
HostraLaunchPlan frozen
→ Main creates Launch Attempt/bootstrap credential
→ RuntimeHosting lookup plan[key]
→ spawn Host-owned Runner
→ Runner loads exact Definition Module
→ Runtime Control WS
→ hello / identified / initialize / ready
```

```text
plan valid != spawned != connected != identified != ready
ready != Renderer exists
ready != Data current
```

Data endpoint/ticket does not enter Runtime startup bootstrap。

---

## 7. Host-owned Process Policy

Host chooses Node executable、package-owned Runner entry、safe env、`shell=false`、cwd/resource/supervision policy。

`launch.hostra.json` cannot override executable/Runner/argv/env/Control/Data credential policy。

---

## 8. Runtime Control WebSocket — M6

One WS text message = one UTF-8 JSON text application unit。No binary/batch/adapter retry/duplicate。

Frame causal rules remain Response-before-dependent-RPC / ACK-before-publication。Runtime Control loss enters Runtime failure；same-attempt reconnect does not exist。

---

## 9. Runtime-scoped Data Provisioner — M9 Frozen

`@loomrealm/game-launcher-hostra` adds exact child-owned integration：

```ts
interface HostraRuntimeDataPrepareRequest {
  readonly candidateId: string;
  readonly endpoint: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface HostraRuntimeDataProvisioner {
  prepare(request: HostraRuntimeDataPrepareRequest, signal: AbortSignal): Promise<void>;
  commit(candidateId: string, signal: AbortSignal): Promise<void>;
  revoke(candidateId: string): void;
}
```

`createHostraRuntimeHosting` may receive：

```text
onRuntimeDataProvisioner(HostedRuntime, provisioner)
```

Handoff occurs before successful `RuntimeHosting.launch()` resolves that exact HostedRuntime。Desktop stores correlation privately; no public RuntimeDirectory。

Provisioner IPC scope：

```text
provision / prepared / commit / committed / revoke
```

No Runtime Control/Frame/business/Input/Render payload。

---

## 10. Desktop DataConnectionBroker — M9 Frozen

Main publishes physical installation facts through optional `DataConnectionAuthoritySink`：

```text
current Renderer token T
+ exact HostedRuntime R
+ S/G/P
```

The accepted Renderer token was already consumed as M7 authentication credential；M9 retention is inert physical correlation only。

Desktop candidate：

```text
Renderer WS ─┐
             ├─ Desktop Broker opaque UTF-8 relay
Runner WS   ─┘
```

Before install：relay gate closed / no child traffic exposure。Candidate requires both sides prepared and exact latest Main view at commit。

Per `(T,S)`：

```text
0..1 current
serialized install/retire
```

Broker owns no generation/profile policy and parses no Data application messages。

---

## 11. Installation vs Runner Delivery

Frozen M9 ordering：

```text
both sides prepared
→ commit-time latest Main-view revalidation
→ old current retires
→ new candidate becomes sole current
→ relay gate opens
→ Renderer delivery cell commit
→ Runner post-install commit notification/ACK
```

Runner `commit` ACK is not the logical installation point。

If Runner delivery fails after install：

```text
new current → retired
close/revoke new pair
old current never resurrects
Runtime/Frame/Main DataAuthority unchanged
```

No rollback/2PC framework。

---

## 12. Data Loss / Same-generation Replacement

```text
current Data WS loss
→ whole pair retired
→ Main S/G/P unchanged
→ fresh physical pair may install under same S/G/P
```

Proactive same-generation physical replacement is also allowed without a pending role acquire waiter。

No generation/revision mutation solely for physical replacement；no resume/replay/old queue migration。

M9 proves fresh carrier/peer connection-local state only。Fresh User Input business publication is M10；fresh Render business baseline is M11。

---

## 13. Renderer Hosting / Control — M14

M14 Hostra product creates/shows/reloads BrowserWindow and realizes physical `RendererControlBinding` WS path according to ADR 0027。

M9 deterministic Renderer host is not promoted to a public `RendererHosting` port。

Renderer Snapshot remains logical only and never includes Data endpoint/ticket/provisioner/Hostra plan。

---

## 14. Content — M12/M14

Desktop Content target remains readonly filesystem-backed service → localhost HTTP。Content credential remains separate from Runtime/Renderer/Data credentials；executable module resolution is not ordinary Content access。

---

## 15. Composition Root

M9 materializes private `apps/desktop` workspace because Broker is one-app physical composition policy。It may combine lower packages/adapters without turning any Core package into a Hostra mega-interface。

M14 is still the first milestone claiming full Desktop E2E across Runtime/Renderer/Data/Input/Render/Content。

---

## 16. Final Invariants

1. M6 Runtime launch/control semantics remain valid when M9 capabilities are absent；
2. Main sees no Hostra Game/Node/WS/IPC/provisioner material；
3. M9 DataConnectionAuthoritySink is full-view/non-blocking/non-throwing；
4. exact HostedRuntime object binds Data to exact child/provisioner；
5. launcher owns child provisioning mechanics but not Broker policy；
6. apps/desktop owns Desktop Broker/two-sided relay；
7. candidate is not current before paired Broker install；
8. install precedes Runner delivery ACK；delivery failure retires new current without rollback；
9. one Data side terminal retires whole pair；
10. Data provisioning/loss does not directly fail Runtime or unwind Frame；
11. M9 does not claim BrowserWindow/Input/Render/Content or full cross-platform equivalence；
12. M14 remains full Desktop product composition gate。
