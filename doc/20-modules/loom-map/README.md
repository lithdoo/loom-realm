# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和依赖方向  
> 依赖：[模块子系统模型](../../10-architecture/subsystem-model.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Render Update Incremental Design](../../15-contracts/render-update-v1-incremental-design.md)  
> 最近复核：2026-08-09

`loom.map` 是第一阶段纵向切片。内部模块不是所有 Subsystem 的公共要求。

## 1. 模块结构

```text
loom.map
├── Subsystem Control v1 Adapter
├── Runtime Control Profile v1 Dispatcher
├── Frame / Call Adapter
│   ├── Protocol Validator
│   ├── Shared Request ID Allocator
│   ├── Outbound Mutation Gate
│   └── Frame RPC Deadline / Failure Handler
├── User Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Execution Loop / Core / World State
├── Render Manager
│   ├── Domain Registry
│   ├── Domain Tree Projectors
│   ├── Published Revision / Snapshot Store
│   └── Patch Diff Generator
└── Pokémon Essentials Compatibility Compiler
```

一个 map Runtime可服务多个 Frame，并共享 world/cache/loop/render domains。

## 2. Runtime Control

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

Bootstrap：

```text
subsystem.hello { protocolVersions:[1] }
→ identified
→ optional initializing
→ subsystem.status({state:"ready"})
```

`ready`不携 Renderer Data endpoint，也不表示 Data Connection已建立。

## 3. Frame Context / RPC

Frame / Call Protocol v1保持 Active / Normative / Frozen。

```ts
interface MapFrameContext {
  readonly frameId: string;
  state: "starting" | "active" | "suspended" | "closing" | "closed";
  currentActivationId: string | null;
}
```

不保存公共 caller/Stack/recovery authority。Frame/Activation不由地图生成/复用。

RPC exactly seven：initialize/activate/suspend/resume/close/call/return。

## 4. Shared Control Dispatcher

Control v1 + Frame v1共享 authenticated Control carrier：

```text
one transport unit = one JSON-RPC message
no JSON-RPC Batch
shared sender-side Request ID namespace
```

Map Runtime outbound sender namespace覆盖：

```text
subsystem.hello
frame.call
frame.return
```

Request ID=positive safe integer，同一 Control Connection生命周期内不复用。

Frame v1由 Profile v1静态绑定；不实现 `frame.hello/version/capabilities`。

## 5. Frame Validator / Deadline / Mutation Gate

Map Adapter复用 Frozen Frame v1 validator：

```text
plain JSON
finite number / safe integer
closed schema
message <=1 MiB
JSON depth <=64
business JsonValue <=512 KiB
frameId / activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
```

call/return使用 sender-local monotonic deadline `1000..300000ms`。

outbound call/return pending：stop new ordinary input + block second call/return。

```text
Success
    → local suspended/closing commit
Recoverable Explicit Error
    → release gate
Fatal Explicit Error / timeout/loss
    → no return to old Activation
    → Runtime failure
```

No retry/replay/idempotency journal。

## 6. Incoming Frame Control

`frame.initialize`可用 `FRAME_INITIALIZE_REJECTED + FrameFailure`做业务拒绝，Context未 commit且 Runtime healthy。

合法 activate/suspend/resume/close的 identity/lifecycle/Activation mismatch是 divergence，不私有 resync。

`resume`=Child outcome + replacement Activation；`close`只清该 Frame/Input Context，不停止 Runtime、不删除共享 world/cache/Render Domains。

## 7. Runtime Failure Boundary

地图 Runtime terminal failed后：

```text
MUST NOT自行恢复 suspended Frame
MUST NOT恢复旧 Activation
MUST NOT决定 Stack unwind root
```

Control可用时通过 `subsystem.status(failed)`报告 Runtime self-failure。

Main按 lowest failed-runtime occurrence + fixed-point规则收敛 doomed suffix。

## 8. User Input Adapter

普通输入至少验证：

```text
current Data Connection
frameId exists
Frame local active
activationId current
channel in local current Interest
no mutation gate
```

Main公共 ordinary input authority由 Renderer Core依据 current InputTarget执行 sender-side gate。

