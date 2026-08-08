# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本、Profile、迁移与当前冻结边界  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-08

契约层定义不同实现必须共同遵守的可互操作语义。系统架构说明 ownership；契约冻结 identity、wire、state、ordering、error、recovery、limits、version/Profile。

协议边界清理决策见 [ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)。核心原则：

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

共享 Transport 不代表共享 identity / lifecycle / authority / sequence / recovery。

## 1. 当前协议地图

```text
Game Package v2
    ↓
Desktop Node.js Launcher v1
    ↓
Subsystem Control
    ├── v1 Frozen（Desktop-compatible historical baseline）
    └── v2 Draft（Runtime lifecycle only）
    ↓
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1

Frame / Call v1
    + Conformance v1
    + Suspend Semantics Clarification

Main ⇄ Renderer Control v1 Draft
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection Contract v1 Draft
    ↓ current carrier
User Input v1 Core Draft
    ├── Subsystem → Renderer: Input Interest
    └── Renderer → Subsystem: State / Event / Reset
Render Update v1                         next major data protocol
Render State Contract v1

Readonly Content API v1
    + future Content Access Bootstrap/Profile
```

## 2. 已冻结基线

### Game Package v2 / Desktop Launcher

- Game Entry一次性声明 required Subsystem Descriptor；
- `descriptor.key` 是 Runtime identity；
- Desktop Launcher=`nodejs`；
- Entry/env/path/trust/spawn/Supervisor边界已冻结；
- `shell=false`；Host选择 Node Runtime；
- Bootstrap authentication state在 spawn前建立；
- unexpected exit code 0 仍是 failure；
- no automatic restart。

入口：

- [Game Package v2](./game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)

### Subsystem Control v1

[Subsystem Control v1](./subsystem-control-lifecycle-protocol.md) 已 Frozen。

核心：

```text
spawn != connected != identified != ready
hello binds descriptor.key
Main owns shutdown intent
stopping != stopped
stopped only from Supervisor
unexpected Control loss/exit without shutdown intent = failure
```

v1 的 `ready.rendererDataEndpoint` 是早期 Desktop binding；closed schema保持历史兼容，不扩展到 PWA。跨 Desktop/PWA 收敛方向使用 Subsystem Control v2。

### Runtime Control Application Profile v1

[Runtime Control Profile v1](./runtime-control-profile-v1.md) 冻结：

```text
Subsystem Control v1
+
Frame / Call v1
```

同一 authenticated Control Connection；hello前无 Frame；同 sender跨 Control+Frame共享 connection-lifetime positive-safe-integer Request-ID namespace；no JSON-RPC Batch。

不得静默把未来 Data domain 加进 Profile v1。

### Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) 已整体 Active / Normative / Frozen。

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心 Frozen semantics：

```text
Frame/Stack/Activation/InputTarget authority = Main
frameId/activationId Session unique / never reused
revoked Activation never valid again
call/return acceptance commit barrier
Response-before-dependent-RPC
activate/resume ACK-before-InputTarget publication
Success = known commit
Explicit Error = known no-commit
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime occurrence → whole suffix fixed-point unwind
accepted outcome preserved
surviving Caller fresh resume
Frame lifecycle != Render/Data lifecycle
```

规范性伴随文档：

- [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md)
- [Frame / Call v1 Suspend Semantics Clarification](./frame-call-v1-suspend-clarification.md)

显式 administrative `frame.suspend` 在 v1 无 generic reactivation；child-call suspension仍由既有 child outcome `frame.resume` 恢复。

## 3. Subsystem Control v2 Draft

[Subsystem Control v2](./subsystem-control-protocol-v2.md) 是新的跨 Desktop/PWA 收敛方向。

```text
ready = Runtime lifecycle readiness only
```

不再携带 rendererDataEndpoint / Data Port / Data credential。Data carrier establishment退出 Runtime lifecycle。

Frame / Call v1 不需要因此升级。

## 4. Main ⇄ Renderer Control v1 Draft

[Renderer Control v1](./main-renderer-control-v1.md) 是 Main → Renderer committed authority replication：

