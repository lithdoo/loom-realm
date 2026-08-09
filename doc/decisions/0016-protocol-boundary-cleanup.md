# ADR 0016：协议边界清理与 Data Lease 方向

> 状态：Accepted；Control v1/v2 迁移部分被 ADR 0017 更新  
> 日期：2026-08-08  
> 影响范围：Subsystem Control、Renderer Control、Renderer⇄Subsystem Data、Content Access、Frame v1 clarification  
> 后续决定：[ADR 0017：实现前废弃 Subsystem Control v1，确立 v2 为唯一当前版本](./0017-abandon-subsystem-control-v1.md)

> [!IMPORTANT]
> 本 ADR 的协议边界结论继续有效；其中“保留 Control v1 作为 Frozen compatibility baseline、以 v2 作为后续方向”的版本迁移安排已被 ADR 0017 替代。当前唯一 Subsystem Control 实现目标是 v2。

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

## 决策 1：已实现的 Frozen contract 不静默扩展

Frame / Call v1、Frame / Call v1 Conformance 等已经形成实际当前 compatibility boundary 的 Frozen contract保持 wire 不变。

Subsystem Control v1 当时也按同样原则保留；后续 ADR 0017 根据“v1 从未实现、没有兼容依赖”的事实，明确将其实现前废弃，而不是继续维持无实际消费者的双版本兼容。

因此当前规则是：

```text
implemented/released compatibility boundary
    → incompatible change requires new version

unimplemented abandoned design
    → may be retired explicitly by ADR
```

## 决策 2：Subsystem Control v2 纯化为 Runtime lifecycle

Subsystem Control v2 保留 Runtime identity / hello / ready / failed / shutdown 语义，但 `ready` 不再携带 Renderer Data Endpoint。

```text
ready = Runtime 已完成 required initialization，能够承担 enclosing Runtime Profile 声明的后续角色
```

Data endpoint / MessagePort / Data lease establishment 不属于 Runtime lifecycle。

根据 ADR 0017：

```text
Subsystem Control v1 = Abandoned Before Implementation
Subsystem Control v2 = Current
```

当前 Runtime Control Application Profile v2 静态组合：

```text
Subsystem Control v2
+
Frame / Call v1
```

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

## 决策 4：Data authority 使用 generation 模型

对每个 Subsystem，Main 是 Data Connection authority。

```text
DataAuthority generation N
    = Main 当前允许 Renderer 建立/持有该 Subsystem 第 N 代 Data Connection
```

generation Session-local、Subsystem-scoped、positive safe integer、never reused。

Renderer⇄Subsystem Connection Protocol 定义 matching generation 的建立后 identity、替换和关闭；bootstrap material可以按 Desktop/PWA Profile不同，但建立后的 identity/lifecycle语义必须一致。

## 决策 5：Renderer Control lease 是 Data authority 的父级 authority

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

## 当前推进顺序

```text
Subsystem Control v2 Current
Runtime Control Application Profile v2 = Control v2 + Frame v1
Renderer Control v1
Renderer ⇄ Subsystem Connection v1
User Input v1
Render Update v1
Renderer Component / Render Tree Profile
Content Access Profile
```

## 结果

每个协议只回答一个问题：

```text
Subsystem Control  → Runtime是谁、是否ready、何时停止？
Frame / Call       → 谁调用谁、谁拥有ordinary input？
Renderer Control   → Main当前公开的control authority是什么？
Data Connection    → Renderer和Subsystem当前是否拥有合法Data carrier authority？
User Input         → 当前Activation下输入如何传递？
Render Update      → Subsystem-owned Render如何同步？
Content API        → 逻辑只读内容如何读取？
```

协议数量不是优化目标；单一 authority、闭合 lifecycle 和最小 wire surface 才是。
