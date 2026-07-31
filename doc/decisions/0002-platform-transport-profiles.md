# ADR 0002：平台传输 Profile

> 状态：Accepted  
> 日期：2026-08-01  
> 影响范围：通信系统、桌面宿主、PWA 宿主、Frame 数据通道、Content API

## 背景

桌面端由独立 LoomRealm Main、Hostra、FSDB 服务和各 System Process 组成。LoomRealm 无法直接使用 Hostra Electron Main 创建 MessageChannel。PWA 则天然支持 Window 与 Worker 之间的 MessagePort，但不能使用本地 OS 进程和任意 localhost 服务作为公共前提。

需要在不同平台采用不同传输，同时保持 System、Frame、Activation、Sequence、Revision 和 Resync 语义一致。

## 考虑过的方案

### 所有平台统一 WebSocket

优点：实现和调试工具统一。

代价：PWA 内部需要不必要的网络层，无法充分利用 MessagePort 和结构化克隆；纯 PWA 不能可靠启动 localhost 服务。

### 所有平台统一 MessagePort

优点：低延迟，无 TCP。

代价：桌面当前 Hostra 不提供 Electron Main Broker；跨语言原生子系统不能直接接收 Electron MessagePort。

### 语义统一、传输分 Profile

优点：符合平台能力，保留统一协议和测试 Fixture。

代价：需要维护多个 Transport Adapter 和一致性测试。

## 决定

采用以下 Profile：

| 语义连接 | 桌面 | PWA |
|---|---|---|
| Renderer ⇄ Main | localhost WebSocket | MessagePort |
| Main ⇄ System Container | localhost WebSocket | MessagePort |
| Renderer ⇄ Frame Runtime | 每 Frame localhost WebSocket | 每 Frame MessagePort |
| Content API | localhost HTTP | same-origin Fetch + Service Worker |

JSON-RPC、Frame Data Channel 和 Content API 的业务语义独立于传输。

## 结果

- 普通输入和 Client State 不经过 Main 或 Hostra 转发；
- 桌面支持任意语言子系统；
- PWA 使用浏览器原生 Worker 通信；
- Transport Adapter 必须通过相同 Conformance Fixture；
- 连接授权、背压和错误由各 Profile 实现，但不得改变协议结果。

## 重新评估条件

- Hostra 提供受限 MessagePort Broker；
- 浏览器新增适合本地进程通信的标准能力；
- WebTransport 在目标平台成熟并证明有明显收益；
- 性能测试显示当前 Profile 无法满足 P99 延迟目标。
