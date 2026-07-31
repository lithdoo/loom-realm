# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：System、Frame、进程、Worker 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[栈式运行系统](./stack-runtime-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[桌面宿主模块](../20-modules/desktop-host/README.md)、[PWA 宿主模块](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-01

## 1. 设计目标

运行承载系统定义 LoomRealm 的逻辑系统如何映射到桌面进程和浏览器 Worker，同时保持 Frame、生命周期、输入、Client State 和内容访问协议跨平台一致。

核心结论：

> 每个 `systemId` 对应一个可复用的 Runtime Container；每个 Frame 是该 Container 内部的独立业务实例，而不是独立进程或 Worker。

## 2. 核心术语

```text
System
    以 systemId 标识的业务扩展单元，例如 loom.map 或 loom.menu

Runtime Container
    System 的运行承载单元
    桌面为独立 OS 进程
    PWA 为 Dedicated Worker

Frame
    一次系统调用实例
    拥有独立 frameId、Activation、业务状态和 Client State

Host
    提供窗口、页面、进程或 Worker 创建、平台生命周期与安全边界
```

进程 ID、Worker 身份和 Frame ID 不能互相替代。

## 3. 承载粒度

```text
每个 systemId
    一个 Runtime Container

每个 Runtime Container
    可以承载零个、一个或多个 Frame Runtime

每个 Frame
    一个独立业务实例
    一个独立 Client State Projector
    一个独立 Renderer 数据通道
```

首次调用某 System 时，程序主系统创建或取得对应 Container；后续同 System Frame 复用该 Container。

最后一个 Frame 关闭后，Container 可以继续常驻，也可以按平台资源策略在空闲期后退出。该策略不改变协议语义。

## 4. Container 级共享与 Frame 级隔离

Runtime Container 可以共享：

- 系统代码和 Schema；
- 协议编解码器；
- 只读 Content Client；
- Repository 和并发请求去重；
- 已解析的不可变内容；
- WASM Module、纹理描述和其他只读缓存。

每个 Frame 必须独立保存：

- 权威业务状态；
- `activationId`；
- 输入和离散事件队列；
- Runtime Core 或状态机实例；
- Execution Loop 或调度状态；
- Client State Projector；
- State Revision、Scope Revision 和数据 Sequence；
- 与 Renderer 的 Frame 数据连接。

一个 Frame 的失败、关闭或 Resync 不得直接修改同 Container 内其他 Frame 的状态。

## 5. 程序主系统位置

程序主系统独立于业务子系统，拥有：

```text
System Registry
Runtime Container Registry
Frame Registry
Frame Stack
Activation
Input Target
Container Control Connections
Frame Channel Authority
```

程序主系统不持有子系统业务状态，也不转发普通输入和 Client State Payload。

## 6. 桌面承载 Profile

```text
LoomRealm Main Process
├── Frame Stack
├── Runtime Container Registry
├── Subsystem Process Supervisor
└── Channel Authority

FSDB Content Service Process
└── Readonly Content API → 游戏包目录

Hostra Electron Main Process
└── 窗口与桌面宿主

Hostra Renderer Process
├── Stack Store
├── Frame/Scope Store
├── Input Router
└── DOM / Canvas / WebGL

Subsystem Process: loom.map
├── Frame A Runtime
└── Frame B Runtime

Subsystem Process: loom.menu
└── Frame C Runtime
```

桌面 Profile 使用 localhost WebSocket 承载控制连接和 Frame 数据连接，使用 localhost HTTP 承载只读 Content API。

Hostra 只负责打开和管理 Web 窗口，不承载 LoomRealm Main，不需要向 LoomRealm 暴露 Electron Main API。

## 7. PWA 承载 Profile

```text
Window
└── Web Renderer

Main Runtime Dedicated Worker
├── Frame Stack
├── Runtime Container Registry
└── Channel Authority

Dedicated Worker: loom.map
├── Frame A Runtime
└── Frame B Runtime

Dedicated Worker: loom.menu
└── Frame C Runtime

Service Worker
└── Readonly Content API

OPFS / Cache Storage
└── 已安装游戏包和资源
```

PWA Profile 使用 MessagePort 承载控制连接和 Frame 数据连接；Service Worker 将统一 Content API 映射到 OPFS、Cache Storage 或其他同源持久存储。

Service Worker 不承载 Frame Stack、权威业务状态或固定 Tick。

## 8. Container 生命周期

概念状态：

```text
absent
→ starting
→ ready
→ idle / serving
→ closing
→ absent

starting / ready / serving
→ failed
```

Container 生命周期与 Frame 生命周期分离：

- Container ready 只表示可以接收 Frame 初始化；
- `frame.initialize(A)` 不创建新的进程或 Worker；
- `frame.close(A)` 只释放 A 的实例和数据连接；
- Container 关闭前必须拒绝新的 Frame；
- Container 崩溃会影响其承载的全部 Frame。

## 9. Container 崩溃

Container 退出或 Worker 发生不可恢复错误时：

```text
程序主系统标记 Container failed
→ 撤销其全部 Frame 数据授权
→ 停止向相关 Frame 发送输入
→ 按调用栈顺序将相关 Frame 转换为失败结果或会话故障
→ 根据策略重启或保持失败
```

第一阶段不要求透明恢复 Container 内的权威状态。未来如支持恢复，必须通过显式 Frame Snapshot 和协议握手实现，不能从 Renderer DOM 恢复。

## 10. 平台生命周期

桌面窗口重载时，LoomRealm Main 和子系统进程可以继续存在；Renderer 重新获取 Stack Snapshot、重建 Frame 连接并请求 Client State Snapshot。

PWA 页面隐藏、冻结或被回收时，不保证 Dedicated Worker 持续执行。PWA Host 应：

```text
页面隐藏
→ 停止输入
→ 暂停活动 Frame 调度
→ 按需要保存会话检查点

页面恢复
→ 检查 Worker 和连接
→ 重建必要 Container
→ 签发新 Activation
→ 恢复 Stack 和 Frame Snapshot
```

后台持续运行不是 LoomRealm PWA 第一阶段保证。

## 11. 安全边界

- Container 只能处理自身 `systemId` 的 Frame；
- Frame 消息必须校验 `frameId` 和 `activationId`；
- Runtime Container 不获得任意宿主进程能力；
- PWA Worker 只加载同源、已安装的可信系统代码；
- 桌面子系统可以使用不同语言，但必须通过正式协议互操作；
- Content API 只提供逻辑只读内容，不提供任意路径访问。

## 12. 架构不变量

1. Frame 是调用与状态隔离单元，不是进程或 Worker 身份；
2. 每个 `systemId` 同时最多有一个有效 Runtime Container；
3. 一个 Container 可以承载多个 Frame；
4. 每个 Frame 独立拥有权威状态、Projector、Revision 和数据连接；
5. 普通输入与 Client State 不经程序主系统业务转发；
6. 桌面和 PWA 的 Transport 可以不同，但协议语义必须一致；
7. Service Worker 和 FSDB 服务不拥有游戏运行状态。

## 13. 相关文档

- [通信系统](./communication-system.md)；
- [模块子系统模型](./subsystem-model.md)；
- [Frame 数据通道 v1](../15-contracts/frame-data-channel-v1.md)；
- [只读 Content API v1](../15-contracts/content-api-v1.md)；
- [ADR 0001：每个 System 一个 Runtime Container](../decisions/0001-system-container-per-system-id.md)；
- [ADR 0002：平台传输 Profile](../decisions/0002-platform-transport-profiles.md)。
