# ADR 0002：平台传输 Profile

> 状态：Accepted  
> 日期：2026-08-01  
> 修订：2026-08-01，纠正 Renderer 数据 Transport 粒度为每 System 一个连接，Frame 在连接内多路复用  
> 影响范围：通信系统、桌面宿主、PWA 宿主、Renderer–Subsystem 数据协议、Content API

## 背景

桌面端由独立 LoomRealm Main、Hostra、FSDB 服务和各 System Process 组成。LoomRealm 无法直接使用 Hostra Electron Main 创建 MessageChannel。PWA 则天然支持 Window 与 Worker 之间的 MessagePort，但不能使用本地 OS 进程和任意 localhost 服务作为公共前提。

LoomRealm 还已经确定：

```text
每个 systemId 一个 Runtime Container
每个 Runtime Container 可以承载多个 Frame
```

因此 Transport 粒度需要与 Runtime Container 粒度一致，同时保持各 Frame 的 Activation、Sequence、Revision 和 Resync 相互隔离。

## 考虑过的方案

### 所有平台统一 WebSocket

优点：实现和调试工具统一。

代价：PWA 内部需要不必要的网络层，无法充分利用 MessagePort 和结构化克隆；纯 PWA 不能可靠启动 localhost 服务。

### 所有平台统一 MessagePort

优点：低延迟，无 TCP。

代价：桌面当前 Hostra 不提供 Electron Main Broker；跨语言原生子系统不能直接接收 Electron MessagePort。

### 每 Frame 一个数据 Transport

优点：Frame 故障域物理隔离，连接生命周期直观。

代价：与“每 System 一个 Runtime Container”的承载模型不一致；同一子系统多个 Frame 会重复创建 WebSocket/MessagePort、重复认证和重复连接管理；Frame suspend/resume 会不必要地影响 Transport 生命周期。

该方案在早期文档中被错误记录为第一阶段决定，本次修订明确废弃该表述。

### 每 System 一个数据 Transport，Frame 逻辑多路复用

优点：

- Transport 粒度与 Runtime Container 一致；
- 同一 System 的共享代码、缓存和数据连接具有一致生命周期；
- Frame 仍可通过 `frameId + activationId + sequence` 完成独立路由和故障隔离；
- 桌面与 PWA 可以保持完全相同的逻辑拓扑。

代价：

- Renderer 和 Runtime Container 需要 Frame Stream Router；
- 共享 Transport 需要按 Frame 进行背压与公平调度；
- 单个 Transport 故障会同时影响该 System 的全部 Frame，需要逐 Frame Resync。

## 决定

采用“语义统一、传输分 Profile、数据 Transport 按 System 建立”的方案：

| 语义连接 | 桌面 | PWA |
|---|---|---|
| Renderer ⇄ Main | 每会话一条 localhost WebSocket | 一条 MessagePort |
| Main ⇄ System Container | 每 System 一条 localhost WebSocket | 每 System 一条控制 MessagePort |
| Renderer ⇄ System Container | 每 System 一条 localhost WebSocket | 每 System 一条数据 MessagePort |
| Frame Stream | 在 System Data Connection 内多路复用 | 同左 |
| Content API | localhost HTTP | same-origin Fetch + Service Worker |

Frame Stream 使用：

```text
frameId + activationId + direction + sequence
```

进行逻辑隔离。

JSON-RPC、Renderer–Subsystem 数据协议和 Content API 的业务语义独立于具体 Transport。

## 生命周期决定

- Frame create 不创建新的物理 Data Transport；
- Frame suspend 不关闭 System Data Connection；
- Frame resume 在原 System Data Connection 上创建新的 Activation epoch；
- Frame close 只删除对应 Logical Stream；
- Renderer 重载时按当前有效 `systemId` 重建数据 Transport，再逐 Frame Resync；
- Runtime Container 退出时该 System Data Connection 失效，并影响其全部 Frame。

## 结果

- 普通输入和 Client State 不经过 Main 或 Hostra 转发；
- 桌面支持任意语言子系统；
- PWA 使用浏览器原生 Worker 通信；
- 同一 System 的多个 Frame 共享物理 Transport，但业务状态和顺序相互隔离；
- Transport Adapter 必须通过相同 Conformance Fixture；
- 单 Frame Resync 不影响同一 Transport 上的其他 Frame；
- System Data Transport 必须有多 Frame 公平调度和有界队列。

## 重新评估条件

- Hostra 提供受限 MessagePort Broker；
- 浏览器新增适合本地进程通信的标准能力；
- WebTransport 在目标平台成熟并证明有明显收益；
- 性能测试显示单 System 共享 Transport 出现不可接受的 Head-of-Line Blocking；
- 需要多个 Renderer 同时连接同一 Runtime Container，并且现有连接模型不足以表达会话关系。