```text
renderer.hello
renderer.state(full Snapshot)
```

Snapshot包含 Runtime projection、Frame Stack、current Activation、InputTarget 与逻辑 DataAuthority；不包含 Data endpoint / MessagePort / bearer Data token / Render State / Content Grant。

核心恢复模型：

```text
full Snapshot
Session-local monotonic revision
revision gap/coalescing allowed
no replay / no patch
Control loss → invalidate InputTarget/DataAuthority → retire Data Connections
```

User Input 依赖的 InputTarget 现在明确为 one-shot lease：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId MUST NOT become InputTarget again
```

因此 snapshot coalescing 不需要保留中间 null revision，也不会隐藏 same-authority revoke→regrant。

## 5. Renderer ⇄ Subsystem Data Connection Contract v1 Draft

权威草案：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)。

该 Contract没有 application wire methods，只冻结建立后 Data carrier 的 authority/lifecycle：

```text
identity
    Session + current Renderer participant + subsystemKey + generation

generation
    Main-owned Data authority epoch
    != transport reconnect counter

lifecycle
    current → retired
    retired terminal

cardinality
    per Renderer participant + subsystemKey
    at most one current carrier
```

Current-carrier installation MUST serialized；并发 establishment attempt 至多一个成为 current。

以下事件 retire current connection：carrier loss、DataAuthority removal/replacement、Renderer Control loss、Renderer participant replacement、Session end。

同 generation仍被授权时，旧 carrier retired 后 MAY 建立 fresh current carrier。

User Input 在该 current carrier 上是一个双向 application domain：

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

Connection Core仍不解释这些业务消息。

重要边界：

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != Render destroy
```

Host/Platform如何建立 WebSocket/MessagePort、ticket/capability如何交付不属于本 Contract。

## 6. User Input Protocol v1 Core Draft

权威草案：[Renderer ⇄ Subsystem User Input Protocol v1](./user-input-v1.md)。

### Authority / Trust

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

wire authority identity只需要 `frameId + activationId`；不重复 subsystemKey/sessionId/generation。

Subsystem不能从 User Input wire独立证明 Main当前 `InputTarget` 非空；v1 不增加 signed input capability。

### Input Channel / Input Interest

标准 Channel：

```text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
```

自定义 Renderer component：

```text
x.<custom-name>.state
x.<custom-name>.event
```

`Input Interest`：

```text
Subsystem → Renderer
full replacement exact set
new Data Connection default = empty
Runtime/Data-Connection scoped
no wildcard
not authority
```

Interest缩小时，Subsystem先更新自身 local gate，因此迟到旧消息会被丢弃，不需要 ACK/revision。

### Effective Input Channel

对 exact Channel `C`：

```text
Effective(C)
=
current matching Data Connection
∧ Main current InputTarget matches this Subsystem
∧ active/current Activation matches
∧ C ∈ current Input Interest
∧ Producer(C) available
```

所以 Interest和Producer availability都只能缩小输入面，不能扩大 Main authority。

### State / Event / Reset

```text
.state
    self-contained current-state snapshot
    every non-effective→effective transition establishes fresh baseline
    latest wins / may coalesce

.event
    ordered transient event
    future events only
    no coalescing / no replay
    not sole persistent held-state representation

reset
    clears all input state for frameId + activationId
    global ordering/coalescing barrier
```

Event与Reset都是 State coalescing barrier。

InputTarget撤销时 Renderer在旧 Data Connection仍 current 的情况下 best-effort Reset immediately previous target。

Effective `.state` Producer消失而 authority仍有效时：

```text
Reset current Activation
→ fresh baselines for remaining Effective State Channels
```

Activation replacement、Connection retired、Renderer Control loss/replacement、Session end仍是 implicit reset boundary。

User Input无 transactional ACK；input/Data loss、Interest传播 gap、Producer availability change、State coalescing和 Event overflow本身都不构成 Runtime failure或 Frame unwind。

当前尚待收敛：

```text
standard Channel exact payload schemas
message encoding / limits
Channel/count limits
Event queue numeric limits / overflow final policy
text/IME boundary
```

## 7. Render Update / Render State

