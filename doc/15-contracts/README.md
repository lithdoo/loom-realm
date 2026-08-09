# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本、Profile、迁移与当前兼容边界  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-09

契约层定义不同实现必须共同遵守的可互操作语义。系统架构说明 ownership；契约冻结 identity、wire、state、ordering、error、recovery、limits、version/Profile。

协议边界清理见 [ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)；Control 版本治理见 [ADR 0017](../decisions/0017-abandon-subsystem-control-v1.md)。核心原则：

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
Subsystem Control v2                  CURRENT
    ↓
Runtime Control Application Profile v2
    = Subsystem Control v2 + Frame / Call v1

Frame / Call v1                      FROZEN
    + Conformance v1
    + Suspend Semantics Clarification

Main ⇄ Renderer Control v1 Draft
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection Contract v1 Draft
    ├── User Input v1 Core Draft
    │   ├── Subsystem → Renderer: Input Interest
    │   └── Renderer → Subsystem: State / Event / Reset
    │
    └── Render Update v1
        └── Subsystem → Renderer only
            ├── render.domains
            ├── render.snapshot(revision)
            ├── render.patch(R→R+1)   closure candidate
            └── render.event

Readonly Content API v1
    + future Content Access Bootstrap/Profile
```

历史但不再实现：

```text
Subsystem Control v1
Runtime Control Application Profile v1
```

两者均为 `Abandoned Before Implementation`，不存在兼容/fallback要求。

## 2. Game Package v2 / Desktop Launcher

### Game Package v2

- Game Entry 一次性声明 required Subsystem Descriptor；
- `descriptor.key` 是 Runtime identity；
- 当前 Desktop Launcher=`nodejs`；
- Descriptor/entry/env边界由正式契约定义。

入口：[Game Package v2](./game-package-v2.md)。

### Desktop Node.js Launcher Profile v1

[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md) Active / Normative / Frozen：

```text
validated descriptor
→ Launch Attempt
→ bootstrap token registered before spawn
→ supervised Node.js process
```

spawn成功不等于 connected/identified/ready；unexpected exit code 0仍是 failure；no automatic restart。

Launcher Profile版本与 Subsystem Control协议版本独立。当前 Launcher启动的 Runtime随后必须使用 Control v2。

## 3. Subsystem Control v2 — Current

当前权威：[Subsystem Control v2](./subsystem-control-protocol-v2.md)。

协议标识：

```text
loomrealm.subsystem-control / 2
```

职责只有 Runtime identity/lifecycle：

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

核心语义：

```text
spawn != connected != identified != ready
hello binds descriptor.key
bootstrapToken one-shot
Main owns shutdown intent
stopping != stopped
stopped only from Supervisor
unexpected Control loss/exit without shutdown intent = failure
no same-attempt reconnect/resume
no automatic restart
```

`ready` closed schema不携带 Renderer Data endpoint：

```json
{"state":"ready"}
```

并且：

```text
ready != Data Connection exists
ready != Renderer connected
ready != DataAuthority granted
ready != Frame/Render/InputTarget exists
```

Desktop与PWA可以用不同 Host Control carrier，但 application lifecycle schema保持相同。

## 4. Subsystem Control v1 — Abandoned

历史入口：[Subsystem Control v1 Tombstone](./subsystem-control-lifecycle-protocol.md)。

状态：

```text
Abandoned Before Implementation
Superseded by Control v2
```

旧 v1 曾把 Desktop `rendererDataEndpoint` 放入 `ready`，后来确认属于错误协议层。由于 v1 从未形成 conformant implementation / deployment / third-party dependency，ADR 0017 明确取消其兼容义务。

新实现 MUST NOT advertise/select Control version 1。

## 5. Runtime Control Application Profile v2 — Current

当前组合：[Runtime Control Application Profile v2](./runtime-control-profile-v2.md)：

```text
Subsystem Control v2
+
Frame / Call v1
```

Profile冻结/收敛以下组合边界：

```text
hello before Frame operation
Control version negotiated independently
Frame v1 statically bound
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready under Profile means complete Frame v1 role support
Data/User Input/Render do not enter Runtime Control Profile
```

旧 [Runtime Control Profile v1](./runtime-control-profile-v1.md) 随 Control v1 一并 `Abandoned Before Implementation`。

## 6. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) Active / Normative / Frozen。

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

伴随文档：

- [Frame / Call v1 Conformance](./frame-call-conformance-v1.md)
- [Frame / Call v1 Suspend Clarification](./frame-call-v1-suspend-clarification.md)

Control使用 v2不改变 Frame / Call v1 wire/version。

## 7. Main ⇄ Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed authority：

```text
renderer.hello
renderer.state(full Snapshot)
```

Snapshot包含 Runtime projection、Frame Stack、Activation、InputTarget与逻辑 DataAuthority；不包含 Data bootstrap material、Render State或 Content Grant。

恢复：

```text
full Snapshot
Session-local monotonic revision
revision gap/coalescing allowed
no replay / no patch
Control loss → revoke InputTarget/DataAuthority → retire Data Connections
```

InputTarget one-shot lease：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId MUST NOT become InputTarget again
```

