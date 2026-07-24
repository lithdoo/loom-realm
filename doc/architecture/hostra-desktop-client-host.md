# Hostra 桌面客户端宿主架构

## 1. 文档目的

本文档定义 LoomRealm 使用 [`lithdoo/hostra`](https://github.com/lithdoo/hostra) 承载桌面客户端时的组件职责、进程关系、通信通道、启动流程和安全边界。

Hostra 是 Electron 本地宿主，负责启动本地子进程并通过 WebSocket JSON-RPC 打开和管理 Web UI 窗口。Hostra 不替代 LoomRealm Web Client，也不承担地图、人物、碰撞、Portal、FSDB 或权威状态逻辑。

核心结论是：

> Hostra 是 LoomRealm 的桌面宿主；LoomRealm Web Client 是普通 Web 客户端；LoomRealm Runtime 是权威游戏运行时。

## 2. 总体架构

桌面本地模式采用以下结构：

```text
Hostra
├── Electron 主进程
├── BrowserWindow 生命周期
├── Hostra 控制 RPC
└── LoomRealm 本地服务子进程管理
        │
        │ openWindow / closeWindow / 宿主控制
        ▼
LoomRealm Web Client
├── 用户输入归一化
├── 客户端状态镜像
├── DOM 场景投影
├── CSS 移动和动画表现
└── 图片资源缓存
        │
        │ LoomRealm 状态同步与事件协议
        ▼
LoomRealm Runtime Server
├── 项目入口与 FSDB 加载
├── Pokémon Essentials 兼容编译
├── 地图、人物、碰撞和 Portal 运行时
├── 权威状态
├── Runtime WebSocket JSON-RPC
├── 图片资源 HTTP 接口
└── Web Client 静态资源服务
```

Hostra 和 LoomRealm Runtime 可以都使用 JSON-RPC，但它们是两个独立协议域。

## 3. Hostra 的职责

Hostra 负责桌面宿主能力：

- 启动和退出 Electron 应用；
- 保证桌面应用单实例；
- 启动 LoomRealm 本地服务子进程；
- 创建、关闭和枚举 Web UI 窗口；
- 设置窗口标题、尺寸和开发工具开关；
- 为窗口提供隔离的 Electron 环境；
- 在宿主退出时终止由其启动的子进程；
- 提供必要的最小桌面平台能力。

Hostra 不负责：

- 读取或解释 LoomRealm FSDB；
- 解析 Pokémon Essentials 地图；
- 维护地图和人物权威状态；
- 处理人物移动和碰撞；
- 判断 Portal；
- 生成客户端可见地图状态；
- 渲染地图 DOM；
- 直接向游戏状态写入用户输入。

Hostra 应保持为通用桌面 Web 宿主，避免加入 LoomRealm 专用游戏业务代码。

## 4. LoomRealm Web Client 的职责

LoomRealm Web Client 仍然是普通 Web 应用，负责：

- 连接 LoomRealm Runtime；
- 接收完整状态和增量状态；
- 维护客户端状态镜像；
- 将键盘等输入归一化为用户意图；
- 将地图和人物状态投影为 DOM；
- 使用 CSS Transform 表现人物格子间移动；
- 管理前端本地动画帧、加载状态和调试显示；
- 通过资源接口加载 Tileset、编译 Autotile 和人物图片；
- 在地图切换时原子替换 DOM 场景。

Web Client 不应依赖 Electron 才能运行。同一套 Web Client 应能够运行于：

- Hostra 桌面窗口；
- 普通浏览器；
- 连接本地 Runtime 的开发页面；
- 连接远程 Runtime 的 Web 部署。

Web Client 不通过 Electron IPC 读取 FSDB、本机 Pokémon Essentials 项目或人物逻辑状态。

## 5. LoomRealm Runtime Server 的职责

桌面本地模式下，Hostra 启动一个 LoomRealm Runtime Server 子进程。

该服务负责：

- 读取 `realm.project.json`；
- 加载、校验和编译项目 FSDB；
- 加载 Pokémon Essentials 兼容地图数据；
- 建立运行时地图、方向通行网格和渲染投影；
- 维护人物行走、碰撞、Portal 和地图切换状态；
- 维护后端权威状态；
- 提供状态同步和事件通道；
- 提供图片资源 HTTP 接口；
- 提供 Web Client 静态文件；
- 提供健康检查和服务就绪状态。

正式运行时不依赖 Hostra。远程部署或普通浏览器模式可以直接启动同一 Runtime Server，或者采用兼容协议的远程实现。

## 6. 两套 RPC 通道

### 6.1 Hostra 控制 RPC

Hostra 控制 RPC 只处理桌面宿主能力，概念上包括：

```text
openWindow
closeWindow
getAllWindows
getVersion
getPlatform
```

其调用方通常是 LoomRealm 本地启动器或 Runtime Server 的启动协调层，而不是地图渲染组件。

Hostra 控制 RPC 不承载游戏状态同步，也不为地图、人物、碰撞或 Portal 增加业务方法。

### 6.2 LoomRealm Runtime RPC

LoomRealm Runtime RPC 只处理运行时通信：

```text
状态同步
事件传递
重新建立完整状态
运行时错误与通知
```

Web Client 通过这一通道发送归一化用户意图，并接收后端权威状态。

### 6.3 强制边界

```text
Hostra Control RPC
    = 窗口和桌面宿主控制

LoomRealm Runtime RPC
    = 游戏状态和用户事件
```

两套 RPC 应使用不同的服务端点、连接生命周期和鉴权信息。不得因为二者都采用 JSON-RPC 而合并协议或共享业务命名空间。

## 7. 桌面本地启动流程

推荐启动流程：

```text
启动 Hostra
    ↓
Hostra 建立控制 RPC
    ↓
Hostra 启动 LoomRealm Runtime Server 子进程
    ↓
Runtime 加载项目并启动服务
    ↓
HTTP 健康检查和 Runtime WebSocket 均就绪
    ↓
启动协调层调用 Hostra.openWindow
    ↓
Hostra 加载本地 Web Client URL
    ↓
Web Client 连接 LoomRealm Runtime WebSocket
    ↓
Runtime 发送完整客户端可见状态
    ↓
Web Client 加载图片并构建 DOM 场景
```

不得使用固定延时猜测 Runtime 是否已经启动。必须通过健康检查、端口握手或明确的 ready 信号确认服务可用后再打开窗口。

Web Client 建议通过本地 HTTP 地址加载：

```text
http://127.0.0.1:<client-port>/
```

不以 `file://` 作为默认加载方式，以保证 ES Module、资源请求、缓存、Origin 和远程部署行为保持一致。

## 8. 进程与生命周期

桌面本地模式的进程所有权为：

```text
Hostra
└── LoomRealm Runtime Server
    └── Web Client 静态服务与资源服务
```

生命周期规则：

- Hostra 启动 Runtime 子进程；
- Runtime 启动失败时，Hostra 不打开游戏窗口并报告启动错误；
- Runtime 意外退出时，窗口显示连接故障或由 Hostra 关闭；
- Hostra 正常退出时，先停止控制 RPC，再终止 Runtime 子进程；
- 所有 LoomRealm 窗口关闭后，第一阶段可以同时结束本地 Runtime；
- 退出过程应有正常终止和超时强制终止两级处理；
- 不依赖浏览器窗口自身保存权威运行时状态。

## 9. 本地配置

Hostra 可以通过环境变量或本地配置启动 LoomRealm，例如：

```env
HOSTRA_APP_NAME=LoomRealm
HOSTRA_RPC_PORT=9333
HOSTRA_RPC_TOKEN=<random-local-token>
HOSTRA_SUBCMD=node ./packages/runtime-server/dist/cli.js
HOSTRA_CONFIG_DIR=.
HOSTRA_USER_DATA_DIR=./.loomrealm/user-data
```

以上字段仅表示宿主启动配置，不属于项目 FSDB。

项目内容、入口地图和玩家人物仍由 LoomRealm 项目入口和 FSDB 定义。Pokémon Essentials 本机路径仍只存在于被 Git 忽略的本地工作区配置中。

## 10. 安全边界

### 10.1 Electron 隔离

LoomRealm 窗口应保持：

```text
contextIsolation = true
nodeIntegration = false
```

Web Client 不直接获得 Node.js 文件系统、进程或任意 Electron 主进程能力。

### 10.2 最小 Preload API

Preload 只暴露必要、稳定和可审计的桌面能力。

不应默认向游戏页面开放：

- 任意文件路径读取；
- 任意命令执行；
- 任意子进程启动；
- 任意窗口创建；
- 任意 Electron IPC 调用；
- 对本机 Pokémon Essentials 目录的直接访问。

当某项桌面能力确实需要时，应以明确的方法、参数校验和权限边界单独加入。

### 10.3 Hostra 控制 RPC

第一阶段要求：

- 仅监听 `127.0.0.1`；
- 启动时生成或提供随机令牌；
- 不允许无令牌的生产型桌面会话；
- 对 RPC 参数进行结构校验；
- 限制可加载 URL；
- 不向不可信远程页面开放 Hostra Preload 能力。

### 10.4 窗口 URL 与导航

LoomRealm 桌面模式默认只允许加载：

- 当前 Runtime Server 提供的本地可信 Origin；
- 用户明确配置并通过验证的远程 LoomRealm Origin。

窗口应限制：

- 导航到未授权 Origin；
- 页面自行创建未受控 Electron 窗口；
- 外部页面继承 LoomRealm Preload 能力。

外部链接应交给系统默认浏览器打开，而不是在拥有桌面桥接能力的 LoomRealm 窗口中加载。

## 11. 推荐代码边界

LoomRealm 仓库可以采用以下概念包结构：

```text
packages/
├── runtime-core/
│   └── 地图、人物、碰撞、Portal 和权威状态
├── runtime-server/
│   ├── Runtime WebSocket JSON-RPC
│   ├── 图片资源 HTTP 接口
│   ├── Web Client 静态服务
│   └── 健康检查
├── web-client/
│   ├── 状态镜像
│   ├── 输入归一化
│   ├── DOM 场景投影
│   └── 资源缓存
└── hostra-launcher/
    ├── Hostra 控制 RPC 客户端
    ├── 服务就绪协调
    └── openWindow 启动逻辑
```

具体包名和目录结构由实现阶段决定，但职责边界应保持不变。

Hostra 仓库继续保存通用 Electron 宿主和窗口控制能力；LoomRealm 专用启动协调代码优先放在 LoomRealm 仓库中。

## 12. 本地与远程模式统一

LoomRealm Web Client 不应知道 Runtime 是否由 Hostra 启动。

```text
桌面本地模式
Web Client → 本地 WebSocket → 本地 Runtime

普通浏览器本地模式
Web Client → Worker 消息适配 → 浏览器内 Runtime

远程模式
Web Client → 远程 WebSocket → 远程 Runtime
```

三种方式共享：

- 状态同步语义；
- 事件传递语义；
- 客户端状态镜像；
- DOM 渲染实现；
- 图片资源引用模型。

Hostra 只增加桌面宿主和进程管理能力，不改变游戏通信协议。

## 13. 第一阶段实施范围

第一阶段实现：

- Hostra 启动 LoomRealm Runtime Server；
- Runtime Server 提供健康检查；
- 启动协调层等待服务就绪；
- 通过 Hostra 控制 RPC 打开一个 LoomRealm 窗口；
- Web Client 通过本地 HTTP 加载；
- Web Client 通过 Runtime WebSocket 接收地图和人物状态；
- Web Client 使用 DOM 渲染 Pokémon Essentials 测试地图；
- Hostra 关闭时清理 Runtime 子进程；
- Hostra 控制 RPC 仅监听本机并启用令牌；
- 对窗口加载 Origin 和导航进行限制。

第一阶段不实现：

- 多窗口共享同一个游戏会话；
- 编辑器和游戏预览的复杂窗口编排；
- 自动更新；
- 桌面插件系统；
- 任意本机文件浏览；
- 操作系统深度集成；
- Hostra 承载游戏业务 RPC；
- Web Client 直接调用 Node.js 游戏逻辑。

## 14. 测试要求

至少应覆盖：

1. Hostra 能启动 Runtime 子进程；
2. Runtime 未就绪时不会提前打开窗口；
3. Runtime 就绪后能够打开本地 Web Client；
4. Web Client 能连接 Runtime 而不是 Hostra 控制 RPC；
5. 无效 Hostra 令牌连接被拒绝；
6. 重复窗口 ID 被拒绝或按既定规则处理；
7. 不可信窗口 URL 被拒绝；
8. 未授权导航被阻止；
9. Runtime 退出时客户端显示明确故障；
10. Hostra 退出时 Runtime 子进程被清理；
11. 普通浏览器仍能运行同一 Web Client；
12. Electron 环境中 `nodeIntegration` 保持关闭。

## 15. 当前 Hostra 基准

本设计基于：

```text
repository: lithdoo/hostra
branch: main
initial commit: 17cdea6de7a097f725428f76e7b93a5e0bc94ac3
```

当前 Hostra 已具备：

- Electron CLI 与本地子进程启动；
- WebSocket JSON-RPC 控制入口；
- `openWindow`、`closeWindow` 和窗口枚举；
- 可选 RPC Token；
- `contextIsolation: true`；
- `nodeIntegration: false`；
- Preload 桥接基础；
- 子进程退出清理基础。

在 LoomRealm 第一阶段接入前，需要补强：

- RPC 显式绑定 `127.0.0.1`；
- 桌面模式强制使用随机令牌；
- 窗口 URL 白名单；
- 导航和新窗口限制；
- 服务就绪协调；
- 参数 Schema 校验；
- 自动化测试。

## 16. 当前架构结论

LoomRealm 桌面客户端采用以下原则：

- Hostra 作为 Electron 桌面宿主；
- LoomRealm Web Client 保持为普通 Web 应用；
- LoomRealm Runtime 持有 FSDB、地图、行走、碰撞和权威状态；
- Hostra 控制 RPC 与 LoomRealm Runtime RPC 完全分离；
- Hostra 可以启动本地 Runtime，但不参与游戏状态同步；
- Web Client 只连接 Runtime 获取游戏状态和图片资源；
- Web Client 不通过 Electron IPC 读取项目或修改权威状态；
- 本地和远程 Runtime 使用相同的状态与事件语义；
- 桌面窗口默认加载本地可信 HTTP Origin；
- Electron 保持上下文隔离并关闭 Node 集成；
- Hostra 控制端口只监听本机并使用随机令牌；
- Hostra 退出时负责清理其启动的 Runtime 子进程。
