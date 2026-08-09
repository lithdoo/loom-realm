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

剩余只关闭 hard limits/encoding/conformance。

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

## 11. 链路协议设计进度

以下百分比表示**协议设计成熟度估算**，用于判断“协议边界与语义距离可实现/可冻结还有多少设计工作”。它不是代码实现完成度、测试覆盖率或发布进度。

| 链路 / 协议 | 通俗理解 | 设计目的 | 设计成熟度 | 剩余工作 |
|---|---|---|---:|---|
| Game Package v1 | “这个游戏有哪些子系统、分别启动什么” | 声明 Subsystem、Launcher、Entry、Env 等静态启动拓扑 | ≈95% | 少量集合级 validation / conformance 收尾；PWA Launcher 映射另由实现边界处理 |
| Desktop Node.js Launcher v1 | “怎么安全启动并监管一个 Node 子系统进程” | 冻结 entry 解析、spawn、Bootstrap Context、Supervisor 与失败边界 | 100% / Frozen | 无新的协议设计工作；进入实现与 conformance |
| Subsystem Control v1 | “这个 Runtime 是谁、ready 了吗、什么时候关闭” | Runtime 身份认证、生命周期、ready/failed/shutdown | ≈95% | 最终 conformance review；原则上不再扩 wire |
| Runtime Control Application Profile v1 | “Control 和 Frame 共用一条控制连接时怎么共存” | 冻结协议组合、Request ID namespace、no Batch、版本绑定 | ≈95% | 最终组合 conformance review |
| Frame / Call v1 | “当前调用栈是谁在运行、谁调用谁、失败后怎么收栈” | Frame/Stack/Activation/call/return/commit/failure unwind | 100% / Frozen | 无新的协议设计工作；只维护 conformance fixture |
| Main ⇄ Renderer Control v1 | “Renderer 现在应该相信 Main 的哪些权威状态” | 同步 Runtime、Stack、Activation、InputTarget、DataAuthority | ≈95% | 最终 closure/freeze review；补齐 limits/conformance 检查 |
| Renderer ⇄ Subsystem Data Connection v1 | “Renderer 与某个 Subsystem 现在有没有合法数据通道” | 冻结 Data Connection identity、generation、current/retired lifecycle | ≈95% | 最终 freeze review；实际 WebSocket/MessagePort 建立属于 Host 实现 |
| User Input v1 | “用户输入最终应该发给哪个 Frame” | InputTarget authority + Interest + Producer gate；State/Event/Reset | ≈80–85% | keyboard/pointer/gamepad canonical payload、wire limits、conformance |
| Render Update v1 | “Subsystem 怎么把 UI 状态同步给 Renderer” | Domain Registry、Snapshot、Patch、Event、revision 与 recovery | ≈85–90% | hard limits、encoding、key/domain/tag byte limits、zIndex、conformance |
| Content API v1 | “Runtime/Renderer 怎么只读获取地图、数据和资源” | logical readonly route、缓存、版本、完整性、request authorization | ≈85–90% | 少量 limits/policy 收尾；重点转 implementation/conformance |

### 11.1 端到端链路成熟度

一次正常 Session 从游戏包到实际交互，大致经过：

| 阶段 | 使用的协议 | 回答的问题 | 设计成熟度 |
|---|---|---|---:|
| 1. 读取游戏 | Game Package v1 | 我要启动哪些 Subsystem？ | ≈95% |
| 2. 启动进程 | Desktop Node.js Launcher v1 | 怎么安全启动并监管 Runtime？ | 100% |
| 3. Runtime 上线 | Subsystem Control v1 | 你是谁？初始化/ready 了吗？ | ≈95% |
| 4. 建立调用栈 | Frame / Call v1 | 当前谁执行？谁调用谁？ | 100% |
| 5. Renderer 获取 Main 权威 | Main ⇄ Renderer Control v1 | 当前 Stack/Input/Data authority 是什么？ | ≈95% |
| 6. 建立数据通道 | Data Connection v1 | Renderer 与 Subsystem 能合法通信吗？ | ≈95% |
| 7. 用户操作 | User Input v1 | 键盘/指针/手柄输入该发给谁？ | ≈80–85% |
| 8. UI 更新 | Render Update v1 | authoritative UI state 发生了什么变化？ | ≈85–90% |
| 9. 加载内容 | Content API v1 | 地图、资源和业务内容去哪里读取？ | ≈85–90% |

从设计角度可归纳为三段：

```text
启动 / Runtime / Frame 控制链       ≈97%  —— 基本定型
Renderer Authority / Data 链       ≈95%  —— 主要剩 freeze/conformance
User Input / Render / Content 数据层 ≈85%  —— 主要剩 wire limits/payload/conformance
```

整体协议架构成熟度可粗略视为 **≈90%**。这个数字只表示“主要 authority/lifecycle/recovery 问题已经解决”，不表示实现工作已经完成。

### 11.2 当前真正剩余的协议设计工作

按收益和依赖顺序：

| 优先级 | 工作 | 关闭标准 |
|---|---|---|
| P0 | User Input v1 canonical standard payload | keyboard/pointer/gamepad 双端可按同一 canonical schema 实现；hard limits 明确；conformance fixture 可执行 |
| P0 | Render Update v1 hard limits + conformance | message/tree/node/op/attrs/data/zIndex 等边界冻结；Snapshot/Patch/Event fixture 覆盖 continuity/recovery |
| P1 | Main ⇄ Renderer Control v1 Frozen review | 当前 authority snapshot、one-shot InputTarget、DataAuthority、Control-loss 收敛语义无未决项 |
| P1 | Data Connection v1 Frozen review | current/retired、generation、replacement、Control-loss、reconnect 语义无未决项 |
| P1 | Subsystem Control / Runtime Control Profile 最终 review | hello/ready/shutdown、组合 Request ID/no-Batch、Frame binding conformance 完整 |
| P2 | Content API v1 implementation/conformance | 核心 route/cache/auth/integrity 已稳定；剩余问题不再制造新的 Access/Range/Deployment Profile |
| P2 | Desktop/PWA Host integration | 以模块实现满足既有 authority binding，不新增 application protocol |

因此后续默认方向应从“继续增加协议”转为：

```text
关闭少量剩余 wire 边界
→ 冻结成熟协议
→ 编写 executable conformance
→ 实现 Main / Host / Renderer / Subsystem vertical slice
```

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
