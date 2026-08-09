# ADR 0016：协议边界清理与 Data Authority 方向

> 状态：Accepted  
> 日期：2026-08-08；文档归一复核：2026-08-09  
> 影响范围：Subsystem Control、Renderer Control、Renderer⇄Subsystem Data、Content Access、Frame v1 clarification

## 背景

Frame / Call v1 已形成清晰的 Main-owned Frame/Activation authority，但 Renderer/Data 设计暴露出几个跨协议接缝：

1. 早期 Control 草案把 Renderer Data endpoint 放入 Runtime `ready`，错误绑定 Runtime readiness 与 Data transport discovery；
2. Renderer Control 草案曾混合逻辑 Data authority、endpoint 与 bearer token；
3. Renderer Control loss 后既有 Data Connection authority需要闭合；
4. Content API 的资源语义与 capability distribution 需要拆分；
5. Frame v1 显式 `frame.suspend` 的恢复边界需要澄清。

## 决策原则

协议按 authority / lifecycle ownership 拆分，不按“少几个协议文件”优化。

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

共享物理 Transport 不代表共享 protocol identity、lifecycle、revision、error 或 recovery。

## 决策 1：Subsystem Control v1 只管理 Runtime lifecycle

当前 [Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md) 只负责：

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

不携带 Renderer Data endpoint、MessagePort、Data credential 或 generation。

因为 endpoint-in-ready 的旧形态从未形成 conformant implementation，first implementation contract 直接以 lifecycle-only v1 为准；不为预实现设计稿保留额外协议版本。

当前 Runtime Control Application Profile v1：

```text
Subsystem Control v1
+
Frame / Call v1
```

## 决策 2：Renderer Control 只复制逻辑 authority

Renderer Control v1 Snapshot 只包含 Main-owned committed authority：

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

这些属于 Renderer⇄Subsystem Connection Host/Platform Binding。

## 决策 3：Data authority 使用 generation 模型

对每个 Subsystem，Main 是 Data Connection authority。

```text
DataAuthority generation N
    = Main 当前允许 Renderer 建立/持有该 Subsystem 第 N 代 Data Connection
```

`generation` Session-local、Subsystem-scoped、positive safe integer、never reused。

Renderer⇄Subsystem Data Connection Contract 定义 matching generation 的建立后 identity、替换与关闭；Desktop/PWA bootstrap 机制可以不同，但建立后的 Core semantics 必须一致。

## 决策 4：Renderer Control lease 是 Data authority 的父级 authority

Renderer失去当前 Main Control authority后：

```text
stop ordinary input
invalidate current InputTarget
invalidate DataAuthority
close existing Renderer⇄Subsystem Data Connections
reconnect Main
obtain fresh full Authority Snapshot
re-establish current Data generations
```

Render Store MAY 保留最后合法 presentation snapshot；Data Connection close 不等于 Render destroy。

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

必须对 topology 与 whole-message size 建立上界；慢 Renderer 使用 bounded latest-state coalescing，不无界排队历史 snapshots。

## 决策 6：Frame v1 suspend 只做语义澄清

不修改 Frame v1 七方法 wire。

```text
call-owned suspension
    child terminal outcome
    → frame.resume(...returnedFrameId,result,freshActivation)

administrative suspension
    v1 没有 generic resume
    → 后续 closing/closed 或 failure cleanup
```

不得用伪造 child outcome 把 `frame.resume` 当 generic resume。

## 决策 7：Content semantics 与 capability distribution 分离

Content API定义：

```text
logical readonly routes
MIME / cache / version
errors / integrity
authorized request semantics
```

Content capability 如何签发、分发、轮换/失效属于独立 Content Access Bootstrap/Profile，不进入 Frame、Render State 或普通 resource response。

## 当前推进顺序

```text
Game Package v1
Desktop Launcher Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Renderer Control v1
Renderer ⇄ Subsystem Data Connection v1
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

协议数量不是优化目标；单一 authority、闭合 lifecycle、最小 wire surface 和可恢复性才是。
