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
Runtime != Frame != Renderer Control != Data Connection != Render != Content
```

共享 Transport 不代表共享 identity/lifecycle/recovery model。

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
    ↓
Renderer ⇄ Subsystem Connection v1      next
    ↓
User Input v1
Render Update v1
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

[Subsystem Control v1](./subsystem-control-lifecycle-protocol.md) 已 Frozen：

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

核心：

```text
spawn != connected != identified != ready
hello binds descriptor.key
Main owns shutdown intent
stopping != stopped
stopped only from Supervisor
unexpected Control loss/exit without shutdown intent = failure
```

v1 的 `ready.rendererDataEndpoint` 是早期 Desktop Data discovery binding。该 closed schema保持历史兼容，不再扩展 MessagePort/新 Data capability。跨 Desktop/PWA 的收敛方向改为 Subsystem Control v2。

### Runtime Control Application Profile v1

[Runtime Control Profile v1](./runtime-control-profile-v1.md) 冻结：

```text
Subsystem Control v1
+
Frame / Call v1
```

同一 authenticated Control Connection；hello前无 Frame；同 sender跨 Control+Frame共享 connection-lifetime positive-safe-integer Request-ID namespace；no JSON-RPC Batch。

不得静默把未来 Data Lease Control 加进 Profile v1。

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

Completion profile：

```text
protocol = loomrealm.frame-call / 1
message <= 1 MiB
JSON depth <= 64
business JsonValue <= 512 KiB
Request ID positive safe integer / sender Connection lifetime no reuse
Frame deadline 1,000..300,000ms monotonic sender-local
Desktop WebSocket / PWA MessagePort same application semantics
```

规范性伴随文档：

- [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md)
- [Frame / Call v1 Suspend Semantics Clarification](./frame-call-v1-suspend-clarification.md)

Suspend clarification不修改七方法 wire：child-call suspension可通过既有 child outcome `frame.resume` 恢复；显式 administrative `frame.suspend` 在 v1 无 generic reactivation，只能继续 close/failure cleanup。

## 3. Subsystem Control v2 Draft

[Subsystem Control v2](./subsystem-control-protocol-v2.md) 是新的跨 Desktop/PWA 收敛方向。

主要变化：

```text
ready = Runtime lifecycle readiness only
```

不再携带：

```text
rendererDataEndpoint
Data Port
Data credential
```

Data endpoint/Port/auth/generation全部进入独立 Renderer⇄Subsystem Connection/Profile。

Frame / Call v1 不需要因此升级。

## 4. Main ⇄ Renderer Control v1 Draft

[Renderer Control v1](./main-renderer-control-v1.md) 当前采用最小 authority-replication surface：

```text
renderer.hello      Renderer → Main Request
renderer.state      Main → Renderer Notification
```

核心模型：

```text
Main = authority
Renderer = read-only committed mirror
full Snapshot
monotonic Session-local revision
revision gap/coalescing allowed
reconnect = fresh current Snapshot
no replay / no patch
```

Snapshot包含：

```text
Runtime projection
Frame Stack
current Activation
InputTarget
DataAuthority {
    subsystemKey
    generation
    connectionProfile
}
```

Snapshot明确不包含：

```text
Data endpoint
MessagePort
bearer Data token
Render State
Content Grant
```

Renderer Control loss：

```text
stop ordinary input
invalidate InputTarget
invalidate all DataAuthority
close existing Data Connections
fresh hello/current Snapshot
```

Data Connection close不等于 Render destroy。

v1 full Snapshot 使用 bounded latest-state coalescing，不无界排队；Phase-1 topology Profile限制 Runtime<=256、live Frame Stack<=64、DataAuthority<=256，保证合法 authority state可单条恢复。

## 5. 下一协议：Renderer ⇄ Subsystem Connection

下一正式设计目标只回答：

> Renderer 与某个 Subsystem Runtime 如何依据 Main 的 matching DataAuthority generation 建立、认证、替换和关闭一条 Data Connection？

必须保持：

```text
one Runtime → at most one Renderer Data Connection
Data generation authority = Main
Frame lifecycle does not own Data lifecycle
Data reconnect cannot restore Frame authority
Desktop/PWA bootstrap carrier may differ
established connection identity/lifecycle semantics must match
```

Connection协议冻结后，再决定 Runtime Control Application Profile v2 是否需要组合独立的 Data Lease Control domain。

## 6. Content API

[Readonly Content API v1](./content-api-v1.md) 状态仍为 Active / Normative / Evolving。

其职责是逻辑只读内容读取、MIME/cache/version/error/integrity，不负责 capability delivery。

```text
Content API semantics
!=
Content Access Grant bootstrap/distribution
```

Content Access Bootstrap/Profile 后续独立冻结；不得把 Content credential塞入 Frame / Render State /普通 resource response。

## 7. 当前状态表

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
| Main ⇄ Renderer Control v1 | [main-renderer-control-v1.md](./main-renderer-control-v1.md) | **Active Design / Draft** |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Next Draft target |
| User Input | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| Render State | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative / Evolving |

Legacy / Superseded：

| 路径 | 状态 |
|---|---|
| [game-package-v1.md](./game-package-v1.md) | Legacy / Superseded |
| [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Legacy / Superseded |
| [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |
| [resource-protocol.md](./resource-protocol.md) | Legacy / Superseded |

## 8. Version / Compatibility Rules

- Frozen closed schema不得私加字段/方法；
- Frame method/identity/commit/error/unwind/order/limit改变需要新 Frame版本；
- Subsystem Control v1的 Data endpoint不扩展到PWA；跨平台使用v2方向；
- Frame v1继续由 Runtime Profile静态绑定，无独立 Frame hello/downgrade；
- Renderer Control v1不携Data bootstrap secret；
- fixture coverage可增加而保持 protocolVersion，前提是只验证既有 Frozen semantics；
- Transport差异不得改变建立后的 application semantics。

## 9. 推进顺序

```text
Protocol Boundary Cleanup             Accepted
Subsystem Control v2                  Draft
Renderer Control v1                   Draft / under review
Frame suspend clarification           Frozen clarification
    ↓
Renderer ⇄ Subsystem Connection v1    next
    ↓
Runtime Control Profile v2            if required by frozen composition
    ↓
User Input v1
Render Update v1
Render State Contract v1
Content Access Profile
```

## 10. 当前明确暂缓

PWA executable/bootstrap细节、第二 Launcher、sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery、Frame runtime dynamic downgrade/capability negotiation。

实现不得以“优化”为由把这些语义隐式塞进现有 v1。