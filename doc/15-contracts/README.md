# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：当前跨系统协议入口、版本与兼容边界  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-09

契约层只保留**跨角色/跨实现必须一致的可观察语义**。实现策略、Host glue、组件映射、平台事件转换、部署容量等不单独建立 Protocol/Profile。

核心边界：

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

共享 Transport 不代表共享 identity/lifecycle/authority/sequence/recovery。

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

Main ⇄ Renderer Control v1              Draft / near closure
    ↓ DataAuthority / InputTarget
Renderer ⇄ Subsystem Data Connection v1 Draft / lifecycle closed
    ├── User Input v1                   Core closure candidate
    └── Render Update v1                Closure candidate

Readonly Content API v1                 Active / Normative / Evolving
```

Host/Platform 负责实际 WebSocket/MessagePort/token/ticket 建立与注入，但这些实现机制不形成新的 application protocol。

---

## 2. Game Package / Launcher

[Game Package v1](./game-package-v1.md) 定义 required Subsystem Descriptor：

```text
key
launcher.type
launcher.entry
env?
```

[Desktop Node.js Launcher v1](./nodejs-launcher-profile-v1.md) 定义 executable bootstrap/supervision：

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

Launcher 版本、Bootstrap Context版本、Subsystem Control版本相互独立。

---

## 3. Subsystem Control v1

[Subsystem Control v1](./subsystem-control-protocol-v1.md)：

```text
loomrealm.subsystem-control / 1
```

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

只负责 Runtime identity/lifecycle：

```text
hello binds descriptor.key
bootstrapToken one-shot
initializing / ready / failed
Main-owned shutdown intent
stopping != stopped
stopped only from Supervisor
unexpected Control loss/exit → failure
no same-attempt reconnect/resume
no automatic restart
```

`ready` 不携带/暗示 Renderer Data endpoint、credential、Frame、Render 或 InputTarget。

---

## 4. Runtime Control Application Profile v1

[Runtime Control Profile v1](./runtime-control-profile-v1.md)：

```text
Subsystem Control v1
+
Frame / Call v1
```

Profile 只冻结真实的组合互操作规则：

```text
hello before Frame operation
Frame version statically bound to 1
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready under Profile means complete Frame v1 role support
```

Data/User Input/Render 不进入 Runtime Control Profile。

---

## 5. Frame / Call v1

[Frame / Call v1](./frame-call-protocol-v1.md) Active / Normative / Frozen。

Exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心：

```text
Main owns Frame/Stack/Activation/InputTarget
frameId/activationId Session unique / never reused
Response-before-dependent-RPC
activate/resume ACK-before-InputTarget publication
post-commit no rollback
Success = known commit
Explicit Error = known no-commit
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime occurrence → whole-suffix fixed-point unwind
accepted outcome preserved
```

Suspend 语义已直接并入主协议：

```text
child-call suspension
    resumable only by child outcome + fresh frame.resume

administrative frame.suspend
    one-way quiesce toward close/failure cleanup
    no generic resume in v1
```

Conformance：[Frame / Call v1 Conformance](./frame-call-conformance-v1.md)。

---

## 6. Main ⇄ Renderer Control v1

[Renderer Control v1](./main-renderer-control-v1.md) 复制 Main committed logical authority：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

不携 Data endpoint/MessagePort/bearer Data token/Render State/Content credential。

恢复使用 full Snapshot + monotonic revision；Control loss撤销 InputTarget/DataAuthority并 retire Data Connections。

InputTarget lease one-shot：一旦 revoke/remove/replace，同一 `frameId+activationId` 永不再次成为 InputTarget。

---

## 7. Renderer ⇄ Subsystem Data Connection v1

[Data Connection v1](./renderer-subsystem-data-connection-v1.md) 只定义建立后的 authority/lifecycle：

```text
identity
    Session + current Renderer + subsystemKey + generation

lifecycle
    current → retired
