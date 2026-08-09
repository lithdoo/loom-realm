# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

## 里程碑 0：文档与契约基线

已确认：

```text
Game Package v1
Desktop Node.js Launcher v1
Subsystem Control v1
Runtime Control Profile v1 = Control v1 + Frame v1
Frame / Call v1 Frozen
Renderer Control v1 Draft / near closure
Data Connection v1 lifecycle closed
User Input v1 Core closure candidate
Render Update v1 single canonical closure candidate
Content API v1
```

已删除/取消：

```text
历史未实现协议正文
Render Update 双 v1 文档
Frame Suspend 独立 clarification 文档
Renderer Component Profile
Standard Input Mapping Profile
Content Access Profile
Range Profile
Event FIFO numeric Profile
Desktop/PWA Data Bootstrap application protocol
```

治理原则：只有跨实现必须一致的 observable semantics 才进入 `15-contracts`。

---

## 里程碑 1：Game Package / Desktop Bootstrap / Control

实现：

```text
Descriptor Loader / Validator
Entry Resolver
Node Launcher
Launch Attempt / Bootstrap Context
Runtime Supervisor
Control carrier
Subsystem Control v1 hello/status/shutdown
Runtime Control Profile v1 dispatcher / shared ID namespace
finite cleanup
```

关闭：

```text
hello selects Control v1
spawn != connected != identified != ready
ready has no Data endpoint
stopped only from Supervisor
unexpected exit/control loss fails Runtime
no automatic restart / same-attempt reconnect
```

---

## 里程碑 2：Frame / Call v1 + Conformance

实现 Frozen Frame v1：Main-owned Frame/Stack/Activation/InputTarget、exact seven Requests、closed schema、commit barriers、timeout/no-retry、lowest-root fixed-point unwind、accepted outcome preservation、fresh final Caller resume。

Suspend 已属于主协议：

```text
child-call suspended
    → corresponding child outcome + fresh frame.resume

administrative frame.suspend
    → no generic v1 resume
    → close/failure cleanup only
```

关闭：Main、Subsystem SDK、Desktop/PWA Transport adapter通过适用 fixtureSetRevision。

---

## 里程碑 3：Main ⇄ Renderer Control

目标：冻结 Main 向 Renderer 复制 committed authority 的最小 contract：

```text
renderer.hello
renderer.state(full Snapshot)
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

必须保持：

```text
ACK-before-publication
InputTarget one-shot
DataAuthority has no endpoint/token/Port
Control loss revokes Renderer input/Data authority
Renderer does not compute failure unwind
```

关闭：Frozen review + executable fixtures。

Renderer Control token/WebSocket/MessagePort 如何交付由 Host 实现，不另建 bootstrap protocol。

---

## 里程碑 4：Renderer ⇄ Subsystem Data Connection + Host Binding

Data Connection只实现：

```text
identity
    Session + current Renderer + subsystemKey + generation

lifecycle
    current → retired

cardinality
    max one current carrier per current Renderer/subsystem
