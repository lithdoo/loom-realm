# ADR 0001：每个 System 一个 Runtime Container

> 状态：Accepted  
> 日期：2026-08-01  
> 修订：2026-08-01，对齐 ADR 0002，明确 Renderer Data Transport 属于 Container 而非 Frame  
> 影响范围：程序主系统、模块子系统、桌面进程、PWA Worker、生命周期协议

## 背景

LoomRealm 的调用栈以 Frame 表达一次系统调用。早期文档曾允许每个 Frame 启动独立进程，但这会导致重复加载代码和内容缓存、增加移动端 Worker 数量，并混淆调用身份与承载身份。

同一 `systemId` 可能被多次调用，且每次调用都需要独立权威状态、Activation、输入队列和 Client State。

## 考虑过的方案

### 每 Frame 一个进程或 Worker

优点：故障隔离直接，生命周期简单。

代价：

- 进程和 Worker 数量随调用栈增长；
- 重复加载代码、Schema、WASM 和 Repository Cache；
- PWA 和移动环境成本过高；
- Frame 与承载身份耦合。

### 每 System 一个进程或 Worker

优点：

- 共享系统代码和不可变内容缓存；
- 桌面与 PWA 容易建立一致映射；
- Frame 仍可作为独立协议实例；
- 调用栈深度不直接决定进程数量；
- Renderer Data Transport 可以与 Container 生命周期对齐。

代价：

- Container 内需要 Frame 路由和调度；
- Container 崩溃会影响同 System 的多个 Frame；
- 实现必须严格隔离 Frame 可变状态和 Logical Stream。

### 所有 System 共用一个 Runtime

优点：资源成本最低。

代价：扩展和故障边界弱，跨语言支持差，容易形成共享可变全局状态。

## 决定

采用：

```text
每个 systemId 一个 Runtime Container
每个 Container 可以承载多个 Frame Runtime
每个 Container 与 Renderer 最多一条有效 System Data Connection
每个 Frame 独立业务状态、Activation、Projector、Revision 和 Logical Stream
```

桌面 Runtime Container 是独立 OS Process。PWA Runtime Container 是 Dedicated Worker。

物理 Transport 属于 Runtime Container；Frame 通过 `frameId + activationId + sequence` 在共享 Transport 内多路复用，不拥有独立 WebSocket 或 MessagePort。

## 结果

Container 可以共享：

- 代码、Schema 和 WASM Module；
- Renderer System Data Connection；
- 只读 Content Client；
- Repository、请求去重和不可变内容缓存。

Frame 必须隔离：

- 权威业务状态；
- 输入和事件队列；
- Execution Loop；
- Activation；
- Client State Projector；
- State/Scope Revision；
- Renderer Logical Stream 双向 Sequence。

关闭、暂停、恢复或 Resync 一个 Frame 不关闭共享 System Data Connection。关闭一个 Frame 不关闭 Container。Container 崩溃影响其承载的全部 Frame，并使该 System Data Connection 失效。

## 重新评估条件

- 实测证明单 Container 多 Frame 调度造成不可接受的延迟；
- 实测证明单 System 共享 Transport 造成不可接受的 Head-of-Line Blocking；
- 第三方不可信 System 需要更细的安全隔离；
- 移动平台限制 Dedicated Worker 创建方式；
- 引入远程或分布式 Runtime Container；
- 需要为重型 Frame 提供可选独占 Container Profile。
