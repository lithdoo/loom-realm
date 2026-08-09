# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨系统/对外协议入口、版本、Profile 与兼容边界  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-09

契约层只保留**当前可实现协议**。已经被新架构完全替代的历史协议正文不再保留在当前文档树；设计演变通过 ADR 与 Git 历史追溯。

核心边界：

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

共享 Transport 不代表共享 identity / lifecycle / authority / sequence / recovery。

## 1. 当前协议地图

```text
Game Package v1
    ↓
Desktop Node.js Launcher Profile v1
    ↓
Subsystem Control v1
    ↓
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1

Frame / Call v1                         FROZEN
    + Conformance v1
    + Suspend Semantics Clarification

Main ⇄ Renderer Control v1              Draft / near closure
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection v1 Draft / lifecycle closed
    ├── User Input v1                   Core semantic closure reviewed
    └── Render Update v1                Closure candidate

Readonly Content API v1
    + future Content Access Bootstrap/Profile
```

## 2. Game Package v1 / Desktop Launcher v1

[Game Package v1](./game-package-v1.md) 定义当前 Game Entry 的完整 required Subsystem Descriptor 集合：

```text
key
launcher.type
launcher.entry
env?
```

当前 Desktop subset 使用 `nodejs` Launcher，全部声明 Subsystem eager + required。

[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md) 定义：

```text
validated descriptor
→ Launch Attempt
→ bootstrap token registered before spawn
→ supervised Node.js process
```

核心：

```text
spawn success != connected != identified != ready
```

Launcher 版本、Bootstrap Context 版本与 Subsystem Control 版本是独立版本空间；当前三者恰好均为 v1。

## 3. Subsystem Control v1

当前权威：[Subsystem Control v1](./subsystem-control-protocol-v1.md)。

协议：

```text
loomrealm.subsystem-control / 1
```

Surface：

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

`ready` closed schema：

```json
{"state":"ready"}
```

不携带或暗示 Renderer Data endpoint、MessagePort、Data credential、DataAuthority、Frame、Render 或 InputTarget。

## 4. Runtime Control Application Profile v1

当前组合：[Runtime Control Application Profile v1](./runtime-control-profile-v1.md)：

```text
Subsystem Control v1
+
Frame / Call v1
```

Profile 只冻结组合边界：

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

## 5. Frame / Call v1

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

## 6. Main ⇄ Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed authority：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

不复制 Data endpoint、MessagePort、bearer Data token、Render State 或 Content Grant。

恢复采用 full Snapshot + monotonic revision；无 replay/patch。Control loss 撤销 InputTarget/DataAuthority 并 retire 对应 Data Connections。

InputTarget one-shot：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId never becomes InputTarget again
```

## 7. Renderer ⇄ Subsystem Data Connection v1

[Data Connection v1](./renderer-subsystem-data-connection-v1.md) 只定义建立后的 authority/lifecycle：

```text
identity
    Session + current Renderer participant + subsystemKey + generation

lifecycle
    current → retired
```

`generation` 是 Main-owned authority epoch，不是 transport reconnect counter。同 generation 仍 current 时可在旧 carrier retired 后建立 fresh carrier。

Core 没有 application handshake/heartbeat/resume/checkpoint/ACK。Desktop WebSocket endpoint/ticket 与 PWA MessagePort creation/transfer 属于 Host/Platform Binding。

## 8. User Input v1

[User Input v1](./user-input-v1.md) 使用：

```text
Main InputTarget authority
∩ Subsystem Input Interest
∩ Renderer Producer availability
=
Effective Input Channel
```

方向：

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

`.state` 建立可恢复当前基线；`.event` 是未来瞬时事件；Reset 是 Activation 输入状态 teardown barrier。

Core authority/recovery 已基本闭合；Standard Input Mapping exact payload/limits 独立收敛。

## 9. Render Update v1

正式入口：[Render Update v1](./render-update-v1.md)。

当前增量 closure candidate：[Render Update v1 Incremental Design](./render-update-v1-incremental-design.md)。

方向固定：

```text
Subsystem → Renderer only
```

当前 closure candidate：

```text
render.domains
    full Domain Registry / lifecycle authority