```

Desktop/PWA Host 自己建立实际 carrier：

```text
Desktop MAY use localhost WebSocket + one-shot ticket
PWA MAY use MessageChannel/MessagePort
```

Host 机制不进入 application contract，只需证明 carrier 安装前绑定正确 Session/Renderer/subsystem/generation。

关闭：

```text
serialized installation
no overlapping current carriers
same-generation reestablish only after old retired
Control loss retires old Renderer carriers
Data loss != Runtime failure
Data loss != Frame unwind
```

---

## 里程碑 5：User Input v1

Core：

```text
Main InputTarget/Activation authority
∩ Subsystem Interest
∩ Producer availability
```

方向：

```text
Subsystem → Renderer  Interest
Renderer → Subsystem  State / Event / Reset
```

Core关闭：State fresh baseline、Event future-only/no replay、Reset/implicit reset、Producer-loss teardown、same-generation reconnect、InputTarget one-shot。

剩余直接补进 **User Input v1**：

```text
keyboard.state/event canonical payload
pointer.state/event canonical payload
gamepad.state/event canonical payload
identifier/coordinate/button semantics required for interop
wire size/depth/count/numeric limits
```

不另建 Standard Input Mapping Profile。

以下属于 Renderer implementation：DOM/OS/device adapter、polling cadence、内部 mapping table。

Event queue只要求 bounded + surviving order + no replay；具体容量/drop preference不协议化。

---

## 里程碑 6：Render Update v1 + Web Renderer

唯一工作入口：[Render Update v1](../15-contracts/render-update-v1.md)。

```text
render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)
render.event
```

关键 correctness：

```text
Domain one-shot lifecycle
Node key Domain-lifecycle one-shot
same live key stable opaque tag
fresh connection Registry + Snapshots
baseline后 exact R→R+1
Patch atomic insert/remove/move/update
continuity failure → retire carrier → fresh baseline
no ACK/NACK/replay/resync
```

剩余：

```text
domainId/key grammar + byte limits
tag byte limit only
message/tree/node/op/attrs/data limits
zIndex range
closed-schema encoding
conformance fixture matrix
```

不再存在 unknown-tag/Component Profile/Event FIFO Profile closure item。

Web Renderer内部可自由实现：

```text
Domain Store/index
Patch engine
Registry/Factory/component mapping
DOM/Canvas/WebGL presentation
scheduler/cache
```

这些不是 protocol conformance。

---

## 里程碑 7：Content API

实现：

```text
Safe Package Root
Package Index
Readonly Content Service
manifest/record/group/resource GET+HEAD
MIME / ETag / contentVersion / integrity
Desktop bearer request authorization
PWA same-origin Service Worker authority
```

Host 自行负责 Desktop grant issuance/injection/rotation；不建立 Content Access Profile。

Range 若启用直接遵守标准 HTTP Range；body/resource/concurrency/rate/timeouts 是 bounded deployment configuration。

关闭：Content API conformance + credential/path leak safety tests。

---

## 里程碑 8：`loom.map` 最小 Runtime

实现：

```text
Subsystem Control Adapter
Runtime Control dispatcher
Frame Adapter / Validator / Deadline / Mutation Gate
business Runtime Core / Loop
movement / collision / Portal
Render Manager / Projector / Diff Engine
Data Connection / User Input / Render Update adapters
```

Render Manager支持 `0..N` Domains 与 Snapshot/Patch策略。

---

## 里程碑 9：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixtures；受限素材不进入公共仓库。

---

## 里程碑 10：Hostra Desktop 闭环

```text
Control WebSocket binding
Renderer Control token/bootstrap internal flow
per-Subsystem Data carrier establishment
Content bearer injection
Renderer reload recovery
finite shutdown/force termination
```

Hostra不接管 Main authority，endpoint/ticket不进入 Subsystem `ready` 或 Renderer Authority Snapshot。

---

## 里程碑 11：PWA 闭环

```text
Main/Subsystem Dedicated Worker
Host-created Control MessagePort
Control v1 + Frame v1 application semantics
Host-created Renderer⇄Subsystem Data MessagePort
Service Worker Content API / OPFS
```

Worker/Port creation是 Host implementation，不定义额外 LoomRealm bootstrap application protocol。

---

## 第一阶段最终验收

- Game Package / Launcher / Control / Runtime Profile实现；
- Frame v1适用角色通过 Conformance；
- suspend provenance行为符合主协议；
- Renderer Control authority闭合；
- Data Connection current/retired闭合且 Host binding不污染 logical authority；
- User Input Core + standard canonical payload完成；
- Render Update Registry/Snapshot/Patch/Event完成 hard limits/conformance；
- `tag` 不产生协议级组件语义；
- Content API只读/路径安全/鉴权正确，Host credential delivery保持内部；
- Desktop/PWA共享 application semantics，平台差异留在 Host implementation。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、lazy recycle、多 Runtime per key、Publisher signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven cancellation、Frame replay/resync、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package、Render history replay、cross-Domain transaction。
