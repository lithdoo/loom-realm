# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：桌面宿主、Preload 和 Frame MessagePort 适配  
> 依赖：[通信系统](../../10-architecture/communication-system.md)、[程序主系统模块](../main-system/README.md)  
> 最近复核：2026-07-29

## 1. 模块结构

```text
Hostra / Electron Main
├── Window Lifecycle
├── LoomRealm Main System Host
├── Subsystem Process Adapter
├── Frame MessageChannel Factory
├── Renderer Control Bridge
├── Restricted Preload API
└── Desktop Security Policy
```

## 2. Main System Host

在 Electron Main 或受控主服务中承载 LoomRealm 程序主系统。桌面宿主只提供运行环境，不拥有游戏业务状态。

## 3. Process Adapter

使用 `utilityProcess`、Node 子进程或其他受控进程启动子系统，完成协议握手、生命周期转发、退出监听和关闭期限。

## 4. MessageChannel Factory

为每个有效 Frame 创建专用数据通道：

```text
Renderer Port ⇄ Subsystem Port
```

Main 负责创建、交付和撤销端口，不解析普通输入或 Scope Payload。

## 5. Restricted Preload API

Renderer 只获得窄接口，例如：

- 连接 Main 控制面；
- 接收 Frame 数据连接；
- 请求允许的桌面能力；
- 安全打开外部链接。

不得暴露任意 `send(channel, value)`、文件系统或子进程 API。

## 6. Desktop Security Policy

- `contextIsolation = true`；
- `nodeIntegration = false`；
- 在兼容条件允许时启用 Sandbox；
- 限制导航、`window.open` 和外部 URL；
- 校验 MessagePort 消息 Schema、大小和速率；
- 防止子系统伪造其他 Frame；
- 防止游戏包路径逃逸。

## 7. 浏览器开发适配

浏览器模式可以使用本地 WebSocket 替代 MessagePort，但必须保持同一控制面、数据面、Frame 和 Activation 语义。

## 8. 故障处理

- 栈顶子系统崩溃：撤销端口并交给主系统恢复调用者；
- Renderer 重载：主系统和子系统继续运行，重新建立 Stack 和 Frame Snapshot；
- Main 崩溃：第一阶段终止所有子系统并重新启动会话；
- 用户退出：从栈顶向下有限关闭，超时后强制终止。

## 9. 核心不变量

- Main 不转发普通数据面消息；
- Renderer 不获得通用 Electron IPC；
- 每个 Frame 数据连接绑定 Frame 身份；
- Frame 出栈后端口不可继续使用；
- Hostra 适配层不依赖地图业务类型。

现有详细资料：[Hostra 桌面程序主系统与渲染宿主](../../architecture/hostra-desktop-client-host.md)。