render.snapshot(revision)
    full authoritative baseline / commit

render.patch(baseRevision, revision)
    R → R+1 atomic incremental commit
    key-addressed insert/remove/move/update

render.event
    transient presentation impulse
```

Node `tag` 是 opaque string。Render协议不定义其具体含义、known/unknown分类、Registry/Factory、component loading或 per-tag schema；这些是 Renderer/Subsystem实现细节，不存在 Renderer Component Profile。

恢复：

```text
fresh Data Connection
→ current Registry
→ fresh Snapshot for every current Domain
→ ordinary Patch/Event
```

无 ACK/NACK、Patch history replay、resume cursor、Renderer→Subsystem resync RPC 或 cross-Domain transaction。

Incremental closure 完成 limits/conformance 后应合并回正式 `render-update-v1.md`，随后删除工作草案，避免长期保留两个 v1 事实来源。

## 10. Content API v1

[Readonly Content API v1](./content-api-v1.md) 定义 logical readonly routes、MIME/cache/version、request authorization semantics、error 与 integrity。

```text
Content API semantics
!=
Content Access Bootstrap/Profile
```

Capability issuance/distribution/rotation 不进入 Frame、Render State 或普通 Content response。

## 11. 当前状态表

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v1 | [game-package-v1.md](./game-package-v1.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control v1 | [subsystem-control-protocol-v1.md](./subsystem-control-protocol-v1.md) | Active / Normative；Stabilizing |
| Runtime Control Application Profile v1 | [runtime-control-profile-v1.md](./runtime-control-profile-v1.md) | Active / Normative；Stabilizing |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | Active / Normative / Frozen |
| Frame / Call v1 Conformance | [frame-call-conformance-v1.md](./frame-call-conformance-v1.md) | Active / Normative / Frozen |
| Frame v1 Suspend Clarification | [frame-call-v1-suspend-clarification.md](./frame-call-v1-suspend-clarification.md) | Frozen Clarification |
| Main ⇄ Renderer Control v1 | [main-renderer-control-v1.md](./main-renderer-control-v1.md) | Active Design / Draft；near closure |
| Renderer ⇄ Subsystem Data Connection v1 | [renderer-subsystem-data-connection-v1.md](./renderer-subsystem-data-connection-v1.md) | Active Design / Draft；lifecycle closed |
| User Input v1 | [user-input-v1.md](./user-input-v1.md) | Active Design / Core Draft；semantic closure reviewed |
| Render Update v1 | [render-update-v1-incremental-design.md](./render-update-v1-incremental-design.md) | Working Draft / Closure Candidate |
| Content API v1 | [content-api-v1.md](./content-api-v1.md) | Active / Normative / Evolving |

## 12. 版本与文档治理

协议版本表示真实 interoperability contract，不表示设计稿迭代次数。

在首次 conformant implementation / deployment / third-party dependency 形成之前，错误的预实现设计可以直接修订当前 first version；Git history 与 ADR 记录设计演变，不需要在当前契约目录保留一串从未实现的版本正文。

形成真实 compatibility boundary 后，不兼容 schema/identity/state/order/error/recovery/limit 变化必须升级对应协议/Profile 版本或定义显式迁移。

## 13. 推进顺序

```text
Subsystem Control v1 / Runtime Control Profile v1   Stabilizing
Frame / Call v1                                     Frozen
Renderer Control v1                                 Draft / near closure
Data Connection v1                                  Draft / lifecycle closed
User Input v1                                       Core semantic closure reviewed
Render Update incremental model                     Closure Candidate
    ↓
Render Update limits / conformance / official merge
Standard Input Mapping Profile
Host Bootstrap / Data Binding Profiles
Content Access Profile
```

Renderer presentation/tag mapping不进入协议推进列表，由具体实现直接完成。
