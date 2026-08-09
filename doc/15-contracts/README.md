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
    ├── v1 Frozen
    └── v2 Draft / lifecycle only
    ↓
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1

Frame / Call v1
    + Conformance v1
    + Suspend Semantics Clarification

Main ⇄ Renderer Control v1 Draft
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection Contract v1 Draft
    ├── User Input v1 Core Draft
    │   ├── Subsystem → Renderer: Input Interest
    │   └── Renderer → Subsystem: State / Event / Reset
    │
    └── Render Update v1 Draft
        └── Subsystem → Renderer only
            ├── render.domains
            ├── render.snapshot
            └── render.event

Readonly Content API v1
    + future Content Access Bootstrap/Profile
```

## 2. 已冻结基线

### Game Package v2 / Desktop Launcher

- Game Entry一次性声明 required Subsystem Descriptor；
- `descriptor.key` 是 Runtime identity；
- Desktop Launcher=`nodejs`；
- spawn/trust/path/Supervisor边界已冻结；
- unexpected exit code 0 仍是 failure；
- no automatic restart。

入口：

- [Game Package v2](./game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)

### Subsystem Control v1

[Subsystem Control v1](./subsystem-control-lifecycle-protocol.md) 已 Frozen。

```text
spawn != connected != identified != ready
hello binds descriptor.key
Main owns shutdown intent
stopping != stopped
stopped only from Supervisor
unexpected Control loss/exit without shutdown intent = failure
```

v1 的 `ready.rendererDataEndpoint` 保持历史 closed schema，不扩展到 PWA；跨 Desktop/PWA 的 Runtime lifecycle方向使用 Subsystem Control v2。

### Runtime Control Application Profile v1

[Runtime Control Profile v1](./runtime-control-profile-v1.md) Frozen：

```text
Subsystem Control v1
+
Frame / Call v1
```

不得静默把 Renderer/Data domain 加进 Profile v1。

### Frame / Call v1

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

- [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md)
- [Frame / Call v1 Suspend Semantics Clarification](./frame-call-v1-suspend-clarification.md)

## 3. Subsystem Control v2 Draft

[Subsystem Control v2](./subsystem-control-protocol-v2.md) 收纯 Runtime lifecycle：

```text
ready = Runtime lifecycle readiness only
```

不再携带 Renderer Data endpoint / Port / credential。

## 4. Main ⇄ Renderer Control v1 Draft

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

InputTarget是 one-shot lease：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId MUST NOT become InputTarget again
```

## 5. Renderer ⇄ Subsystem Data Connection Contract v1 Draft

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

每个 Subsystem同时最多一条 current carrier；installation必须 serialized。同 generation仍授权时，旧 carrier retired 后 MAY建立 fresh carrier。

重要边界：

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != authoritative Render Domain destroy
```

Connection Core没有 application handshake/heartbeat；User Input与Render Update是建立后的独立 child application domains。

## 6. User Input Protocol v1 Core Draft

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

具体 Standard Input Mapping payload/limits延后到实现阶段继续冻结。

## 7. Render Domain / Tree Architecture

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
key       Domain Tree-wide reconciliation identity
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

Domain允许多个 roots；需要共享布局/裁剪/坐标语义时，Subsystem显式创建真实 container/component Node。

## 8. Render Update Protocol v1 Draft

权威草案：[Renderer ⇐ Subsystem Render Update Protocol v1](./render-update-v1.md)。

协议标识：

```text
loomrealm.render-update / 1
```

方向：

```text
Subsystem → Renderer only
```

v1 Core只有三种 message kinds：

```text
render.domains
    full current Domain Registry
    lifecycle authority

render.snapshot
    full current zIndex + roots for one Domain
    atomic replacement
    latest-state coalescible

render.event
    transient presentation impulse to one current Node
    ordered / no replay / no coalescing
```

核心恢复模型：

```text
fresh Data Connection
→ current full Domain Registry
→ fresh Snapshot for every current Domain
→ ordinary Render Events may resume
```

关键 closure：

```text
domainId removed within one DataAuthority generation
    → same domainId MUST NOT be re-granted in that generation

Snapshot
    → full replacement / atomic commit

Event
    → presentation-local only
    → MUST NOT establish authoritative persistent state

same-generation reconnect
    → no event replay
    → fresh Registry + fresh Domain Snapshots

generation replacement
    → new Render replication authority universe