## 8. Renderer ⇄ Subsystem Data Connection v1

权威草案：[Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)。

```text
identity
    Session + current Renderer participant + subsystemKey + generation

generation
    Main-owned Data authority epoch
    != transport reconnect counter

lifecycle
    current → retired
    retired terminal
```

每个 Subsystem同时最多一条 current carrier；installation必须 serialized。同 generation仍授权时，旧 carrier retired后 MAY建立 fresh carrier。

重要边界：

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != authoritative Render Domain destroy
```

Connection Core没有 application handshake/heartbeat；endpoint/ticket/MessagePort establishment属于 Host/Platform Binding，而不是 Subsystem Control `ready`。

## 9. User Input v1 Core

权威草案：[User Input v1](./user-input-v1.md)。

Trust / authority：

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

Input Interest：

```text
Subsystem → Renderer
full replacement exact Channel set
fresh Data Connection default empty
not authority
```

Effective Channel：

```text
current matching Data Connection
∩ Main current InputTarget/Activation
∩ current Input Interest
∩ Producer availability
```

State/Event/Reset：

```text
.state
    self-contained current snapshot
    false→true establishes fresh baseline
    latest wins / may coalesce

.event
    ordered transient
    no coalescing / no replay

reset
    clears all input state for frameId + activationId
```

Core authority/recovery语义基本闭合；Standard Input Mapping exact payload/limits继续独立收敛。

## 10. Render Domain / Tree Architecture

现行架构入口：[渲染系统](../10-architecture/rendering-system.md)。

每个 Subsystem Runtime拥有：

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
key       Domain Tree-wide logical identity
tag       logical Renderer Component type
attrs     string→string declarative attributes
data      JSON object component state
children  ordered child nodes
```

核心边界：

```text
Domain Host != Render Node
Domain lifecycle != Frame lifecycle
Domain zIndex != Frame Stack order
tag != DOM tag
Render Node != Input authority
```

## 11. Render Update v1

正式 Draft入口：[Render Update Protocol v1](./render-update-v1.md)。

当前增量 closure candidate：[Render Update v1 Incremental Design](./render-update-v1-incremental-design.md)。

方向固定：

```text
Subsystem → Renderer only
```

当前 closure candidate已经收敛为：

```text
render.domains
    full Registry / Domain lifecycle authority

render.snapshot(revision)
    full authoritative baseline / full commit

render.patch(baseRevision, revision)
    R → R+1 atomic incremental commit
    key-addressed insert/remove/move/update

render.event
    transient presentation impulse
```

关键恢复：

```text
fresh Data Connection
→ current Registry
→ fresh Snapshot for every current Domain
→ ordinary Patch/Event
```

无：

```text
ACK/NACK
Patch history replay
resume cursor
Renderer→Subsystem resync RPC
cross-Domain transaction
```

incremental closure完成 limits/conformance 后应合并回正式 `render-update-v1.md`，避免长期维持两个不同 v1事实。

## 12. Render Tree / Component Profile

继续冻结：

