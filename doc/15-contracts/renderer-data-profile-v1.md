# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：Active Design / Draft  
> Profile 版本：1  
> Profile 标识：`loomrealm.renderer-data/1`  
> 稳定程度：Stabilizing  
> 主要定义：Renderer ⇄ Subsystem current Data Connection 上 Data Connection v1、User Input v1 与 Render Update v1 的版本绑定、message mapping、demux 与 fresh-carrier 组合规则  
> 依赖：[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[User Input v1](./user-input-v1.md)、[Render Update v1](./render-update-v1.md)  
> 上游 authority：[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **DataAuthority 选择一套完整 Data Application Profile；Profile v1 静态绑定 Connection v1 + User Input v1 + Render Update v1。它不增加握手、ACK、RPC 或新的业务 authority。**

---

## 1. Composition

```text
Renderer Data Application Profile v1
├── Data Connection Contract v1
├── User Input Protocol v1
└── Render Update Protocol v1
```

固定版本：

```text
Data Connection = 1
User Input      = 1
Render Update   = 1
```

Profile 标识固定为：

```text
loomrealm.renderer-data/1
```

任何实现声明支持本 Profile，MUST 完整支持上述三者；不得只支持其中一部分后仍宣称支持 `loomrealm.renderer-data/1`。

---

## 2. Profile Selection

Main 通过 Renderer Control 的逻辑 authority 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: "loomrealm.renderer-data/1";
}
```

`dataProfile` 是完整 Data application stack identity，不是 transport 名称，也不是 credential。

```text
dataProfile != websocket
dataProfile != messageport
dataProfile != endpoint/ticket
```

v1 不定义 Data-side hello/version negotiation。Platform Data Connection Broker 只有在 Renderer 与目标 Subsystem 都能承担该 `dataProfile` 时，才可把 carrier 安装为 current。

如果当前 authority 的 `dataProfile` 无法实现：

```text
Data Connection remains absent
```

这本身不等于 Runtime failure，也不改变 Frame authority。

若 Main 要把同一 Subsystem 的 current Data stack 换成不同 Profile，MUST 作为 DataAuthority replacement 处理并使用 fresh generation；不得在同 generation 中静默改变 Profile semantics。

---

## 3. Application Unit / Encoding

所有 LoomRealm message-oriented carrier 的本 Profile mapping 固定为：

```text
one carrier application unit
=
one UTF-8 JSON text string
=
one child-protocol message object
```

因此：

### Desktop WebSocket

```text
one complete WebSocket text message
=
one UTF-8 JSON text application unit
```

binary frame MUST NOT承载本 Profile application message。

### PWA MessagePort

```text
postMessage(string)
=
one UTF-8 JSON text application unit
```

PWA MUST NOT直接 postMessage structured application object 来扩大 value model。

Structured Clone / Transferable 只可用于 Platform bootstrap，例如转移 `MessagePort` 本身；进入 current Data carrier 后的 application payload 仍是 JSON text。

禁止：

```text
undefined
BigInt
NaN / Infinity
ArrayBuffer / Blob
MessagePort / Host object
Function / Symbol
JSON-RPC Batch
multiple application messages in one carrier unit
```

每条消息在进入 child-protocol parser 前必须先满足共同 JSON/wire 基础约束；具体 schema/limits 继续由所属 child protocol定义。

---

## 4. Message Demultiplexing

Connection Core v1 本身定义 zero application messages。

Profile v1 的 Data application message 只有两个 namespace：

```text
input.*   → User Input v1
render.*  → Render Update v1
```

当前类型族：

```text
User Input
    input.interest
    input.state
    input.event
    input.reset

Render Update
    render.domains
    render.snapshot
    render.patch
    render.event
```

实现 MUST 由一个 connection-wide Data dispatcher 消费唯一 inbound stream，再按 `type` 分派到 child protocol；不得让 Input/Render 两个独立 reader 竞争消费同一 carrier。

unknown `type`、跨 namespace schema mismatch 或 malformed JSON 按所属 Profile/child protocol的 fail-closed policy处理；不得猜测或降级解释。

---

## 5. Ordering Boundary

Data carrier MUST保持 per-direction application-unit order。

因此同方向已 emitted 的 Input/Render message 在物理上有明确顺序，但 Profile **不创建跨 child protocol transaction 或 shared revision space**。

```text
User Input ordering/recovery
    owned by User Input v1

Render ordering/recovery
    owned by Render Update v1
```

不得因为共享 carrier 引入：

```text
shared Data revision
Input↔Render ACK join
cross-domain atomic commit
cross-domain replay cursor
```

Renderer Control Connection 与 Data Connection仍然不存在跨连接 total order。

---

## 6. Fresh Carrier Baseline

每条 fresh current carrier 都是新的 child-protocol publication boundary。

### User Input

固定从：

```text
remote Frame Interest Registry = empty
retained Input State = empty
Event history = empty
```

开始。

Subsystem 如仍希望 live Frames 接收输入，重新发布 current full Frame Interest Registry；`.state` 重新建立 fresh baseline，`.event` future-only。

### Render Update

fresh carrier：

```text
first Render message = current render.domains
→ fresh render.snapshot for each current Domain before Patch/Event
```

旧 carrier publication cursor/revision base不能作为 fresh carrier authority。

### Independence

```text
Input fresh baseline != Render Domain recreation
Render fresh baseline != Frame recovery
Data reconnect       != Runtime restart
```

---

## 7. Connection / Profile Identity

Data Connection Core identity仍是：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

但 current gate 还必须满足：

```text
bound dataProfile == Main current DataAuthority.dataProfile
```

`dataProfile` 是该 generation 的 immutable profile attribute。Profile mismatch 的 carrier不得成为 current。

---

## 8. Failure Boundary

以下只 retire / prevent current Data Connection，不直接导致 Runtime failure：

```text
unsupported dataProfile
Data carrier loss
Data carrier establishment failure
same-generation reconnect failure
Renderer reload
Data child-protocol connection-local state loss
```

Runtime failure仍只由 Runtime Control / Supervisor authority决定。

Child protocol收到 malformed/invalid application message时，至少 MUST停止使用该 current Data carrier；是否还触发 Renderer participant failure等更高层 policy由对应 role/Platform决定，但不得把 Data-plane错误伪造成 Frame RPC commit/recovery。

---

## 9. Limits

本 Profile不建立第二套与 child protocol冲突的业务 limits。

共同要求：

```text
UTF-8 JSON text
plain JSON-compatible values
closed child-protocol schema
finite/safe-integer semantics where specified
bounded receiver queues
```

message size/depth/count的 hard values由 User Input v1 / Render Update v1各自冻结；同一 carrier implementation必须能够在接收前执行适用的统一 hard cap，不得先无界 parse/buffer 后再拒绝。

如果未来需要一个跨所有 Data child protocol统一的更严格 hard cap，应直接修订本 Profile v1 当前规范（在冻结前）或发布明确的新 Profile；不得由 Desktop/PWA各自默默选择不兼容值。

---

## 10. Version Evolution

以下任一改变都不能在 `loomrealm.renderer-data/1` 下静默发生：

```text
Data Connection protocol version
User Input protocol version
Render Update protocol version
application-unit encoding/mapping
message namespace ownership
```

未来不同组合必须使用明确的新 Data Profile identity。

例如不能让：

```text
loomrealm.renderer-data/1
```

在某个部署解释为 `Input v2 + Render v1`，另一个部署仍解释为 `Input v1 + Render v1`。

---

## 11. Conformance

至少覆盖：

```text
data-profile-exact-identity
profile-binds-connection1-input1-render1
unsupported-profile-no-current-connection
profile-change-requires-fresh-generation

websocket-text-application-unit
messageport-string-application-unit
structured-clone-does-not-widen-payload
one-json-message-per-unit
no-jsonrpc-batch

single-data-dispatcher
input-type-routes-to-input
render-type-routes-to-render
unknown-type-fail-closed

fresh-carrier-input-empty-baseline
fresh-carrier-render-registry-snapshot-baseline
input-render-state-independent
control-data-no-total-order

data-loss-does-not-fail-runtime
hostra-pwa-same-data-application-trace
```

---

## 12. Final Invariants

1. `loomrealm.renderer-data/1` = Connection v1 + User Input v1 + Render Update v1；
2. Profile不新增 Data handshake/RPC/ACK；
3. DataAuthority 使用 `dataProfile` 选择完整 stack；
4. `dataProfile` 不是 transport/credential；
5. Profile改变必须伴随 fresh DataAuthority generation；
6. application unit统一为一条 UTF-8 JSON text string；
7. WebSocket/MessagePort不得产生不同 application value model；
8. one connection-wide dispatcher负责 Input/Render demux；
9. User Input 与 Render保持独立 state/revision/recovery；
10. fresh carrier分别建立 child-protocol fresh baseline；
11. Control/Data无跨连接 total order；
12. Data-plane failure不等于 Runtime/Frame failure。