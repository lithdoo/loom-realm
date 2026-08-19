# ADR 0018：首次实现前直接收口当前 v1

> 状态：Accepted  
> 日期：2026-08-19  
> 影响范围：Game Package v1、Desktop Node Runner Profile v1、Subsystem SDK、Renderer Control/Data、Platform provisioning、Frame v1 transport mapping、package/document governance  
> 取代/修正：[ADR 0005](./0005-game-entry-subsystem-launchers.md) launcher declaration 部分、[ADR 0007](./0007-subsystem-descriptor-mvp.md)、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md)、[ADR 0015](./0015-freeze-frame-call-protocol-v1-batch-f.md) 的旧 PWA structured-object transport mapping  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md)

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

---

## 1. Preimplementation v1 Reset Rule

在首次 conformant implementation / public compatibility commitment前：

> **Current v1 MAY receive breaking corrections required to produce one coherent first implementation contract.**

旧形状只留 Git/ADR历史；不保留 deprecated alias、dual parser、compatibility mode。

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

当前 correction完成后，Frame v1继续 Frozen；未来不能用本 ADR绕过版本治理。

---

## 2. Game Package v1

Current：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

删除：

```text
launcher.type
launcher.entry
descriptor.env
```

`module` = package-local `.mjs` Subsystem Definition Module，default export `SubsystemDefinitionFactory`。

Game Package回答：

```text
who = key
what business module = module
```

Platform回答 how to host/run。

---

## 3. Definition Module / Runner

```text
same Definition Module
        │
   ┌────┴────┐
Node Runner Worker Runner
```

Host-owned Runner是 Process/Worker entry，负责：

```text
load/validate Definition Module ABI
construct role-local Platform Ports
call @loomrealm/subsystem/host runSubsystem
```

Business module不是 physical Runtime entry policy。

---

## 4. Subsystem Author / Host Surface

```text
@loomrealm/subsystem
    author API

@loomrealm/subsystem/host
    trusted Runner integration
```

Author不见 carrier/bootstrap/generation/profile/provisioning。

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

这同时修正 Frame v1旧 PWA object-carrier mapping；详见 ADR 0015当前说明。

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
```

Provisioning/Data establishment failure本身不失败 Runtime、不 unwind Frame、不修改 Main DataAuthority。

---

## 9. Role-local Data Port Names

```text
RendererDataBinding
SubsystemDataBinding
```

它们是同一 DataConnectionBroker的两个 role-local projections；不使用含糊同名接口隐藏 owner。

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
system overview
→ platform composition
→ runtime hosting
→ stack / communication
→ rendering
→ subsystem model
→ runtime bootstrap synthesis
→ contracts/modules/implementation
```

---

## 11. Resulting Closed Loops

Downward：

```text
Business Definition
→ Author SDK
→ Role Core
→ Role-local Platform Ports
→ Platform Runner/Broker
→ Process/Worker/WS/Port
```

Upward：

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
```

---

## 12. Superseded Current-v1 Shapes

以下不再有效：

```text
Game Package launcher.type / launcher.entry / env
business module direct Node argv entry
PWA-specific business Descriptor
connectionProfile
MessagePort structured application object
PWA reference-compact-only carrier sizing
runtime.input/runtime.render service locator
raw child return without FrameOutcome
Runtime-fatal as catchable business rejection
```

历史只用于理解演进，不形成 compatibility obligation。

---

## 13. Re-evaluation

需要重新版本/架构评估的条件：

```text
conformant v1已经产生真实兼容义务
third-party/remote Runner需要公开 provisioning wire
multiple Renderer / remote Runtime改变 topology
新的 Data child protocol组合
Runtime restart/checkpoint要求跨 Runtime authority
```

从当前 first implementation baseline起，不再因为“实现还方便”而直接破坏 Frozen/Normative compatibility boundary。