Render Domain/Node identity不参与 ordinary input authority；Renderer Component产生的 `x.*` Channel仍服从 User Input Effective Channel模型。

## 9. Render Domain Model

示例：

```text
world Domain        zIndex=0
hud Domain          zIndex=100
loading Domain      zIndex=200
debug Domain        zIndex=1000
```

Domain names/zIndex只是业务示例，不是公共标准。

每个 Domain：

```text
domainId
zIndex
0..N ordered roots
```

Node：

```text
key       Domain lifecycle内 one-shot logical identity
tag       map-owned logical Renderer Component type
attrs     string→string
data      JSON object
children  ordered nodes
```

Domain Host不是 Node，不需要 fake root。

## 10. Render Publication Model

当前 Render Update实现目标：

```text
render.domains
    current Domain Registry

render.snapshot(revision)
    fresh baseline / full commit

render.patch(baseRevision, revision)
    exact R → R+1 atomic incremental commit
    insert / remove / move / update

render.event
    transient presentation impulse
```

Subsystem sender对每个 current carrier + Domain维护：

```text
lastEmittedRevision
last published logical Domain Tree
new desired Domain Tree
```

Projector / Diff Engine根据 stable key计算 Patch；业务逻辑不直接拼 wire operations。

## 11. Patch Generation

```text
old has / new missing
    → remove

old missing / new has
    → insert subtree

same key parent/order changed
    → move

same key attrs/data changed
    → update

same key tag changed
    → modeling error; remove old + insert fresh key
```

Patch从 `lastEmittedRevision`精确转换到 `R+1`，不是业务 mutation counter。

当 diff过大/复杂/队列压力高时，可以发送 full Snapshot(`lastEmittedRevision+1`)作为下一次 authoritative commit。

## 12. Render Recovery

fresh Data Connection：

```text
render.domains
→ fresh Snapshot for every current Domain
→ ordinary Patch/Event
```

Renderer旧 presentation cache不能作为 Patch base。

authoritative continuity/validation failure：

```text
retire current Data carrier
→ if generation still current, establish fresh carrier
→ Registry + fresh Snapshots
```

无 Renderer→Subsystem render resync RPC、Patch replay、ACK/NACK。

## 13. Renderer Component Boundary

```text
(loom.map, tag)
→ Renderer Component Factory
```

典型 tag例如 `map-world`、`map-character-layer`、`map-hud`，但 exact标准由 Renderer Component Profile冻结。

Component implementation加载不属于 Render State；wire不得传 executable code。

Component MAY产生 `x.*` User Input Producer，但 Component existence本身不产生 InputTarget authority。

## 14. Frame / Domain / Data Independence

```text
Frame close != Domain destroy
Frame suspend != Domain hidden
Activation change != Domain lifecycle
Runtime ready != Data Connection exists
Data retire != authoritative Domain destroy
```

Runtime terminal failure最终会使 Main撤销相应 DataAuthority，但 Frame/Data/Render各自按照自己的 authority/lifecycle收敛。

## 15. Tests

除 Frame v1 Subsystem conformance外，至少覆盖：

```text
control-v1-version-selection
ready-has-no-data-endpoint
shared-control-frame-request-id

call-pending-gate
initialize-business-reject
frame-rpc-timeout-no-retry
same-subsystem-recursive
runtime-failed-does-not-local-resume
stale-activation-rejected

zero-frame-render-domain
multi-domain-map-render
multi-root-domain
published-node-key-one-shot
snapshot-fresh-baseline
patch-R-to-R-plus-1
patch-insert-remove-move-update
patch-atomic-no-partial-apply
snapshot-fallback-under-backpressure
render-event-barrier
same-generation-reconnect-fresh-snapshots
frame-close-does-not-destroy-domain
```

## 16. 不得恢复的旧模型

```text
ready.rendererDataEndpoint
per-Frame mandatory Core/Render
Frame status=failed / Frame ready
Activation reuse
system.call
call→reverse-suspend
timeout→retry
caller remote cancel
partial same-runtime unwind
Frame close=Render destroy
Snapshot-only Render transport
```
