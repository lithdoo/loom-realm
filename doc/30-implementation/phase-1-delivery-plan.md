# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、里程碑和关闭条件  
> 依赖：[仓库与分包方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

## 里程碑 0：文档与契约基线

已收敛/确认：

- Game Package v2 / Desktop Node.js Launcher Profile v1；
- **Subsystem Control v1 与 Runtime Control Profile v1 已实现前废弃，不进入实现；**
- **Subsystem Control v2 是唯一 current Runtime lifecycle协议；**
- **Runtime Control Application Profile v2 = Control v2 + Frame / Call v1；**
- Frame / Call Protocol v1 A-F全部 Frozen；
- Frame v1 Suspend Semantics Clarification；
- 每 Subsystem一个 Runtime Container；
- 每 current Renderer / Subsystem最多一个 current Data Connection；
- Render ownership=Subsystem；每 Runtime `0..N` Render Domains；
- Render Update incremental model已进入 Closure Candidate。

Frame v1 completion baseline：

```text
protocol loomrealm.frame-call / 1
no JSON-RPC Batch
Request ID positive safe integer / sender Connection lifetime no reuse
message <= 1 MiB / depth <=64 / business JsonValue <=512 KiB
frameId/activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
seven method deadlines 1s..5min sender-local monotonic
Desktop WebSocket / PWA MessagePort same application semantics
no Frame handshake/downgrade/partial-v1 claim
```

## 里程碑 1：Game Package v2 与 Desktop Runtime Bootstrap / Control v2

目标：零 Frame条件下完成 Runtime Bootstrap、Control identity、ready、normal shutdown与 failure convergence。

实现：

```text
Descriptor Loader / Validator
Entry Resolver
Node Launcher
Launch Attempt / Bootstrap Context
Runtime Supervisor
Control carrier
Subsystem Control v2 hello/status/shutdown
Control v2 semantic errors / limits
Runtime Control Profile v2 dispatcher / shared ID namespace
cleanup / finite termination
```

关闭条件：

```text
subsystem.hello selects protocol version 2
Control version 1 is never advertised/selected
spawn != connected != identified != ready
ready payload has no Renderer Data endpoint
ready does not imply Data Connection
stopped only from Supervisor
unexpected exit code 0 fails Runtime without shutdown intent
no automatic restart / same-attempt reconnect
```

Desktop Launcher Bootstrap Context仍是自己的 `version:1`；该版本不得被误解释为 Control v1。

## 里程碑 2：Frame / Call v1 实现与 Conformance

目标：实现 Frozen Frame / Call v1，并把 Conformance Profile落成 executable fixtures。

实现 Main-owned Frame/Stack/Activation/InputTarget、Subsystem Context、exact seven Requests、closed schema、Outcome、transaction barriers、timeout/no-retry、lowest-root fixed-point unwind、accepted outcome preservation与 fresh final Caller resume。

Runtime Control integration使用：

```text
Profile v2 = Control v2 + Frame v1
```

关闭条件：Main、Subsystem SDK、适用 Transport adapter通过对应 Frame v1 fixtures，包括 same-Subsystem recursion、limits/ID/deadline、Desktop/PWA semantic equivalence与 suspend clarification。

## 里程碑 3：Main ⇄ Renderer Control

状态：**协议 Draft已建立，核心 authority/recovery/limits高度闭合。**

目标：冻结 Main向 Renderer发布 committed Runtime / Frame / Activation / InputTarget / DataAuthority 的最小 authority-replication contract。

当前模型：

```text
renderer.hello
renderer.state(full Snapshot)
Session-local monotonic revision
revision gap/coalescing allowed
no replay / no patch
```

必须保持：

```text
activate/resume ACK-before-publication
revoked Activation never republished
InputTarget=null legal
published InputTarget lease revoke后 same frameId+activationId never re-granted
Renderer不计算 failure unwind
DataAuthority carries no endpoint/ticket/MessagePort
Control loss/replacement撤销 Renderer input/Data authority
```

关闭条件：完成 Frozen review + executable conformance fixtures + Desktop/PWA Control bootstrap/Profile边界确认。

## 里程碑 4：Renderer ⇄ Subsystem Data Connection

目标：实现 Data carrier identity/lifecycle，不把 bootstrap机制塞回 Runtime `ready`。

```text
identity
    Session
    + current Renderer participant
    + subsystemKey
    + generation

lifecycle
    current → retired

cardinality
    at most one current carrier per subsystem/current Renderer
```

`generation` 是 Main-owned Data authority epoch，不是 reconnect counter。

建立路径：

```text
Renderer Control DataAuthority
→ Host/Platform Binding
→ current Data Connection
```

Desktop endpoint/ticket与PWA MessagePort creation/transfer属于 Host binding/Profile。

关闭条件：

```text
serialized installation
no overlapping current carriers
same-generation reconnect only after old retired
Control loss retires all old Renderer Data carriers
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != Render Domain destroy
```

## 里程碑 5：User Input v1 Core + Standard Mapping

Core authority模型：

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

Domain：

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

Effective：

```text
current matching Data Connection
∩ Main current InputTarget/Activation
∩ current Input Interest
∩ Producer availability
```

Core关闭：State false→true fresh baseline、Event no replay/coalescing、Reset/implicit reset、Producer-loss teardown、same-generation reconnect、InputTarget one-shot lease。

随后单独冻结 Standard Input Mapping：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

包括 exact payload、coordinate/key mapping、limits、Event FIFO容量/overflow policy。

## 里程碑 6：Render Update v1 + Web Renderer

状态：

```text
Render Domain / Tree Architecture          Refined
Render Update Incremental Design           Closure Candidate
```

工作入口：[Render Update v1 Incremental Design](../15-contracts/render-update-v1-incremental-design.md)。

### Render Domain Model

每个 Subsystem Runtime MAY拥有：

```text
0..N Render Domains
```

Domain：

```text
domainId
zIndex
0..N ordered roots
```

Node：

```text
key       Domain-lifecycle one-shot logical identity
tag       logical Renderer Component type
attrs     string→string declarative attributes
data      JSON object component state
children  ordered child nodes
```

### Render Update 当前 closure candidate

方向严格：

```text
Subsystem → Renderer only
```

wire surface：

```text
render.domains
    full current Registry
    Domain lifecycle authority

render.snapshot(revision)
    fresh baseline / full authoritative commit

render.patch(baseRevision, revision)
    exact R → R+1 atomic incremental commit
    ops: insert / remove / move / update

render.event
    transient presentation impulse
    ordered against logical component commits
    no replay / no coalescing
```

核心 correctness：

```text
Domain one-shot lifecycle within DataAuthority generation
Node key one-shot within Domain lifecycle
sender lastEmittedRevision publication cursor
Patch requires base=current and revision=base+1
Patch applies to isolated candidate and commits atomically
remove creates patch-local tombstones
move uses detach-then-resolve
invalid authoritative commit cannot be skipped
continuity failure → retire Data carrier → fresh Registry + Snapshots
```

无：

```text
ACK / NACK
Patch history replay
resume cursor
Renderer→Subsystem resync RPC
cross-Domain transaction
render frame fence
```

### Backpressure

```text
small diff
    → Patch

large/complex/backpressured diff
    → Snapshot(lastEmittedRevision+1)

transient Event backlog
    → bounded FIFO / may drop
    → MUST NOT indefinitely block authoritative progress
```

### Remaining Completion

```text
domainId/key/tag grammar + limits
message/tree/node/op/attrs/data numeric limits
zIndex range
Event FIFO numeric policy
unknown/undeclared tag classification
closed-schema JSON encoding
conformance fixture matrix
```

完成这些后，把 incremental closure candidate合并回正式 `render-update-v1.md`，结束“双 v1事实”。

### Web Renderer 实现

实现：

```text
Render Domain Registry
Domain Store + revision
key/parent indexes
atomic Patch candidate engine
Domain Host
Renderer Component Registry
logical commit/Event processing queue
Global Domain Composer
```

必须保持：

```text
Frame suspend != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain lifecycle
Data Connection retire != authoritative Domain destroy
Domain/Node != Input authority
```

## 里程碑 7：Renderer Component Profile

冻结：

```text
tag grammar / declaration
(subsystemKey, tag) → Component Factory
component bootstrap/loading
per-tag attrs/data schema
unknown/undeclared tag classification
presentation pending/error semantics
resource-reference conventions
custom Input Producer registration lifecycle
```

Component implementation暂未加载不得直接被误判为 Render authoritative divergence。

## 里程碑 8：Content API 与 Content Access

实现 Safe Package Root、Catalog/Package Index、Readonly Content Service、resource/MIME/ETag/contentVersion/integrity。

Content API只定义读取语义；另行冻结 Content Access Bootstrap/Profile：capability issuance/distribution/rotation。

不得把 Content credential塞入 Frame params、Renderer Control Snapshot或 Render State。

## 里程碑 9：`loom.map` 最小运行时

实现：

```text
Subsystem Control v2 Adapter
Runtime Control Profile v2 dispatcher
Frame v1 Adapter / Validator / Deadline / Mutation Gate
business Runtime Core / Loop
movement / collision / Portal
Render Manager / Projector / Diff Engine
Data Connection / User Input / Render Update adapters
```

Render Manager发布 map/world/hud等 Render Domains，并支持 Snapshot/Patch策略。

## 里程碑 10：Pokémon Essentials 兼容工具链

定义中间 JSON、导入 Tile/Autotile/Passage/Priority/Character、Golden fixtures；受限素材不进入公共仓库。

## 里程碑 11：Hostra Desktop 闭环

Main与 Hostra authority分离；Desktop Host完成：

```text
Control v2 WebSocket binding
Renderer Control bootstrap
per-Subsystem Data endpoint/ticket binding
Renderer reload recovery
finite shutdown/force termination
```

endpoint/ticket不进入 Subsystem Control `ready`或 Renderer Authority Snapshot。

## 里程碑 12：PWA Bootstrap / 闭环

Main/Subsystem Dedicated Worker；冻结 Descriptor→Worker、bootstrap credential、Control MessagePort establishment；Control Port建立后使用 **Control v2 + Frame v1**。

Window⇄Subsystem Data carrier由 Host安全建立；Service Worker负责 Content API/OPFS。

PWA Profile不得重新定义 Frame version、Data generation、User Input recovery或 Render Domain authority semantics。

## 第一阶段最终验收

- 只实现/协商 Subsystem Control v2；Control v1无 fallback；
- Runtime Control Profile v2 = Control v2 + Frame v1；
- Launcher / Runtime Control符合适用 Normative Contract；
- Frame / Call v1适用角色通过 Conformance；
- stale Activation永久拒绝；
- Main⇄Renderer Control完成；
- DataAuthority与Data bootstrap material分离；
- Data Connection current/retired authority闭合；
- Data loss不触发 Runtime failure/Frame unwind；
- User Input Core + Standard Mapping满足定义；
- Render Update v1 Registry/Snapshot/Patch/Event模型完成；
- Patch revision/atomic/recovery闭合；
- 每 Subsystem支持 `0..N` Domains；
- Domain zIndex / multi-root / one-shot Node key闭合；
- Renderer Component tag resolution/profile完成；
- Frame不拥有 Domain；zero-frame Domain可工作；
- Content API只读且路径安全；Content capability distribution独立；
- Hostra/PWA Host只做平台 binding，不接管 Main authority。

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime recovery/restart、Control heartbeat、lazy/idle recycle、多 Runtime per key、Publisher Trust/signing、多主栈/Frame Graph、Frame migration、Activation reuse、caller-driven Frame cancellation、Frame RPC replay/resync、transparent partial-Runtime recovery、Frame runtime dynamic downgrade/capability negotiation、完整菜单/战斗/任务、多人同步、高级渲染优化、ZIP/ASAR/remote package、Render history replay、cross-Domain render transaction。