```

Core zero application messages/handshake/heartbeat/resume/ACK。

WebSocket endpoint/ticket、MessagePort creation/transfer、Host API 都是 Desktop/PWA Host implementation；只需满足 carrier 安装前正确绑定 current Session/Renderer/subsystem/generation。

---

## 8. User Input v1

[User Input v1](./user-input-v1.md)：

```text
Main InputTarget authority
∩ Subsystem Input Interest
∩ Renderer Producer availability
=
Effective Input Channel
```

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

Core authority/recovery 已基本闭合。

标准 `keyboard/pointer/gamepad` canonical wire payload **直接属于 User Input v1 的剩余 closure work**；不再建立 Standard Input Mapping Profile。DOM/OS/device → canonical payload 的转换属于 Renderer implementation。

Event queue 必须 bounded，但具体容量/drop preference 不属于协议。

---

## 9. Render Update v1

唯一正式入口：[Render Update v1](./render-update-v1.md)。

```text
Subsystem → Renderer only

render.domains
    full Domain Registry / lifecycle authority

render.snapshot(revision)
    full baseline / full authoritative commit

render.patch(baseRevision, revision)
    exact R→R+1 atomic incremental commit
    insert / remove / move / update

render.event
    transient presentation impulse
```

`tag` 只是 opaque string；协议不定义 Component Registry/Factory/loading、known/unknown tag 或 per-tag schema。

Recovery：

```text
fresh Data Connection
→ Registry
→ fresh Snapshot every current Domain
→ Patch/Event
```

无 ACK/NACK、Patch replay、resume cursor、Renderer resync RPC、cross-Domain transaction。

剩余只关闭 hard limits/encoding/conformance；不再保留第二份 incremental v1 文档。

---

## 10. Content API v1

[Readonly Content API v1](./content-api-v1.md) 定义：

```text
logical readonly GET/HEAD routes
MIME/cache/version/integrity
request authorization semantics
stable status/error mapping
```

Desktop 使用 scoped opaque bearer request authorization；PWA 使用 same-origin Service Worker authority。

Host 如何创建/注入/轮换 Desktop grant 是 implementation responsibility，不再建立 Content Access Profile。

Range 若支持直接遵守标准 HTTP Range semantics，不建立 LoomRealm Range Profile。

Deployment body/resource/concurrency/rate/timeouts 是 bounded implementation configuration，不建立 deployment Profile。

---

## 11. 当前状态表

| 主题 | 状态 |
|---|---|
| Game Package v1 | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | Active / Normative / Frozen |
| Subsystem Control v1 | Active / Normative；Stabilizing |
| Runtime Control Application Profile v1 | Active / Normative；Stabilizing |
| Frame / Call v1 | Active / Normative / Frozen |
| Frame / Call v1 Conformance | Active / Normative / Frozen |
| Main ⇄ Renderer Control v1 | Active Design / Draft；near closure |
| Renderer ⇄ Subsystem Data Connection v1 | Active Design / Draft；lifecycle closed |
| User Input v1 | Core Closure Candidate；standard payload待关闭 |
| Render Update v1 | Closure Candidate |
| Content API v1 | Active / Normative / Evolving |

---

## 12. 协议最小化规则

成为正式 Protocol/Profile 的内容必须满足：

> **两个独立实现若不共享该规则，就会无法互操作、产生 authority/identity/state/order/recovery 分歧，或破坏安全边界。**

以下默认不协议化：

```text
Component/Factory/loading
DOM/OS event adapter
Host endpoint/ticket/MessagePort delivery mechanism
credential injection mechanism
queue concrete capacity/drop preference
cost heuristic
cache/internal index
standard HTTP已有能力的重复 Profile
platform deployment limits
```

形成真实 compatibility boundary 后，不兼容 wire/semantic变化再升级协议版本；设计阶段不为草稿迭代制造额外版本。

---

## 13. 当前关闭顺序

```text
Subsystem Control v1 / Runtime Control Profile v1   final conformance review
Renderer Control v1                                 closure/freeze review
Data Connection v1                                  closure/freeze review
User Input v1                                       standard canonical payload + limits
Render Update v1                                    hard limits + conformance
Content API v1                                      implementation/conformance
Host Desktop/PWA bindings                           implementation integration
```
