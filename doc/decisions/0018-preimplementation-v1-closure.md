# ADR 0018：首次实现前直接收口当前 v1

> 状态：Accepted  
> 日期：2026-08-19  
> 影响范围：Game Package v1、Desktop Node Runner Profile v1、Subsystem SDK、Renderer Control/Data、Platform provisioning、Frame v1 transport mapping、package/document governance  
> 取代/修正：[ADR 0005](./0005-game-entry-subsystem-launchers.md) launcher declaration 部分、[ADR 0007](./0007-subsystem-descriptor-mvp.md)、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md)、[ADR 0015](./0015-freeze-frame-call-protocol-v1-batch-f.md) 的旧 PWA structured-object transport mapping  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md)  
> 后续修正：[ADR 0019](./0019-platform-launch-manifest-boundary.md) supersedes 本 ADR 原 Game `{key,module}` / “Hostra/PWA same Definition artifact” 结论；其余 Frame/Data/SDK/governance 结论继续有效

## 背景

LoomRealm 尚无需要兼容的 conformant deployed v1 implementation。继续保留早期 Desktop-first形状会制造虚假的 dual model与兼容义务。

发现的根因级断点：

```text
Game Package business topology耦合 Node launcher technology
Business Definition → physical Runtime 缺 Runner层
Runtime ready之后缺 late Data provisioning路径
Frame protocol outcome/failure缺完整 author control-flow映射
Control/Data在 WebSocket/MessagePort上存在两套 application representation
```

因此当前阶段直接修正现行 v1，而不是创建 v2。

ADR 0019 之后又发现 `{key,module}` 仍把 **logical topology** 与 **current-platform executable binding** 混在 common Game Descriptor 中，因此继续使用同一 preimplementation direct-v1 机制做第二次边界收口；这不重新开放 Frozen Frame v1。

---

## 1. Preimplementation v1 Reset Rule

在首次 conformant implementation / public compatibility commitment前：

> **Current v1 MAY receive breaking corrections required to produce one coherent first implementation contract.**

旧形状只留 Git/ADR历史；不保留 deprecated alias、dual parser、compatibility mode。

该规则要求：

```text
one current first-implementation model
no fake v1/v2 split for never-shipped draft
all dependent Current docs/tests/navigation update together
provenance remains in ADR/Git
```

ADR 0019 正是该规则在 Game/Platform launch boundary 上的后续应用：current Game Package 直接从 `{key,module}` 收口为 `{key}` + platform-specific Launch Manifest；没有 v2，也没有 legacy parser。

### Frame Frozen 特例边界

Frame / Call v1已经 Frozen。此次只授权一次 preimplementation correction：

```text
PWA postMessage(plain object)
→ postMessage(string UTF-8 JSON text)
```

以及对应 size/conformance wording。

**不授权改变**：

```text
seven methods / fields
FrameOutcome
identity/lifecycle/Activation
commit points / causal barriers
error/timeout/no-retry
failure unwind
business wire limits/deadlines
```

当前 correction完成后，Frame v1继续 Frozen；未来不能用本 ADR或 ADR 0019绕过版本治理。

---

## 2. Game Package v1：历史结论与当前修正

### 2.1 本 ADR 在 2026-08-19 记录的历史 current shape

当时收敛为：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

并删除：

```text
launcher.type
launcher.entry
descriptor.env
```

当时的设计意图是：

```text
Game Package回答：
who = key
what business module = module

Platform回答：
how to host/run
```

这一步已经消除了“business module直接充当 Node process entry”的错误，但后来发现 `module` 本身仍属于 current-platform executable realization，而不是 logical Game topology。

### 2.2 Current shape after ADR 0019

ADR 0019 supersedes 上述 `{key,module}` 部分：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
}
```

Current closed loop：

```text
Game Package
    {key...} + initial target/input
        +
Current Platform Launch Manifest
    key → platform-specific Definition Module
        ↓
exact key-set join + full preflight
        ↓
