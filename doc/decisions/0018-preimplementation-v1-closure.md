# ADR 0018：首次实现前直接收口当前 v1

> 状态：Accepted  
> 日期：2026-08-19  
> 影响范围：Game Package v1、Desktop Node Runner Profile v1、Subsystem SDK、Renderer Control/Data、Platform provisioning、package/document governance  
> 取代/修正：[ADR 0005](./0005-game-entry-subsystem-launchers.md) 的 launcher declaration 部分、[ADR 0007](./0007-subsystem-descriptor-mvp.md)、[ADR 0008](./0008-desktop-nodejs-launcher-profile-v1.md)  
> 延续：[ADR 0017](./0017-system-level-platform-composition.md)

## 背景

LoomRealm 尚未有需要兼容的 conformant v1 implementation。随着 Platform Composition、Subsystem SDK、Renderer Data 与 PWA realization继续闭合，早期 Desktop-first设计暴露出四个根因级断点：

```text
Game Package把 business topology 与 Node launcher technology耦合
Business Definition 到 physical Runtime entry之间缺少 Runner层
Runtime已启动后没有优雅的 late Data provisioning路径
Frame protocol failure/outcome没有完整映射到 author control-flow
```

如果为了保留尚未实现的旧文档而创建 v2，会人为制造不存在的兼容义务和双模型。

因此当前阶段明确允许直接重置现行 v1。

---

## 决策 1：不创建 v2，只保留一个当前 v1

在首次 conformant implementation/公开兼容承诺前：

> **当前 v1文档可以进行 breaking reset，以得到唯一、完整、可实现的 first implementation contract。**

旧形状只留在 Git/ADR历史，不保留 deprecated alias/dual parser/compatibility mode。

一旦某协议标记 Frozen且已有真实兼容承诺，则遵守对应冻结治理；本 ADR不授权修改已经 Frozen 的 Frame / Call v1 wire semantics。

---

## 决策 2：Game Package v1 只声明 platform-neutral Module

采用：

```ts
interface SubsystemDescriptorV1 {
  readonly key: string;
  readonly module: string;
}
```

删除旧：

```text
launcher.type
launcher.entry
descriptor.env
```

`module` 是 package-local `.mjs` Subsystem Definition Module，default export `SubsystemDefinitionFactory`。

Game Package声明：

```text
who = key
what business implementation = module
```

Platform决定：

```text
how to host/run it
```

---

## 决策 3：Business Definition Module 与 Platform Runner 分离

```text
same Definition Module
        │
   ┌────┴────┐
   ▼         ▼
Node Runner Worker Runner
```

Host-owned Runner是 Process/Worker entry；business module不是 Runtime entry policy。

Runner负责：

```text
load/validate Definition Module ABI
construct role-local Platform Ports
call @loomrealm/subsystem/host runSubsystem
```

---

## 决策 4：Subsystem SDK 分 author / host surface

```text
@loomrealm/subsystem
    business author API

@loomrealm/subsystem/host
    trusted Runner integration API
```

Author不见 carrier/bootstrap/generation/profile/Platform provisioning。

Host surface提供：

```text
runSubsystem
RuntimeControlBinding
SubsystemDataBinding
ContentClient integration
```

不建立 Runtime service locator或 module-global current context。

---

## 决策 5：FrameOutcome 显式映射 Frozen Frame v1

Author outcome：

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
    → typed rejection; current Activation remains valid

Runtime-fatal/ambiguous
    → MUST NOT re-enter business continuation
```

普通 uncaught business exception在 authority仍健康时转换为 Frame failed outcome；protocol ambiguity/invariant corruption属于 Runtime failure。

这确保 SDK ergonomics不能绕过 Frame v1 commit/Activation semantics。

---

## 决策 6：DataAuthority 选择完整 Data Application Profile

Renderer Control使用：

```text
DataAuthority {
  subsystemKey,
  generation,
  dataProfile
}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

旧 `connectionProfile` 名称删除。

`dataProfile` 是 complete application stack identity；同 generation immutable；Profile改变必须 fresh generation。

---

## 决策 7：所有 current message-oriented profiles统一 JSON text carrier unit

```text
one carrier application unit
= one UTF-8 JSON text string
```

```text
WebSocket   text message
MessagePort postMessage(string)
Memory      string
```

Structured Clone只用于 Platform bootstrap/Port transfer，不形成第二套 application value model。

Foundation仍把 carrier string视为 opaque；JSON语义属于 wire/Profile。

---

## 决策 8：Late Data provisioning 是独立 Platform infrastructure

Runtime `ready` 不携 Data material。

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

## 决策 9：Role-local Data ports 明确两端命名

```text
RendererDataBinding
SubsystemDataBinding
```

它们是同一 DataConnectionBroker 的两个 role-local projections，不用同名接口隐藏 owner。

---

## 决策 10：文档主要定义依赖必须是 DAG

文档 metadata区分：

```text
依赖
    true definition dependency

正式化 / 被细化 / 被实现
    downward realization relation

相关
    cross reference only
```

不得用互相“依赖”制造双事实源。

当前主架构定义顺序收敛为：

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

## 结果

系统现在拥有两条完整且方向清楚的链：

```text
Business Definition
→ Author SDK
→ Role Core
→ Role-local Platform Ports
→ Platform Runner/Broker
→ physical Process/Worker/WS/Port
```

以及：

```text
Formal Protocol facts
→ SDK capability/control-flow
→ business-observable Outcome
```

任何一层都不需要 service locator、ambient platform context、隐式 Activation恢复或 magic carrier。

---

## 被取代的旧结论

以下不再是 current v1：

```text
Game Package launcher.type=nodejs
Game Package launcher.entry
descriptor.env
business module direct Node argv entry
PWA需要另一套 business Descriptor
connectionProfile
MessagePort structured application object
runtime.input/runtime.render author service locator
raw child return value without FrameOutcome
Runtime-fatal as catchable business rejection
```

历史只用于理解演进，不形成兼容要求。

---

## 重新评估条件

- 已发布/部署的 conformant v1产生真实兼容义务；
- remote/third-party Runner要求公开 Platform provisioning wire；
- multiple Renderer或 remote Runtime改变 Data broker topology；
- 新 Data child protocol组合需要新的 Data Profile identity；
- Runtime restart/checkpoint要求跨 Runtime保存新的 authority state。

在这些条件出现前，不为预测性兼容引入 v2/兼容壳。