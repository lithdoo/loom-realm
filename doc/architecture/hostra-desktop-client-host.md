# Hostra 桌面程序主系统与渲染宿主架构

> 状态：**Legacy**  
> 最近复核：2026-08-01  
> 被替代原因：本文原先假设 Hostra Electron Main 直接承载 LoomRealm Main，并为 Renderer 与子系统创建 Electron MessagePort。当前已确认 Hostra 是独立窗口 Shell，LoomRealm 无法依赖其 Main/Preload Broker。

本文不再作为实现依据。当前权威设计：

- [运行承载系统](../10-architecture/runtime-hosting-system.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Frame 数据通道 v1](../15-contracts/frame-data-channel-v1.md)；
- [Hostra 桌面宿主模块](../20-modules/desktop-host/README.md)；
- [ADR 0002：平台传输 Profile](../decisions/0002-platform-transport-profiles.md)。

当前桌面结论：

```text
LoomRealm Main Process
    独立运行，维护调用栈和 Runtime Container

Hostra
    只负责 Electron 窗口宿主

每个 systemId
    一个独立 Subsystem Process
    进程内可承载多个 Frame Runtime

Renderer ⇄ Main / Frame Runtime
    localhost WebSocket

Runtime Container / Renderer ⇄ FSDB
    localhost HTTP Content API
```

普通输入和 Client State 不经过 Hostra Main 或 LoomRealm Main 业务转发。

旧版本的完整设计仍可通过 Git 历史追溯。
