# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实现顺序、Game/Platform launch boundary、SDK/Frame、Renderer Data、provisioning、Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-20

核心顺序：

```text
lowest stable primitives
→ common logical game topology
→ formal protocol mechanics
→ role SDK/ports
→ Hostra launch planner/Runner
→ Desktop vertical slice
→ Renderer/Data/Input/Render/Content
→ PWA launch planner/Runner
→ PWA vertical slice
→ abstract-trace equivalence
```

本次直接更新 current v1；不建 v2/legacy parser。

---

## M0：文档与契约基线

必须一致：

```text
Game Package v1
    Descriptor = {key}
    initial target/input

Hostra Launcher Profile v1
    launch.hostra.json → HostraLaunchPlan

PWA Launcher Profile v1
    launch.pwa.json → PwaLaunchPlan

Runtime Control = Control1 + Frame1
Frame / Call v1 Frozen
Renderer Control DataAuthority = {S,G,dataProfile}
Renderer Data = Connection1 + Input1 + Render1
Content API v1
```

关闭：无 current `{key,module}` Game Descriptor、无 same-Definition-artifact硬要求、无旧 launcher/env、无 `connectionProfile`、无 structured-object application MessagePort。

---

## M1：Foundation + Wire

实现 `MessageCarrier<string>`、MemoryCarrier、JSON/JSON-RPC/limits primitives。保持 foundation string opaque、wire无 domain authority。

---

## M2：Game Package Logical Topology

实现：

```text
@loomrealm/game-package
GameEntryV1
Descriptor {key}
initial target/input
closed schema
complete key-set validation
```

关闭：

```text
module/launcher/env rejected
pure validation
zero I/O/Runtime side effect
same ValidatedGameEntry feeds Hostra/PWA planners
```

---

## M3：Runtime Control Mechanics

实现 `@loomrealm/runtime-control` Control/Frame schema/state/session/dispatcher/deadline/conformance。关闭 one reader、hello-first、JSON text、no Batch/no retry、ambiguous Runtime-fatal。

---

## M4：Subsystem Host Surface + Frame SDK

实现 `@loomrealm/subsystem` / `/host`，闭合 initialize/activate、FrameOutcome、call rejection、Runtime-fatal continuation、business exception、suspend semantics。

Definition Module ABI在这里统一；module选择不属于 Game Package。

---

## M5：Main Core + Frozen Frame Vertical Slice

实现 Runtime Registry/Launch Attempt、Frame/Activation/Stack/InputTarget/failure unwind。

Fake `RuntimeHosting` API只接收 logical subsystemKey；任何测试若 Main需要 module即失败。

---

## M6：Hostra Game Launcher / Node Runner

实现：

```text
@loomrealm/game-launcher-hostra
Hostra manifest parser
exact Game↔Hostra key join
safe module resolver
immutable HostraLaunchPlan
plan-bound RuntimeHosting
Host-owned Node Runner
Supervisor
Runtime Control WS binding
Runner provisioning IPC capability
```

Hard gate：所有 required bindings resolve before first spawn；任何 preflight failure process/import/control count均为0。

关闭：business module not argv entry、Main launch no module、ready without Data offer、unexpected exit fails Runtime。

---

## M7：Renderer Control

实现 renderer-control/Renderer Store/Control binding；snapshot只含 committed logical authority，无 physical Data material。

---

## M8：Renderer Data Profile + Data Connection Core

实现 `@loomrealm/data` Connection/Input/Render profile binding、one dispatcher、S/G/P current gate、same-generation reconnect。

---

## M9：Desktop DataConnectionBroker / Late Provisioning

Main DataAuthority → Desktop Broker → Renderer + Runner provisioning IPC → Data WS。Provisioning failure不失败 Runtime/unwind Frame。

---

## M10：User Input v1 + InputManager

实现 Interest Registry、State/Event/Reset、listener aggregation/receive gate/fresh baseline。

---

## M11：Render Update v1 + RenderManager

实现 Registry/Snapshot/Patch/Event、RenderDomain desired state、strict revision/fresh snapshot。Frame close不自动销毁 Domain。

---

## M12：Content

实现 `@loomrealm/content` / service / Desktop adapters。保持 executable capability != Content capability，credential分离。

---

## M13：`loom.map` Business Definition

业务 source只依赖 `@loomrealm/subsystem`，使用 FrameOutcome/InputListener/RenderDomain/ContentClient。

Build MAY产出：

```text
Hostra artifact
PWA artifact
```

两个 launch manifest分别绑定；可以是同一 artifact，也可不同。业务 source/observable semantics必须 platform-neutral。

---

## M14：Desktop Full E2E

```text
Game Entry {keys}
+ launch.hostra.json
→ Hostra preflight plan
→ Node Runner/ready
→ Renderer/Data/Input/Render/Content
→ nested Frame outcomes
→ Data reconnect / Renderer reload
→ shutdown
```

另跑 ambiguous Frame failure E2E。

---

## M15：PWA Game Launcher / Worker Runner

实现：

```text
@loomrealm/game-launcher-pwa
PWA manifest parser
exact Game↔PWA key join
installation/same-origin module resolver
immutable PwaLaunchPlan
plan-bound RuntimeHosting
Host-owned Worker Runner
Runtime/Renderer Control MessagePort adapters
Worker provisioning integration
```

Hard gate：全部 bindings/capability preflight before first Worker creation。

关闭：Main launch no module、Worker Runner is entry、postMessage(string)、provision failure != Runtime failure。

---

## M16：PWA E2E + Cross-platform Equivalence

共享：

```text
same Game Entry logical topology
same subsystem keys
same logical scenario/business input
same protocol/profile semantics
```

平台各自使用自己的 launch manifest/artifact。

比较 Runtime lifecycle、Frame/Activation/Outcome/unwind、Renderer S/G/P、Data lifecycle、Input、Render、Content、business observable state；不比较 module/path/bytes或物理 trace。

---

## Phase 1 Acceptance

- Foundation/Wire职责单一；
- Game Package v1 Descriptor只有 `{key}`；
- Hostra/PWA各自拥有 launch config/schema/planner；
- Game↔current platform exact key-set join；
- full preflight先于任何 Runtime side effect；
- Main launch intent无 module；
- Host-owned Runner是 Process/Worker entry；
- platform manifest不能覆盖 Host security/runtime policy；
- Definition Module ABI统一，artifact不要求跨平台相同；
- Subsystem author/host surfaces分离；
- FrameOutcome与 Frozen Frame一一对应；
- Runtime-fatal无 catch-and-continue；
- Main Frame/Stack/unwind闭合；
- Renderer/Data/Input/Render/Content既有边界闭合；
- Desktop/PWA late Data provisioning完整；
- `loom.map`业务 source无 Platform launch分支；
- Hostra/PWA abstract trace等价。

---

## Deferred

Save、untrusted sandbox、automatic restart、lazy/optional Subsystem、multiple Runtime per key、remote Runtime、多 Renderer、runtime implementation negotiation、统一多平台 launcher schema、预测性 platform mega-package。