immutable PlatformLaunchPlan
        ↓
Main launch(key)
        ↓
plan-bound RuntimeHosting
```

因此：

```text
Game Package owns logical identity/topology
Platform owns executable binding/realization
```

不保留旧 `module` alias、dual parser或 Game Package v2。

---

## 3. Definition Module / Runner：历史结论与当前修正

### 3.1 本 ADR 的原始 Runner closure

本 ADR确立：

```text
Business Definition Module
        │
Host-owned Runner
        │
@loomrealm/subsystem/host
```

Host-owned Runner是 Process/Worker physical entry，负责：

```text
load/validate Definition Module ABI
construct role-local Platform Ports
call @loomrealm/subsystem/host runSubsystem
```

Business module不是 physical Runtime entry policy。

### 3.2 ADR 0019 修正 artifact identity

本 ADR当时还写过：

```text
same Definition Module
    ├── Node Runner
    └── Worker Runner
```

这里的“same artifact”要求现在被 ADR 0019 supersede。

Current：

```text
same logical subsystem key
same SubsystemDefinitionFactory ABI
same author-facing capability semantics
same formal protocol outcome/failure mapping
same business-observable result

Hostra MAY select Hostra build artifact
PWA    MAY select PWA build artifact
```

不要求 module path、file bytes或 build artifact identity。业务 source SHOULD保持 platform-neutral；build/launcher binding吸收平台差异。

Runner仍然必须是 Host-owned physical entry；Platform Launch Manifest不能替换 trusted Runner、bootstrap credential或 Host security policy。

---

## 4. Subsystem Author / Host Surface

继续有效：

```text
@loomrealm/subsystem
    author API

@loomrealm/subsystem/host
    trusted Runner integration
```

Author不见：

```text
carrier
bootstrap token
generation/profile
provisioning material
Platform Launch Manifest
module path/URL
Runner type
```

Host surface提供：

```text
runSubsystem
RuntimeControlBinding
SubsystemDataBinding
ContentClient integration
```

无 Runtime service locator / module-global current context。

---

## 5. FrameOutcome / Business Control-flow

Author结果直接映射 Frozen Frame outcome：

```text
completed(value)
cancelled()
failed(error)
```

`frame.call()`：

```text
child completed/cancelled/failed
    → resolve FrameOutcome

明确 pre-commit recoverable rejection
    → typed reject; current Activation remains valid

Runtime-fatal/ambiguous
    → MUST NOT re-enter business continuation
