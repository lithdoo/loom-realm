# Hostra 桌面客户端宿主架构

> 状态：**Active Design**  
> 适用范围：第一阶段桌面本地模式  
> 最近复核：2026-07-25  
> 主要定义：桌面进程、窗口、通信通道、启动生命周期和安全边界

本文档定义 LoomRealm 使用 [`lithdoo/hostra`](https://github.com/lithdoo/hostra) 承载桌面 Web Client 时的集成边界。

相关文档：

- [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md)：游戏包入口和 `realm.game.json`；
- [`system-overview.md`](./system-overview.md)：总体模块边界；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：LoomRealm Runtime RPC；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：Web Client 状态和 DOM 协调。

核心结论：

> Hostra 是通用 Electron 桌面宿主；LoomRealm Runtime 是权威游戏运行时；LoomRealm Web Client 是普通 Web 应用。

## 1. 总体结构

```text
Hostra
├── Electron 主进程
├── BrowserWindow 生命周期
├── Hostra Control RPC
└── LoomRealm Runtime 子进程管理
        │
        │ 打开窗口、关闭窗口、宿主控制
        ▼
LoomRealm Web Client
├── Runtime RPC 连接
├── Client Store
├── Scope Tree Reconciler
├── Custom Node Registry
├── Resource Cache
└── DOM / CSS
        │
        │ 状态、事件、命令和资源
        ▼
LoomRealm Runtime Service
├── 打开只读游戏包
├── Game Catalog 与 Repository
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core
├── Client State Projector
├── Runtime RPC
├── Resource Endpoint
└── Web Client 静态文件服务
```

Hostra 和 LoomRealm Runtime 可以都使用 JSON-RPC，但属于两个独立协议域。

## 2. Hostra 职责

Hostra 负责：

- 启动和退出 Electron 应用；
- 保证桌面应用单实例；
- 启动 LoomRealm Runtime Service 子进程；
- 创建、关闭和枚举 Web Client 窗口；
- 管理窗口标题、尺寸和开发工具设置；
- 等待 Runtime 明确就绪后再打开窗口；
- 限制窗口 Origin、导航和新窗口行为；
- 在宿主退出时终止其启动的 Runtime 子进程；
- 暴露最小、明确和可审计的桌面能力。

Hostra 不负责：

- 读取或解释 `realm.game.json`、FSDB 或 Pokémon Essentials 数据；
- 维护人物、地图、碰撞和 Portal 权威状态；
- 生成 Client State；
- 处理 LoomRealm Runtime RPC 业务；
- 渲染地图 DOM；
- 直接向 Runtime Core 写入用户输入；
- 保存游戏会话状态。

Hostra 应保持通用桌面 Web 宿主，不加入 LoomRealm 游戏规则。

## 3. LoomRealm Web Client 职责

Web Client 负责：

- 通过 LoomRealm Runtime RPC 连接 Runtime Service；
- 接收 `state.snapshot`、`scope.replace` 和 Runtime Event；
- 维护 Client Store；
- 按 Scope、Key、Tag 和 Data 协调 DOM；
- 将输入归一化为 Runtime 命令或节点事件；
- 按资源 Key 请求和缓存图片；
- 管理非权威动画和本地表现状态。

Web Client 不依赖 Electron 才能运行。同一客户端代码应支持：

- Hostra 桌面窗口；
- 普通浏览器连接本地 Runtime；
- 普通浏览器连接远程 Runtime；
- 后续兼容的浏览器内 Runtime 适配。

Web Client 不通过 Electron IPC 读取游戏包、本机 Pokémon Essentials 工程或 Runtime 内部状态。

## 4. LoomRealm Runtime Service 职责

桌面本地模式下，Hostra 启动 LoomRealm Runtime Service 子进程。

Runtime Service 负责：

- 根据 CLI 参数打开只读游戏包目录；
- 读取和校验 `realm.game.json`；
- 建立 Game Catalog 和 Repository；
- 异步加载入口地图和玩家人物；
- 创建 Session Coordinator、Execution Loop 和 Runtime Core；
- 提供 Runtime RPC、资源接口、静态 Web Client 和健康检查；
- 发布 Client State、Runtime Event 和明确错误；
- 管理当前游戏会话生命周期。

Runtime Service 不依赖 Hostra 才能运行。

## 5. 两套通信通道

### 5.1 Hostra Control RPC

Hostra Control RPC 只处理桌面宿主能力，例如：

```text
openWindow
closeWindow
getAllWindows
getVersion
getPlatform
```

该协议不承载游戏状态、人物命令、Client State 或资源访问。

### 5.2 LoomRealm Runtime RPC

LoomRealm Runtime RPC 处理：

```text
客户端状态同步
用户命令和节点事件
Runtime Event
完整状态恢复
运行时错误
资源访问语义
```

Web Client 直接连接 Runtime Service，而不是经由 Hostra Control RPC 代理游戏通信。

### 5.3 强制边界

```text
Hostra Control RPC
    = 窗口、进程和桌面宿主控制

LoomRealm Runtime RPC
    = 游戏会话、Client State、事件和资源
```

两套协议必须使用独立端点、生命周期、鉴权信息和命名空间。

## 6. 桌面启动流程

第一阶段启动流程：

```text
用户选择或传入游戏包目录
→ Hostra 启动 LoomRealm Runtime Service
→ Runtime 执行 loom-realm start <game-directory>
→ Runtime 读取 realm.game.json
→ Runtime 建立当前 Session
→ Runtime 健康检查和 Runtime RPC 就绪
→ 启动协调层调用 Hostra.openWindow
→ Hostra 加载本地 Web Client URL
→ Web Client 直接连接 Runtime RPC
→ Runtime 发送完整 Client State
→ Web Client 建立 DOM 场景
```

不得使用固定延时猜测 Runtime 是否就绪。必须通过健康检查、端口握手或明确 ready 信号。

Web Client 默认通过本地 HTTP Origin 加载：

```text
http://127.0.0.1:<client-port>/
```

不以 `file://` 作为默认方式，以保持模块、资源、缓存、Origin 和远程部署行为一致。

## 7. 进程所有权和退出

```text
Hostra
└── LoomRealm Runtime Service
    ├── 当前 Runtime Session
    ├── Web Client 静态服务
    └── Resource Endpoint
```

规则：

- Hostra 负责启动和终止其拥有的 Runtime 子进程；
- Runtime 启动失败时不打开游戏窗口；
- Runtime 意外退出时，客户端显示明确连接故障；
- Hostra 退出时先停止接受新的宿主控制，再终止 Runtime；
- 退出过程应支持正常终止和超时强制终止；
- 浏览器窗口不保存唯一权威会话状态；
- 第一阶段可以在最后一个 LoomRealm 窗口关闭后结束本地 Runtime。

## 8. 配置边界

Hostra 可以通过本地配置或环境变量得到：

- 应用显示名称；
- Hostra Control RPC 地址和 Token；
- LoomRealm Runtime 启动命令；
- 游戏包目录；
- Runtime 本地端口或端口分配策略；
- Hostra 用户数据目录；
- 开发工具开关。

这些配置不属于游戏包 FSDB。

游戏身份、入口地图、玩家人物和 Feature 要求只由游戏包的 `realm.game.json` 定义。

Pokémon Essentials 本机工程路径只能存在于被 Git 忽略的开发工作区配置或转换工具参数中，不进入可运行游戏包。

## 9. Electron 安全边界

LoomRealm 窗口必须保持：

```text
contextIsolation = true
nodeIntegration = false
```

Web Client 不直接获得 Node.js 文件系统、进程或 Electron 主进程能力。

Preload 不应默认开放：

- 任意文件读取；
- 任意命令执行；
- 任意子进程启动；
- 任意窗口创建；
- 通用 Electron IPC；
- 游戏包外的素材目录访问；
- Pokémon Essentials 原工程访问。

确实需要的桌面能力应通过显式方法、参数 Schema、权限边界和独立审查加入。

## 10. Control RPC 安全

第一阶段要求：

- 默认只监听 `127.0.0.1`；
- 每次生产型桌面会话使用随机高熵 Token；
- 所有 RPC 参数执行结构校验；
- 不允许未授权客户端创建窗口；
- 只允许加载当前 Runtime 提供的本地可信 Origin，或用户明确配置的受信远程 Origin；
- 不向不可信远程页面开放 Preload 能力。

## 11. 导航和窗口限制

LoomRealm 窗口应限制：

- 导航到未授权 Origin；
- 页面自行创建未受控 Electron 窗口；
- 外部页面继承 LoomRealm Preload 能力；
- `javascript:`、不可信 `file:` 和其他危险 URL；
- 任意下载后自动执行。

外部链接应交给系统默认浏览器打开。

## 12. 本地和远程模式统一

```text
Hostra 桌面模式
Web Client → 本地 Runtime RPC → 本地 Runtime

普通浏览器本地模式
Web Client → 本地 Runtime RPC → 本地 Runtime

远程模式
Web Client → 远程 Runtime RPC → 远程 Runtime
```

这些模式共享：

- Client State 协议；
- Runtime Event 语义；
- Client Store 和 DOM 协调；
- 资源 Key 模型；
- 用户输入归一化。

Hostra 不改变游戏通信协议。

## 13. 推荐代码边界

```text
packages/
├── runtime-core/
├── runtime-server/
├── web-client/
└── hostra-launcher/
```

其中：

- `runtime-core` 保存权威状态和规则；
- `runtime-server` 保存 Session、Execution Loop、RPC、资源和健康检查；
- `web-client` 保存 Client Store、节点协调和呈现；
- `hostra-launcher` 保存 LoomRealm 专用的 Hostra 启动协调。

Hostra 仓库继续保存通用 Electron 宿主能力。

## 14. 第一阶段实施范围

第一阶段实现：

- Hostra 启动 LoomRealm Runtime Service；
- 向 Runtime 提供游戏包目录；
- Runtime 提供健康检查和明确 ready 信号；
- Hostra 等待就绪后打开一个 Web Client 窗口；
- Web Client 通过本地 HTTP 加载；
- Web Client 直接连接 Runtime RPC；
- Hostra 关闭时清理 Runtime 子进程；
- Control RPC 仅监听本机并启用 Token；
- 限制窗口 Origin、导航和新窗口。

第一阶段不实现：

- Hostra 读取或修改游戏包；
- Hostra 承载 LoomRealm Runtime RPC；
- Web Client 直接调用 Node.js 游戏逻辑；
- 多窗口共享复杂会话编排；
- 自动更新；
- 桌面插件系统；
- 任意本机文件浏览；
- 操作系统深度集成。

## 15. 测试要求

至少覆盖：

1. Hostra 能启动 Runtime 子进程；
2. Runtime 未就绪时不会提前打开窗口；
3. Runtime 正确读取 `realm.game.json`；
4. Runtime 就绪后打开本地 Web Client；
5. Web Client 连接 Runtime RPC 而不是 Hostra Control RPC；
6. 无效 Control RPC Token 被拒绝；
7. 不可信窗口 URL 和导航被拒绝；
8. Runtime 退出时客户端显示明确故障；
9. Hostra 退出时 Runtime 子进程被清理；
10. 普通浏览器仍可运行同一 Web Client；
11. `nodeIntegration` 保持关闭；
12. Hostra 不读取 FSDB 或参与游戏状态同步。

## 16. 冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 桌面宿主 | Hostra |
| 游戏包入口 | `realm.game.json` |
| Web Client | 普通 Web 应用 |
| 权威状态 | LoomRealm Runtime |
| 宿主控制 | Hostra Control RPC |
| 游戏通信 | LoomRealm Runtime RPC |
| 两套 RPC | 完全分离 |
| 窗口默认 Origin | Runtime 提供的本地 HTTP Origin |
| Runtime 就绪 | 健康检查或明确 ready 信号 |
| Electron | Context Isolation 开启，Node Integration 关闭 |
| Control RPC 监听 | `127.0.0.1` |
| Control RPC 鉴权 | 随机会话 Token |
| Runtime 子进程清理 | Hostra 负责 |

## 17. 当前结论

Hostra 只增加桌面窗口和进程管理能力。LoomRealm Runtime 独立打开只读游戏包并维护权威会话；Web Client 直接使用 Runtime RPC 和 Client State 协议。桌面模式不得改变 Runtime、Client State、资源或 DOM 协调的基础语义。