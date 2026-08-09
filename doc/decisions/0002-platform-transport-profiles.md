# ADR 0002：平台 Transport Binding

> 状态：Accepted  
> 日期：2026-08-01；当前协议模型复核：2026-08-09  
> 影响范围：通信系统、Desktop/PWA Host、Control/Data Connection、Content API

## 背景

Desktop 与 PWA 的物理通信能力不同：

```text
Desktop
    independent OS processes
    localhost WebSocket / HTTP available

PWA
    Window / Dedicated Worker / Service Worker
    MessagePort / Fetch available
    no localhost process assumption
```

LoomRealm 需要保证 application semantics 跨平台一致，但没有理由强迫两个平台使用同一种 carrier，也没有理由把 endpoint/ticket/MessagePort creation 本身升级成新的 application protocol。

当前 Runtime 粒度为每个 `descriptor.key` 一个 Subsystem Runtime Container；Frame、Input context、Render Domain 都在 Runtime/Data Connection 上逻辑多路复用，不创建 per-Frame transport。

## 决策

采用：

> **Application semantics统一；物理 carrier由各平台 Host implementation建立。**

典型映射：

| 逻辑链路 | Desktop implementation | PWA implementation |
|---|---|---|
| Main ⇄ Subsystem Runtime Control | localhost WebSocket | Host-created Control MessagePort |
| Main ⇄ Renderer Control | localhost WebSocket | Host-created Window/Main MessagePort 或等价受控通道 |
| Renderer ⇄ Subsystem Data | per-Subsystem authenticated localhost carrier | per-Subsystem Host-created Data MessagePort |
| Content API | localhost HTTP | same-origin Fetch + Service Worker |

这些是平台 binding，不形成独立 LoomRealm `Transport Profile` wire version。

正式 application contracts继续独立：

```text
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Renderer Control v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

## Data Connection 粒度

对 current Renderer：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

一条 current Data Connection MAY承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

它不是 per-Frame/per-Activation/per-Domain carrier。

Data Connection authority由：

```text
Session
current Renderer participant
subsystemKey
Main-owned generation
```

决定，而不是 URL/port/MessagePort identity决定。

## Host Binding Obligation

Host 在 carrier 被安装为 current 前 MUST确保绑定到：

```text
current Session
current Renderer participant
target subsystemKey
current DataAuthority generation
```

Host MAY使用：

```text
Desktop endpoint + one-shot ticket
PWA MessageChannel / MessagePort transfer
other platform-safe internal mechanism
```

具体 bootstrap material/schema/API只要不形成第三方互操作边界，就属于实现细节。

不得把 endpoint/ticket/Port：

```text
放进 Subsystem Control ready
放进 Renderer Authority Snapshot
当作 DataAuthority identity
```

## Frame / Data / Render 生命周期

```text
Frame create   != Data carrier create
Frame suspend  != Data carrier close
Frame resume   != Data carrier replace
Frame close    != Data carrier retire
Frame unwind   != Render Domain destroy
Data loss      != Runtime failure
Data reconnect != Frame recovery
```

Frame / Call v1拥有自己的 transaction/recovery；Data Connection只恢复数据面。

User Input自己的 State/Event/Reset语义以及 Render Update自己的 Registry/Snapshot/Patch/Event语义在共享 carrier上独立存在，不需要 `Frame Stream sequence/resync` 层。

## Carrier 最低保证

适配器必须向上层提供：

```text
ordered delivery per direction
preserved application-message boundaries
observable close/loss
bounded buffering
no adapter-created application retry
no adapter-created duplicate
```

不要求两个方向 global total order。

Child protocol分别负责自己的 ordering/coalescing/recovery/backpressure，不建立统一 Frame Stream Router协议。

## Content

Desktop localhost HTTP 与 PWA same-origin Fetch 保持相同 Content API logical semantics。

Range如果启用直接使用标准 HTTP Range；credential delivery与deployment容量属于 Host/implementation policy，不形成 Transport/Content Profile。

## 结果

- Desktop/PWA共享 application contracts，不共享物理 transport要求；
- per-Subsystem Data Connection与 Runtime Container粒度一致；
- Frame/Input/Render在一条 Data carrier上逻辑共存，但各自拥有独立语义；
- Host bootstrap material不污染 Runtime `ready`、Renderer authority或 child protocol payload；
- 不再存在旧 `frameId + activationId + sequence` Frame Stream层、逐 Frame Resync或统一公平调度协议要求；
- 平台差异优先留在 `20-modules/*-host` implementation，而不是制造新的 `15-contracts` Profile。

## 重新评估条件

只有出现真实跨实现 interoperability requirement 时才考虑标准化某个平台 bootstrap wire，例如：

- 独立第三方 Host 与独立第三方 Runtime/Renderer必须通过公开 bootstrap schema互操作；
- 新 carrier需要应用层可观察的额外 ordering/recovery语义；
- 当前 Data Connection identity/generation模型无法表达新的多 Renderer拓扑。

仅仅“Desktop和PWA实现方式不同”不是创建新 Profile 的理由。