```

ordinary uncaught business exception在 authority明确健康时 → Frame failed outcome；protocol ambiguity/invariant corruption → Runtime failure。

这条结论与 Game/Platform launch reset完全独立，继续作为 SDK hard invariant。

---

## 6. DataAuthority / Renderer Data Profile

Renderer Control：

```text
DataAuthority {
  subsystemKey,
  generation,
  dataProfile
}
```

Current：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

删除旧 `connectionProfile`。

`dataProfile` 是 complete application stack identity；同 generation immutable；Profile改变必须 fresh generation。

Executable binding / LaunchPlan 不进入 DataAuthority，也不能从 Data endpoint/Port反推 Runtime implementation identity。

---

## 7. Unified JSON Text Carrier Model

Current message-oriented Runtime Control / Renderer Control / Renderer Data Profiles全部：

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

Foundation把 string视为 opaque；JSON interpretation属于 wire/Profile。

这同时修正 Frame v1旧 PWA object-carrier mapping；详见 ADR 0015 当前说明。

ADR 0019不改变这项 carrier decision。

---

## 8. Late Data Provisioning

Runtime `ready`不携 Data material。

Hostra：

```text
DataConnectionBroker
→ Node Runner provisioning IPC
→ one-time endpoint/ticket
→ Data WebSocket
→ SubsystemDataBinding
```

PWA：

```text
DataConnectionBroker
→ Worker provisioning path
→ transferred MessagePort
→ SubsystemDataBinding
```

Provisioning：

```text
!= Runtime Control
!= Renderer Control
!= Renderer Data application payload
!= business API
!= Platform Launch Manifest
```

Provisioning/Data establishment failure本身不失败 Runtime、不 unwind Frame、不修改 Main DataAuthority。

LaunchPlan解决“这个 key 在当前平台由什么实现、如何进入 Host-owned Runner”；late Data provisioning解决“已经运行的 Runtime 后续如何取得 current S/G/P carrier”。两者是不同 lifecycle/authority。

---

## 9. Role-local Data Port Names

继续有效：

```text
RendererDataBinding
SubsystemDataBinding
```

它们是同一 DataConnectionBroker 的两个 role-local projections；不使用含糊同名接口隐藏 owner。

Platform launcher package MAY提供 Subsystem Runner side provisioning integration point，但不能因此拥有 Main DataAuthority或完整 Renderer-side Broker authority。

---

## 10. Document Dependency Governance

主要定义依赖必须是 DAG。

Metadata区分：

```text
依赖       true definition dependency
正式化     contract realization
被细化     architecture refinement
被实现     module/implementation realization
相关       cross-reference only
```

当前主架构顺序：

```text
product / governance
→ system overview
→ platform composition
→ runtime hosting
→ stack / communication
→ rendering
→ subsystem model
→ runtime bootstrap synthesis
→ contracts
→ modules
→ implementation
```

重大 breaking preimplementation correction：

```text
Accepted ADR
→ current Contract
→ enclosing index/profile
→ architecture projection
→ module/package design
→ tests/roadmap/navigation
```

不能只改一个文件留下其他 Current source继续旧模型。

---

## 11. Resulting Closed Loops

### Downward implementation loop

```text
Game logical topology
→ current Platform Launch Manifest
→ immutable LaunchPlan
→ Main logical launch intent
→ plan-bound RuntimeHosting
→ Host-owned Runner
→ Author/Host SDK boundary
→ Role Core
→ role-local Platform Ports
→ Process/Worker/WS/Port
```

Business-specific path：

```text
Business Definition source
→ @loomrealm/subsystem author API
→ platform build artifact
→ current Platform Launch Manifest binding
→ trusted Runner
```

### Upward semantic loop

```text
Formal protocol authority/outcome/failure
→ SDK capability/control-flow
→ business-observable semantics
```

无需：

```text
runtime service locator
ambient platform context
magic carrier
implicit Activation recovery
platform branch in business
universal launcher option bag
```

---

## 12. Superseded Current-v1 Shapes

以下不再有效：

```text
Game Package launcher.type / launcher.entry / env
business module direct Node argv entry
Game Package Descriptor.module
PWA-specific business Descriptor
Hostra/PWA must load same Definition artifact/path/bytes
connectionProfile
MessagePort structured application object
PWA reference-compact-only carrier sizing
runtime.input/runtime.render service locator
raw child return without FrameOutcome
Runtime-fatal as catchable business rejection
```

其中 Game `module` / same-artifact 两项由 ADR 0019 supersede；其余主要由本 ADR及相关 current contracts收口。

历史只用于理解演进，不形成 compatibility obligation。

---

## 13. Re-evaluation / Governance Boundary

需要重新版本/架构评估的条件：

```text
conformant v1已经产生真实兼容义务
third-party/remote Runner需要公开 provisioning/launch wire
multiple Renderer / remote Runtime改变 topology
lazy/optional Subsystem改变 exact key-set join
新的 Data child protocol组合
Runtime restart/checkpoint要求跨 Runtime authority
executable signing/sandbox形成独立 trust contract
```

从 current first implementation baseline起，不再因为“实现还方便”而直接破坏 Frozen/Normative compatibility boundary。

本 ADR与 ADR 0019 都不是未来 breaking change 的永久许可证：一旦真实 compatibility boundary形成，incompatible change必须进入正常 version/migration治理。