```text
exact tag grammar
component declaration/bootstrap/loading
per-tag attrs/data schema
message/tree numeric limits
resource reference conventions
```

Component bootstrap不得改变 Render Update的 Domain authority、revision、Patch atomicity或单向方向。

## 13. Content API

[Readonly Content API v1](./content-api-v1.md) Active / Normative / Evolving。

Content API定义logical readonly读取、MIME/cache/version/error/integrity；capability distribution属于独立 Content Access Bootstrap/Profile。

## 14. 当前状态表

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| **Subsystem Control v2** | [subsystem-control-protocol-v2.md](./subsystem-control-protocol-v2.md) | **Active / Normative / Current；Stabilizing** |
| **Runtime Control Application Profile v2** | [runtime-control-profile-v2.md](./runtime-control-profile-v2.md) | **Active / Normative / Current；Stabilizing** |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Active / Normative / Frozen |
| Frame / Call v1 Conformance | [frame-call-conformance-v1.md](./frame-call-conformance-v1.md) | Active / Normative / Frozen |
| Frame v1 Suspend Clarification | [frame-call-v1-suspend-clarification.md](./frame-call-v1-suspend-clarification.md) | Frozen Clarification |
| Main ⇄ Renderer Control v1 | [main-renderer-control-v1.md](./main-renderer-control-v1.md) | Active Design / Draft；semantic closure high |
| Renderer ⇄ Subsystem Data Connection v1 | [renderer-subsystem-data-connection-v1.md](./renderer-subsystem-data-connection-v1.md) | Active Design / Draft；lifecycle closed |
| User Input v1 | [user-input-v1.md](./user-input-v1.md) | Active Design / Core Draft；semantic closure reviewed |
| Render Update v1 | [render-update-v1-incremental-design.md](./render-update-v1-incremental-design.md) | Working Draft / Closure Candidate |
| Render Tree / Component Profile | 尚待进一步冻结 | Planned |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative / Evolving |
| **Subsystem Control v1** | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | **Legacy / Abandoned Before Implementation** |
| **Runtime Control Profile v1** | [runtime-control-profile-v1.md](./runtime-control-profile-v1.md) | **Legacy / Abandoned Before Implementation** |

其他 Legacy / Superseded入口只用于历史追溯：`game-package-v1.md`、`system-lifecycle-protocol.md`、`frame-data-channel-v1.md`、`client-state-tree-v1.md`、`resource-protocol.md`。

## 15. Version / Compatibility Rules

- **Control v1/Profile v1从未实现，已明确 abandoned；当前实现不得协商/回退到 v1；**
- 当前 Subsystem Control协商版本为 2；
- Runtime Control Profile v2静态绑定 Control v2 + Frame v1；
- 已形成真实 compatibility boundary 的 Frozen closed schema不得私加字段/方法；
- Frame method/identity/commit/error/unwind/order/limit改变需要新 Frame版本；
- Renderer Control不携Data bootstrap secret；
- Renderer Control v1禁止 same InputTarget lease revoke→regrant；
- Data Connection Core不得私加 handshake/heartbeat；
- User Input Interest不得绕过 Main InputTarget/Activation authority；
- Render Event不得升级为 authoritative persistent state；
- Render tag不得退化成任意 DOM tag/DOM command；
- Transport差异不得改变建立后的 application semantics。

## 16. 推进顺序

```text
Protocol Boundary Cleanup                 Accepted
Control v1 abandonment / v2 promotion     Accepted
Subsystem Control v2                      Current / Stabilizing
Runtime Control Profile v2                Current / Stabilizing
Frame / Call v1                           Frozen
Renderer Control v1                       Draft / near closure
Data Connection Contract v1               Draft / lifecycle closed
User Input v1                             Core semantic closure reviewed
Render Update incremental model           Closure Candidate
    ↓
Render Update limits / conformance / official merge
Renderer Component Profile
Standard Input Mapping Profile
Host Bootstrap / Data Binding Profiles
Content Access Profile
```

最终目标不是保留最多版本，而是让每个 current implementation只有一个明确权威入口。
