# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

实施层描述如何落地当前协议；内部机制可以调整，但不得改变上层 authority/lifecycle/recovery 语义。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)
- [测试策略](./testing-strategy.md)
- [第一阶段交付计划](./phase-1-delivery-plan.md)

## 当前实施前提

```text
Game Package v1
Desktop Node.js Launcher Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Renderer Control v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

没有 Renderer Component Profile、Standard Input Mapping Profile、Content Access Profile、Range Profile、Event FIFO Profile 或 Desktop/PWA Data Bootstrap application protocol。

## 协议设计成熟度与实施含义

详细链路目的、成熟度和剩余协议工作以 [正式契约目录 · 链路协议设计进度](../15-contracts/README.md#11-链路协议设计进度) 为 source of truth。

这里的百分比表示**协议设计成熟度**，不是代码实现完成度、测试覆盖率或发布进度。即使某协议标记 `100% / Frozen`，实现仓库仍可能尚未开始对应模块。

| 协议 | 设计成熟度 | 对实施阶段的含义 | 当前下一步 |
|---|---:|---|---|
| Game Package v1 | ≈95% | schema/topology 已稳定，可开始 validator 与 loader | 补集合级 validation/conformance |
| Desktop Node.js Launcher v1 | 100% / Frozen | 可以直接实现，不应再等待协议设计 | Launcher + Supervisor + bootstrap fixtures |
| Subsystem Control v1 | ≈95% | wire/lifecycle 已基本稳定 | 实现 hello/status/shutdown + final conformance |
| Runtime Control Application Profile v1 | ≈95% | Control/Frame 组合规则可直接落地 | shared dispatcher/ID/no-Batch integration tests |
| Frame / Call v1 | 100% / Frozen | 核心调用栈实现不应再等待设计 | authority state machine + executable conformance |
| Main ⇄ Renderer Control v1 | ≈95% | authority snapshot 模型可实现 | 实现 snapshot/control-loss；同步做 Frozen review |
| Data Connection v1 | ≈95% | lifecycle/identity 已闭合 | Host carrier binding + current/retired tests |
| User Input v1 | ≈80–85% | Core 可实现，但标准设备 payload 仍需先封口 | canonical keyboard/pointer/gamepad schema + limits |
| Render Update v1 | ≈85–90% | Registry/Snapshot/Patch/Event 可实现原型 | hard limits/encoding/conformance 后冻结 |
| Content API v1 | ≈85–90% | 核心 HTTP/Fetch 语义已足够进入实现 | service/client implementation + conformance |

整体协议架构成熟度可粗略视为 **≈90%**。这意味着主要 authority、lifecycle、commit、failure/recovery 问题已经解决；后续工作重心应该逐步从“继续设计协议”转向“关闭少量 wire 边界 + executable conformance + vertical slice implementation”。

### 当前三段链路成熟度

```text
启动 / Runtime / Frame 控制链       ≈97%  —— 基本定型，可直接实现
Renderer Authority / Data 链       ≈95%  —— 主要剩 freeze/conformance + Host integration
User Input / Render / Content 数据层 ≈85%  —— 主要剩 payload/limits/conformance
```

当前不应因为实现便利重新引入已经取消的 Component/Input Mapping/Content Access/Transport Bootstrap application Profile。

## Runtime / Frame

```text
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1
```

关键约束：

```text
Control hello selects v1
Frame v1 statically bound
hello before Frame operation
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready has no Data endpoint
```

Frame v1 已直接包含 suspend provenance：child-call suspension可通过对应 Child outcome + fresh `frame.resume` 恢复；administrative `frame.suspend` 没有 generic resume。

## Renderer / Data / Input / Render

Renderer Control：Main 发布 full committed Authority Snapshot，不携 endpoint/ticket/MessagePort。

Data Connection：

```text
Renderer Control DataAuthority
→ Host implementation establishes carrier
→ Data Connection current/retired
```

Host 可以自由选择 Desktop localhost WebSocket/ticket、PWA MessagePort 等建立机制，只需满足 Data Connection 的 identity/generation/current-carrier invariants。

User Input：

```text
InputTarget/Activation
∩ Interest
∩ Producer availability
```

标准 keyboard/pointer/gamepad canonical payload 最终直接补进 User Input v1；DOM/OS/device adapter 不进入协议。

Render Update唯一正式入口：

```text
Registry
Snapshot(revision)
Patch(R→R+1, insert/remove/move/update)
Event
```

`tag` 是 opaque string；Renderer 如何映射/呈现属于实现。

## Content

Content API 只定义 logical readonly HTTP/Fetch semantics。

Desktop Host 自行创建/注入/轮换 scoped bearer；PWA 使用 same-origin Service Worker authority。credential distribution 不再形成独立 Content Access Profile。

Range 若支持直接使用标准 HTTP Range；resource/concurrency/rate/timeouts 是 bounded deployment configuration。

## Conformance

[测试策略](./testing-strategy.md) 覆盖 Control、Runtime Profile、Frame、Renderer Control、Data Connection、User Input、Render Update、Content。

正式兼容判断只检查跨实现必须一致的行为，不检查：

```text
Component Factory/Registry
DOM/OS mapping implementation
Host token/ticket/Port delivery mechanism
queue concrete capacity/drop preference
Patch-vs-Snapshot heuristic
cache/index implementation
```

## 实施原则

1. Current Contract先写/补 conformance fixture，再接入两端实现；
2. 不为未实现历史设计保留 fallback/dual-stack；
3. Launcher/Control/Frame/Renderer Control/Data/Input/Render/Content边界不得因代码便利合并；
4. Runtime `ready`不得成为 Data endpoint discovery；
5. Main RuntimeFailureUnwindCoordinator是唯一 Stack recovery authority；
6. Renderer/Transport不得计算 unwind root或恢复旧 Activation；
7. Host platform binding只负责实际 carrier/credential establishment，不成为 application protocol authority；
8. bounded implementation policy 不应为了统一数值被错误升级成协议；
9. 实施发现真正跨实现语义缺口时先更新 Contract/ADR；纯实现差异留在模块文档；
10. Tracking文档不定义正式行为。

## 当前实施顺序

```text
Game Package / Desktop Launcher
    ↓
Subsystem Control / Runtime Control Profile
    ↓
Frame / Call + executable conformance
    ↓
Main ⇄ Renderer Control closure
    ↓
Data Connection + Desktop/PWA Host binding implementation
    ↓
User Input canonical payload + limits
    ↓
Render Update hard limits/conformance
    ↓
Content API implementation/conformance
    ↓
loom.map + Hostra/PWA vertical slice
```

### 当前优先级

| 优先级 | 工作 | 目的 |
|---|---|---|
| P0 | User Input canonical payload + limits | 让标准设备输入真正可以跨 Renderer/Subsystem 互操作 |
| P0 | Render Update hard limits + conformance | 让已闭合的 Patch/revision/recovery 模型进入可冻结状态 |
| P1 | Renderer Control Frozen review | 停止 authority plane 继续演化，进入稳定实现 |
| P1 | Data Connection Frozen review | 固定 generation/current/retired/reconnect 边界 |
| P1 | Control/Profile final conformance | 把已成熟控制链转成 executable compatibility baseline |
| P2 | Content API implementation/conformance | 不再扩 Profile，直接验证当前 HTTP/Fetch contract |
| P2 | Desktop/PWA Host integration | 实现 carrier/credential binding，不创造新的 application protocol |

治理原则：**只协议化必须互操作的事实，其余交给实现。**
