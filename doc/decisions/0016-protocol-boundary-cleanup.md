# ADR 0016：协议边界清理与 Data Authority 方向

> 状态：Accepted  
> 日期：2026-08-08；协议最小化复核：2026-08-09  
> 影响范围：Subsystem Control、Renderer Control、Renderer⇄Subsystem Data、Content、Frame、Render/Input boundary

## 背景

Frame / Call v1 形成清晰的 Main-owned Frame/Activation authority 后，Renderer/Data/Content 设计暴露出几个跨域接缝：

1. 早期 Control 草案把 Renderer Data endpoint 放入 Runtime `ready`，错误绑定 Runtime readiness 与 Data transport discovery；
2. Renderer Control 草案曾混合 logical Data authority、endpoint 与 bearer token；
3. Renderer Control loss 后既有 Data Connection authority需要闭合；
4. Content API 的 request semantics 与 Host credential plumbing 需要分离；
5. Frame v1 显式 `frame.suspend` 的恢复边界需要闭合；
6. 后续设计又暴露出一种新的过度设计风险：把 component mapping、device mapping、Host bootstrap、Range、queue sizing 等 implementation choice升级成额外 Profile。

## 决策原则

协议按 authority / lifecycle ownership 拆分，但**不是越多 Protocol/Profile 越好**。

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

一个规则只有在以下情况才进入正式 Contract/Profile：

> 两个独立实现若不共享该规则，就会无法互操作、产生 authority/identity/state/order/recovery 分歧，或破坏安全边界。

共享物理 Transport 不代表共享 protocol identity/lifecycle/revision/error/recovery；反过来，纯 Host glue、presentation mapping、deployment policy 也不因为跨模块存在就自动成为协议。

## 决策 1：Subsystem Control v1 只管理 Runtime lifecycle

[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md) 只负责：

```text
bootstrap authentication
Runtime identity
initializing / ready / failed
Main-owned shutdown
Control-loss lifecycle
```

`ready`：

```json
{"state":"ready"}
```

不携 Renderer Data endpoint、MessagePort、Data credential 或 generation。

endpoint-in-ready 从未形成 conformant implementation，因此 first implementation contract直接使用 lifecycle-only v1，不保留预实现草稿版本。

Runtime Control Application Profile v1：

```text
Subsystem Control v1
+
Frame / Call v1
```

## 决策 2：Renderer Control 只复制逻辑 authority

Renderer Control Snapshot 只包含 Main-owned committed authority：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

不得长期复制：

```text
WebSocket URL
MessagePort
bearer connection token
transport bootstrap material
```

这些是 Host/Platform implementation material，不是 Renderer Control authority state。

## 决策 3：Data authority 使用 generation 模型

Main 是每个 Subsystem Data Connection authority。

```text
DataAuthority generation N
    = Main 当前允许 current Renderer 建立/持有该 Subsystem 第 N 代 Data Connection
```

`generation` Session-local、Subsystem-scoped、positive safe integer、never reused。

Data Connection Contract定义建立后的 identity/current→retired/cardinality/revocation/reconnect semantics。

Desktop/PWA 可以使用不同 WebSocket/ticket/MessagePort 建立机制；这些机制是 Host implementation，不要求再定义 Data Bootstrap application protocol。Host只必须证明 carrier安装前正确绑定 current Session/Renderer/subsystem/generation。

## 决策 4：Renderer Control 是 Data authority 的父级 authority

Renderer失去 current Main Control authority：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
retire old Renderer⇄Subsystem Data Connections
reconnect Main
obtain fresh full Authority Snapshot
Host re-establishes current Data carriers
```

Render presentation cache MAY保留最后合法状态；Data carrier retire不等于 Render Domain destroy。

## 决策 5：Renderer Control 使用 full snapshot

Renderer Control v1：

```text
full Authority Snapshot
monotonic Session-local revision
revision gap allowed
publication coalescing allowed
no historical replay
reconnect = current snapshot
```

Topology/message size必须 bounded；慢 Renderer使用 latest-state coalescing，不无界保留历史 snapshot。

## 决策 6：Frame suspend 语义属于 Frame v1 主契约

不修改七方法 wire。

```text
child-call suspension
    → corresponding child terminal outcome
    → frame.resume(...returnedFrameId,result,freshActivation)

administrative frame.suspend
    → no generic v1 resume
    → closing/closed or failure cleanup
```

不得伪造 child outcome。该语义已经直接并入 Frame / Call v1 与其 Conformance，不再保留独立 clarification 事实来源。

## 决策 7：Content API 与 Host credential plumbing 分离

Content API定义：

```text
logical readonly routes
MIME/cache/version
errors/integrity
request authorization semantics
```

Desktop Host如何签发、保存、注入、轮换 scoped bearer是 Host implementation responsibility；PWA使用 same-origin Service Worker authority。

因此：

```text
no Content Access Bootstrap/Profile
no credential in Frame / Render / URL query / ordinary business payload
```

如果未来真的出现独立 Host 与独立 Content client之间需要标准化的 credential-delivery wire，再基于真实 interoperability requirement设计，而不是预先制造 Profile。

## 决策 8：Render tag / presentation 不形成 Component Profile

Render Update只复制：

```text
key
tag
attrs
data
children
```

其中 `tag` 是 opaque string。Render Core不定义：

```text
known/unknown tag
Component Registry/Factory
component/module loading
per-tag schema
DOM/Canvas/WebGL mapping
```

这些由 Subsystem/Renderer实现掌控。合法 Render authoritative state不依赖某个本地 Component Factory是否存在。

## 决策 9：Standard Input payload留在 User Input v1

跨 wire双方必须共同理解的 keyboard/pointer/gamepad canonical payload schema直接属于 User Input v1。

以下不形成 Standard Input Mapping Profile：

```text
DOM/OS/device event adapter
polling cadence
internal lookup table
platform compatibility code
```

若某 identifier/coordinate/button语义影响 wire解释，则与 payload schema一起冻结在 User Input v1。

## 决策 10：不要为实现参数制造 Profile

以下默认不是独立协议/Profile：

```text
HTTP Range support
Event FIFO concrete capacity
Event drop-oldest/drop-newest preference
Content resource/concurrency/rate/timeouts
Patch-vs-Snapshot heuristic
cache/index/scheduler size
Host token/ticket/MessagePort delivery mechanism
```

Range若支持直接遵守标准 HTTP semantics；队列/部署参数只冻结 correctness所需的 bounded/error行为。

## 当前协议主线

```text
Game Package v1
Desktop Node.js Launcher v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1 + Conformance
Main ⇄ Renderer Control v1
Renderer ⇄ Subsystem Data Connection v1
User Input v1
Render Update v1
Content API v1
```

其中 Launcher Profile 和 Runtime Control Application Profile 保留，是因为它们分别定义真实的 launcher interoperability boundary 与 Control+Frame composition boundary，而不是单纯实现策略。

## 结果

每个正式协议只回答一个真正跨角色的问题：

```text
Subsystem Control  → Runtime是谁、是否ready、如何停止？
Frame / Call       → 谁调用谁、Frame/Activation如何提交与失败收敛？
Renderer Control   → Main当前公开给Renderer的authority是什么？
Data Connection    → 当前Data carrier是否具有合法authority？
User Input         → 当前Activation下 canonical input如何传递？
Render Update      → Subsystem authoritative Render state如何复制？
Content API        → logical readonly content如何读取？
```

最终目标不是“协议越少”或“协议越多”，而是：

> **单一 authority、闭合 lifecycle、最小 wire surface，并且只标准化真正需要互操作的事实。**