```

v1明确不定义：

```text
revision
ACK
history replay
resume cursor
Tree Patch / operation log
Renderer→Subsystem resync
cross-Domain transaction
render frame fence
```

Renderer MAY使用 stable Node key对 full Snapshot做本地 reconciliation；这不是 wire Tree Patch。

## 9. Render Tree / Component Boundary

Render Update v1 已冻结最小通用 Tree value shape：

```text
roots[]
Node { key, tag, attrs, data, children[] }
```

后续 Render Tree / Renderer Component Profile仍可继续冻结：

```text
exact tag grammar
component bootstrap/loading
per-tag attrs/data schema
message/tree numeric limits
resource reference conventions
```

这些 Profile不得改变 Render Update v1 的 Domain lifecycle、Snapshot atomicity、Event transient语义或单向方向。

## 10. Content API

[Readonly Content API v1](./content-api-v1.md) Active / Normative / Evolving。

Content API定义logical readonly读取、MIME/cache/version/error/integrity；capability distribution属于独立 Content Access Bootstrap/Profile。

## 11. 当前状态表

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative / Frozen |
| Subsystem Control v2 | [subsystem-control-protocol-v2.md](./subsystem-control-protocol-v2.md) | Active Design / Draft |
| Runtime Control Application Profile v1 | [runtime-control-profile-v1.md](./runtime-control-profile-v1.md) | Active / Normative / Frozen |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Active / Normative / Frozen |
| Frame / Call v1 Conformance | [frame-call-conformance-v1.md](./frame-call-conformance-v1.md) | Active / Normative / Frozen |
| Frame v1 Suspend Clarification | [frame-call-v1-suspend-clarification.md](./frame-call-v1-suspend-clarification.md) | Frozen Clarification |
| Main ⇄ Renderer Control v1 | [main-renderer-control-v1.md](./main-renderer-control-v1.md) | Active Design / Draft |
| Renderer ⇄ Subsystem Data Connection v1 | [renderer-subsystem-data-connection-v1.md](./renderer-subsystem-data-connection-v1.md) | Active Design / Draft；lifecycle closed |
| User Input v1 | [user-input-v1.md](./user-input-v1.md) | Active Design / Core Draft；semantic closure reviewed |
| Render Update v1 | [render-update-v1.md](./render-update-v1.md) | **Active Design / Draft；single-way model established** |
| Render Tree / Component Profile | 尚待进一步冻结 | Planned |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative / Evolving |

Legacy / Superseded入口只用于历史追溯：`game-package-v1.md`、`system-lifecycle-protocol.md`、`frame-data-channel-v1.md`、`client-state-tree-v1.md`、`resource-protocol.md`。

## 12. Version / Compatibility Rules

- Frozen closed schema不得私加字段/方法；
- Frame method/identity/commit/error/unwind/order/limit改变需要新 Frame版本；
- Subsystem Control v1 Data endpoint不扩展到PWA；
- Renderer Control不携Data bootstrap secret；
- Renderer Control v1禁止 same InputTarget lease revoke→regrant；
- Data Connection Core不得私加 handshake/heartbeat；
- User Input Interest不得绕过 Main InputTarget/Activation authority；
- Render Update v1不得增加 Renderer→Subsystem reverse RPC；
- Render Update v1不得把 Render Event升级为 authoritative persistent state；
- Render Update v1不得静默增加 revision/Tree Patch/replay/resync；
- Render tag不得退化成任意 DOM tag/DOM command；
- Renderer内部 key-based diff不得被误解释成 wire Tree Patch；
- Transport差异不得改变建立后的 application semantics。

## 13. 推进顺序

```text
Protocol Boundary Cleanup                 Accepted
Subsystem Control v2                      Draft
Renderer Control v1                       Draft / InputTarget lease closed
Data Connection Contract v1               Draft / lifecycle closed
User Input v1                             Core semantic closure reviewed
Render Domain / Tree Architecture         Refined
Render Update v1                          Draft / single-way model established
    ↓
Render Tree / Renderer Component Profile
Render Update numeric limits / completion review
    ↓
Runtime Control Profile v2                only if frozen composition requires it
Content Access Profile
```

Standard Input Mapping具体 payload/limits延后到实现阶段继续细化。

## 14. 当前明确暂缓

PWA executable/bootstrap细节、第二 Launcher、sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery、Frame runtime dynamic downgrade/capability negotiation、Render Tree Patch、Render history replay、cross-Domain render transaction。
