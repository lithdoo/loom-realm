# Hostra 桌面程序主系统与渲染宿主架构

> 状态：**Active Design**  
> 适用范围：第一阶段桌面本地模式  
> 最近复核：2026-07-28  
> 主要定义：程序主系统承载、子系统进程监督、Renderer 通道和安全边界

本文档定义 LoomRealm 使用 [`lithdoo/hostra`](https://github.com/lithdoo/hostra) 承载桌面程序主系统和 Web 渲染端时的集成边界。

相关文档：

- [`system-overview.md`](./system-overview.md)：总体架构；
- [`main-system-and-subsystems.md`](./main-system-and-subsystems.md)：调用栈和子系统；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：JSON-RPC 通信；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：渲染端状态协调。

核心结论：

> Hostra 的主进程承载 LoomRealm 程序主系统；程序主系统维护子系统调用栈和进程生命周期；各模块子系统直接与 Renderer 交换输入和 Scope 状态。

## 1. 总体结构

```text
Hostra / Electron Main
├── BrowserWindow 生命周期
├── LoomRealm 程序主系统
│   ├── 游戏包入口加载
│   ├── 子系统调用栈
│   ├── 子系统进程监督
│   └── call / return 控制面
├── MessageChannel 建立
└── 桌面能力与安全策略

Renderer Process
├── Stack Store
├── Input Router
├── Frame/Scope Store
├── Scope Tree Reconciler
└── DOM / CSS

Subsystem Processes
├── loom.map
├── 其他内置或外部系统
├── 自身状态和规则
└── 自身 Scope Projector
```

数据路径：

```text
Renderer ⇄ 当前活动子系统
```

控制路径：

```text
Renderer ⇄ 程序主系统 ⇄ 子系统
```

程序主系统不转发普通输入和 Scope 更新。

## 2. Hostra / Electron Main 职责

负责：

- 创建和关闭 BrowserWindow；
- 解析 CLI 传入的游戏包路径；
- 启动 LoomRealm 程序主系统；
- 读取游戏清单和入口文件；
- 启动、监督和关闭子系统进程；
- 维护子系统调用栈；
- 为 Renderer 与子系统建立 MessagePort；
- 在 Frame 入栈、暂停、恢复和出栈时更新连接；
- 处理子系统崩溃；
- 提供受限桌面能力；
- 限制导航、Origin 和外部链接。

不负责：

- 地图移动、碰撞或 Portal；
- 菜单和对话规则；
- 子系统 Client State 生成；
- DOM、CSS 和动画；
- 解析节点 Tag 的业务语义。

## 3. 程序主系统位置

桌面模式下，LoomRealm 程序主系统运行在 Electron Main 或其受控主服务中。

它维护：

```text
游戏包上下文
子系统注册表
调用栈
Frame / Activation
子系统进程句柄
Renderer 数据端口映射
```

程序主系统可以拆为 Main 内部组件或独立受监督服务，但对外必须保持相同调用栈和 JSON-RPC 语义。

第一阶段推荐直接位于 Electron Main，减少额外控制进程；子系统仍使用独立进程。

## 4. 子系统进程

子系统可以使用 Electron `utilityProcess`、Node 子进程或其他本地可执行程序承载。

每个进程启动后先通过控制通道完成握手：

```text
process started
→ system.hello
→ protocol version negotiation
→ system.initialize(frameId, input)
→ system.ready
→ system.activate(activationId)
```

第一阶段可以每个 Frame 启动一个进程。后续可以复用进程，但调用身份必须继续由 `frameId` 表示。

## 5. Renderer 与子系统直连

Main 为每个有效 Frame 创建专用 MessageChannel：

```text
MessageChannelMain
├── port A → Renderer
└── port B → Subsystem Process
```

建立后，普通消息直接传输：

```text
Renderer → input.dispatch → Subsystem
Subsystem → scope.replace → Renderer
Subsystem → event.emit → Renderer
```

Main 只负责创建、转交和撤销端口，不解析业务 payload。

## 6. Preload API

Renderer 不应获得通用 Electron IPC。Preload 只暴露窄接口：

```ts
interface LoomRealmDesktopApi {
  connectMain(): Promise<MainControlConnection>;

  onFrameConnection(
    listener: (connection: FrameConnection) => void,
  ): () => void;

  openExternal(url: string): Promise<void>;
}
```

FrameConnection 至少包含：

```ts
interface FrameConnection {
  readonly frameId: string;
  readonly activationId: string;
  readonly port: MessagePort;
}
```

不得暴露：

```ts
send(channel: string, value: unknown): void;
```

## 7. 启动流程

```text
Hostra 启动
→ 解析 game directory
→ 创建程序主系统
→ 打开和校验游戏包
→ 读取 realm.entry.json
→ 启动初始子系统
→ 初始化并等待 ready
→ 创建 Renderer 窗口
→ 建立 Main 控制通道
→ 建立初始 Frame 数据通道
→ 发送 stack.snapshot
→ 子系统发送 state.snapshot
→ 显示窗口
```

在初始子系统 ready 和首次 Scope Snapshot 可获取前，不应向用户展示未初始化的游戏页面。

## 8. Frame 入栈

```text
当前子系统 system.call
→ 程序主系统启动目标进程
→ system.initialize(input)
→ 目标 ready
→ 暂停旧栈顶
→ 新 Frame 入栈
→ 创建新 MessageChannel
→ 端口交给 Renderer 和新子系统
→ 更新 stack / input target
→ 新子系统发送首次 Snapshot
```

Frame 出栈时：

```text
子系统 system.return
→ 程序主系统关闭当前 Frame
→ Renderer 删除 Frame Scopes
→ 撤销 MessagePort
→ 恢复上一 Frame
→ 签发新 activationId
→ system.resume(result)
→ 更新输入目标
```

## 9. 崩溃处理

### 栈顶子系统崩溃

```text
Main 检测 process exit
→ 生成 SUBSYSTEM_PROCESS_EXITED
→ 撤销 Frame 数据端口
→ 通知 Renderer frame.popped / system.failed
→ 弹栈
→ 将 failed result 交给调用者
→ 恢复上一 Frame
```

初始子系统崩溃时，程序会话进入 failed，Renderer 显示平台错误页面。

### Renderer 崩溃或重载

调用栈和子系统状态继续存在。新 Renderer：

```text
重新连接 Main
→ 获取 stack.snapshot
→ 重建各 Frame MessagePort
→ 向各子系统请求 state.snapshot
→ 恢复 DOM
```

### Main 崩溃

第一阶段不提供透明恢复。所有子系统应被终止，重新启动游戏会话。

## 10. 安全边界

推荐 Electron 配置：

```text
contextIsolation = true
nodeIntegration = false
sandbox = true（在兼容条件允许时）
```

必须限制：

- 导航到非应用 Origin；
- `window.open`；
- 任意 Electron IPC channel；
- Renderer 文件系统和子进程访问；
- 消息大小和发送速率；
- 子系统伪造其他 Frame；
- 游戏包路径逃逸；
- 外部 URL 打开。

本地 MessagePort 也必须执行 JSON Schema、Frame 和 Activation 校验。

## 11. 浏览器开发模式

普通浏览器无法直接接收本机 MessagePort 时，可以使用本地 WebSocket 适配：

```text
Browser
⇄ Main Control WebSocket
⇄ Subsystem Data WebSocket
```

语义与桌面模式一致：

- Main 控制通道只管理调用栈；
- 每个 Frame 有独立子系统数据连接；
- 输入和 Scope 不通过 Main 业务转发。

传输适配不得改变 JSON-RPC 方法和 Frame 语义。

## 12. 退出流程

```text
用户关闭窗口
→ Main 停止接受新 system.call
→ 从栈顶向下关闭 Frame
→ 等待有限关闭期限
→ 强制终止未退出子系统
→ 清理 MessagePort
→ 关闭程序主系统
→ 退出 Hostra
```

游戏包只读，因此退出时不写回游戏包。Save System 进入后续设计。

## 13. 第一阶段验收

- Hostra 启动程序主系统；
- `realm.entry.json` 启动初始地图子系统；
- Renderer 与地图子系统使用直接 MessagePort；
- 子系统调用测试系统时创建新 Frame 和端口；
- 输入目标随入栈和出栈切换；
- 下层 Frame Scope 保留显示；
- Frame 出栈后全部 Scope 和端口被清理；
- 栈顶子系统崩溃可返回 failed 结果；
- Renderer 重载可恢复 Stack 和各 Frame Snapshot；
- Main 不参与地图输入和 Scope 消息转发。

## 14. 当前结论

```text
Hostra Main
    承载程序主系统和调用栈
        ↓ 建立通道
Renderer ⇄ 模块子系统
    直接交换输入和 Scope
```

Hostra 是桌面宿主和程序主系统载体，不是游戏业务 Runtime；各模块子系统才是各自业务状态和 Scope 的拥有者。