下一主要数据协议目标：Render Update v1。

它必须独立于 Frame/Input authority，负责 Subsystem-owned Render identity、revision、snapshot/update/recovery 与 backpressure。

```text
Frame suspend != Render hidden
Frame close/unwind != Render destroy
Activation replacement != Render epoch
Data reconnect recovery != Frame recovery
```

Render State Contract定义被 Render Update携带的声明式 presentation state，不应把 DOM/Canvas/WebGL对象直接变成 authority state。

## 8. Content API

[Readonly Content API v1](./content-api-v1.md) 状态为 Active / Normative / Evolving。

职责是逻辑只读内容读取、MIME/cache/version/error/integrity；Content capability 如何分发属于独立 Content Access Bootstrap/Profile。

## 9. 当前状态表

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative / Frozen |
| Subsystem Control v2 | [subsystem-control-protocol-v2.md](./subsystem-control-protocol-v2.md) | **Active Design / Draft** |
| Runtime Control Application Profile v1 | [runtime-control-profile-v1.md](./runtime-control-profile-v1.md) | Active / Normative / Frozen |
| Runtime Control Application Profile v2 | 尚待组成协议冻结 | Planned |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | **Active / Normative / Frozen** |
| Frame / Call v1 Conformance | [frame-call-conformance-v1.md](./frame-call-conformance-v1.md) | Active / Normative / Frozen |
| Frame v1 Suspend Clarification | [frame-call-v1-suspend-clarification.md](./frame-call-v1-suspend-clarification.md) | Active / Normative / Frozen Clarification |
| Main ⇄ Renderer Control v1 | [main-renderer-control-v1.md](./main-renderer-control-v1.md) | **Active Design / Draft；InputTarget lease closed** |
| Renderer ⇄ Subsystem Data Connection v1 | [renderer-subsystem-data-connection-v1.md](./renderer-subsystem-data-connection-v1.md) | **Active Design / Draft；lifecycle closed** |
| User Input v1 | [user-input-v1.md](./user-input-v1.md) | **Active Design / Core Draft；semantic closure reviewed** |
| Render Update | 尚待新文档 | Next major data protocol target |
| Render State | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative / Evolving |

Legacy / Superseded入口继续仅用于历史追溯：`game-package-v1.md`、`system-lifecycle-protocol.md`、`frame-data-channel-v1.md`、`client-state-tree-v1.md`、`resource-protocol.md`。

## 10. Version / Compatibility Rules

- Frozen closed schema不得私加字段/方法；
- Frame method/identity/commit/error/unwind/order/limit改变需要新 Frame版本；
- Subsystem Control v1 Data endpoint不扩展到PWA；跨平台使用v2方向；
- Frame v1继续由 Runtime Profile静态绑定，无独立 Frame hello/downgrade；
- Renderer Control不携Data bootstrap secret；
- Renderer Control v1禁止 same InputTarget lease revoke→regrant；
- Data Connection Core不得私加 handshake/heartbeat；
- User Input Interest不得绕过 Main InputTarget/Activation authority；
- User Input v1 Interest只支持 exact Channel，不支持 wildcard；
- 标准 Channel前缀保留，自定义扩展使用 `x.*.(state|event)`；
- User Input不得把浏览器 Host Event对象直接当稳定 wire schema；
- Transport差异不得改变建立后的 application semantics。

## 11. 推进顺序

```text
Protocol Boundary Cleanup                 Accepted
Subsystem Control v2                      Draft
Renderer Control v1                       Draft / InputTarget lease closed
Frame suspend clarification               Frozen clarification
Data Connection Contract v1               Draft / lifecycle closed
User Input v1                             Core Draft / semantic closure reviewed
    ↓
Standard Input Mapping + wire/limits
    ↓
Render Update v1
Render State Contract v1
    ↓
Runtime Control Profile v2                only if frozen composition requires it
Content Access Profile
```

## 12. 当前明确暂缓

PWA executable/bootstrap细节、第二 Launcher、sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery、Frame runtime dynamic downgrade/capability negotiation。

实现不得以“优化”为由把这些语义隐式塞进现有 v1。
