# ADR 0016：协议边界清理与 Data Lease 方向

> 状态：Accepted  
> 日期：2026-08-08  
> 影响范围：Subsystem Control、Renderer Control、Renderer⇄Subsystem Data、Content Access、Frame v1 clarification

## 背景

Frame / Call v1 已冻结并形成清晰的 Main-owned Frame/Activation authority，但后续 Renderer/Data 设计暴露出几个跨协议接缝：

1. Subsystem Control v1 的 `ready` 在 Desktop Profile 中携带 WebSocket `rendererDataEndpoint`，把 Runtime readiness 与 Data transport discovery 绑定；PWA 目标却使用 MessagePort。
2. Renderer Control v1 Draft 原先把 Data authority、endpoint 与 bearer token放在同一 Snapshot 中，但没有定义 Subsystem 如何获得/验证 Main 签发的 token。
3. Renderer Control loss 后既有 Data Connection 的 authority 未闭合。
4. Content API 已定义 Content Grant，但 grant distribution 属于 bootstrap/access capability，不应混入 Content resource semantics。
5. Frame v1 的显式 `frame.suspend` 需要在不改变 Frozen wire 的前提下澄清其恢复边界。

## 决策原则

协议按 authority / lifecycle ownership 拆分，不按“少几个协议文件”优化。

```text
Runtime != Frame != Renderer Control != Data Connection != Render != Content
```

共享物理 Transport 不代表共享协议 identity、lifecycle、revision、error 或 recovery model。

## 决策 1：保留 Frozen v1，不做静默兼容扩展

以下已 Frozen 合同保持 wire 不变：

```text
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Frame / Call v1 Conformance
```

不得给 closed v1 schema 私加 `messageport`、Data Grant、capability、generic resume 等字段/方法。

需要修正层级错误时使用新协议版本或独立 Profile。

## 决策 2：Subsystem Control v2 纯化为 Runtime lifecycle

Subsystem Control v2 保留 Runtime identity / hello / ready / failed / shutdown 语义，但 `ready` 不再携带 Renderer Data Endpoint。

```text
ready = Runtime 已完成 required initialization，能够承担 enclosing Runtime Profile 声明的后续角色
```

Data endpoint / MessagePort / Data lease establishment 不属于 Runtime lifecycle。

Subsystem Control v1 继续作为 Frozen 历史/Desktop-compatible contract；v2 是后续跨 Desktop/PWA 的收敛方向。

## 决策 3：Renderer Control 只复制逻辑 authority

Renderer Control v1 Draft 的 Snapshot 只包含 Main-owned committed authority：

```text
Runtime projection
Frame Stack projection
Activation
InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

不得在 Authority Snapshot 中长期复制：

```text
WebSocket URL
MessagePort
bearer connection token
transport-specific bootstrap material
```

这些属于 Renderer⇄Subsystem Connection Bootstrap/Profile。

## 决策 4：Data authority 使用 lease/generation 模型

对每个 Subsystem，Main 是 Data Connection authority。

```text
DataAuthority generation N
    = Main 当前允许 Renderer 建立/持有该 Subsystem 第 N 代 Data Connection
```

generation Session-local、Subsystem-scoped、positive safe integer、never reused。

未来 Renderer⇄Subsystem Connection Protocol 必须定义 matching generation 的建立、认证、替换和关闭；其 bootstrap material 可以按 Desktop/PWA Profile 不同，但建立后的 identity/lifecycle语义必须一致。

## 决策 5：Renderer Control lease 是 Data lease 的父级 authority

Renderer失去当前 Main Control authority后：

```text
stop ordinary input
invalidate current InputTarget
invalidate DataAuthority
close existing Renderer⇄Subsystem Data Connections
reconnect Main
obtain fresh full Authority Snapshot
re-establish Data Connections from current generations
```

Render Store可以保留最后一个合法 presentation snapshot，但 Render恢复独立进行；Data Connection close不等于 Render destroy。

## 决策 6：Renderer Control 使用 full snapshot，不引入 patch/replay

v1继续采用：

```text
full Authority Snapshot
monotonic Session-local revision
revision gap allowed
publication coalescing allowed
no historical replay
reconnect = current snapshot
```

为避免合法状态无法编码，Renderer Control Profile必须对 topology 和 whole-message size建立可证明的上界。

慢 Renderer采用 bounded latest-state coalescing；不得无界排队历史 snapshots。

## 决策 7：Frame v1 suspend 只做语义澄清

不修改 Frame v1 七方法 wire。

区分：

```text
call-owned suspension
    active → suspended
    child terminal outcome → frame.resume(...returnedFrameId,result,freshActivation) → active

explicit administrative suspend
    active → suspended
    v1 不提供 generic reactivation
    后续只能进入 closing/closed
```

因此不得用伪造 `returnedFrameId`、`result=null` 或私有字段把 `frame.resume` 当 generic resume。

## 决策 8：Content service semantics 与 capability distribution 分离

Content API继续定义逻辑只读请求、响应、缓存、MIME、错误与完整性。

Content Grant 如何交给 Renderer/Runtime、何时轮换/失效属于独立 Content Access Bootstrap/Profile，不进入 Frame、Render State 或普通 resource response。

## 后续顺序

```text
Subsystem Control v2 Draft
Renderer Control v1 boundary cleanup
Frame v1 clarification companion
    ↓
Renderer ⇄ Subsystem Connection v1
    ↓
Runtime Control Application Profile v2（在所需组成协议冻结后定义）
    ↓
User Input v1
Render Update v1
Render State Contract v1
Content Access Profile
```

## 结果

这次清理不重新设计 Frame核心，而是让每个协议只回答一个问题：

```text
Subsystem Control  → Runtime是谁、是否ready、何时停止？
Frame / Call       → 谁调用谁、谁拥有ordinary input？
Renderer Control   → Main当前公开的control authority是什么？
Data Connection    → Renderer和Subsystem当前是否拥有合法Data lease？
User Input         → 当前Activation下输入如何传递？
Render Update      → Subsystem-owned Render如何同步？
Content API        → 逻辑只读内容如何读取？
```

协议数量不是优化目标；单一 authority、闭合 lifecycle 和最小 wire surface 才是。