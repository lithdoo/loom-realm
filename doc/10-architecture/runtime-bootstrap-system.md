# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：游戏启动后各进程 / Worker 的创建顺序、Subsystem Bootstrap、Control Connection 与 System Data Connection 的建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra 桌面宿主](../20-modules/desktop-host/README.md)、[PWA 宿主](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-02

## 1. 设计目标

本系统定义 LoomRealm 会话启动后，各个运行实体如何被创建、如何确认可用，以及各类长期通信连接如何建立。

核心原则：

> LoomRealm Main 是会话与运行拓扑的编排者；游戏入口一次性声明本次会话全部 Subsystem Descriptor；Main 校验完整 Descriptor 集合后立即启动全部声明 Subsystem；Subsystem 由 Main 启动后主动连接 Main Control Endpoint；Renderer 不自行发现或启动 Subsystem，而是根据 Main 发布的连接授权建立每 System 一条数据连接。

Bootstrap 只决定进程 / Worker 与连接是否存在，不决定业务 Render 生命周期。

## 2. 参与方

桌面 Profile：

```text
LoomRealm Main Process
    会话、Subsystem 启动、Frame Stack、Input Target、连接授权

FSDB Content Service Process
    只读 Content API

Hostra Electron Main Process
    BrowserWindow 与桌面生命周期

Hostra Renderer Process
    LoomRealm Web Renderer

Subsystem Process: <descriptor.key>
    一个声明的业务子系统进程
```

PWA 使用 Main Runtime Worker、System Worker、Window Renderer、Service Worker 映射相同逻辑边界，但当前 `nodejs` Launcher Profile 只覆盖桌面 MVP；PWA 的 Launcher Descriptor 映射尚未冻结。

## 3. 游戏入口与 Subsystem Descriptor

程序主系统读取游戏入口时，除初始调用信息外，还必须一次性得到本次会话全部 Subsystem Descriptor。

MVP 概念结构：

```text
Game Entry
├── initial target
│   └── 引用一个已声明 Subsystem
└── subsystems[]
    ├── key
    ├── launcher
    │   ├── type = nodejs
    │   └── entry
    └── env
```

MVP Descriptor 可以表达为：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: {
    readonly type: "nodejs";
    readonly entry: string;
  };
  readonly env?: Readonly<Record<string, string>>;
}
```

`key` 是 Subsystem Descriptor 的全局唯一、稳定身份，例如：

```text
loom.map
loom.menu
```

MVP 不保留独立 `id` 或 `name`。未来若需要显示名称、本地化标签或描述信息，应作为显示元数据增加，不能改变 `key` 的身份语义。精确字符集、大小写和命名空间格式由后续 Game Package Contract 冻结。

Subsystem Descriptor 描述“这个 Subsystem 如何启动”，不是当前进程实例。

当前 MVP 唯一支持的 Launcher Profile 为：

```text
launcher.type = nodejs
launcher.entry = Node.js Launcher 入口
```

`nodejs` 表示桌面 Main 使用当前 LoomRealm 运行环境选择的 Node.js Runtime 启动该入口。MVP 不预定义其他 Launcher Type。

Main 必须在启动任何业务 Subsystem 前读取并校验完整 Descriptor 集合。至少需要确认：

- Descriptor 结构可解析；
- `key` 不重复；
- 所有 `launcher.type` 都是当前 Runtime 支持的 `nodejs`；
- Descriptor env 不覆盖 LoomRealm 保留环境。

只要任一声明的 Subsystem 使用 unsupported Launcher Type，整个 Game Bootstrap 失败，不能仅将该 Subsystem 标记为 unavailable 后继续启动。

MVP 暂不冻结 `launcher.entry` 的路径基准、包边界和路径安全规则。当前文档只确认该字段存在；具体解析与安全约束在后续 Game Package / Launcher Contract 中另行冻结。

## 4. Main 基础设施启动

会话启动后，LoomRealm Main 首先建立自身基础设施：

```text
loom-realm start <installation>
→ 创建 Session
→ 启动 Main Control Endpoint
→ 启动 Renderer Web Service
→ 启动或取得 Readonly Content Service
→ 读取并校验 Game Manifest / Entry
→ 一次性读取全部 Subsystem Descriptor
→ 校验完整 Descriptor 集合
→ 建立 Subsystem Descriptor Registry
```

Main Control Endpoint 必须先于业务 Subsystem 启动可用，因为该 Endpoint 会通过启动环境传入所有桌面 Subsystem Process。

Renderer Web Service 和 Content Service 的具体进程承载可以变化，但在 Renderer 或 Subsystem 使用相应能力前必须 ready。

MVP 不定义 lazy Subsystem。所有出现在 Game Entry 中的 Descriptor 都是启动必需项；未来如有实际资源需求，可以再增加显式 `lazy` 或等价字段。

## 5. 桌面 Subsystem Bootstrap

MVP 桌面会话启动时，Main 在完整 Descriptor 集合校验通过后立即启动全部声明的 Subsystem Process。

整体流程：

```text
read all descriptors
→ validate descriptor set
→ spawn all declared Subsystems
→ wait for every declared Subsystem to become ready
→ Subsystem Bootstrap complete
```

多个 Subsystem 可以并行 spawn 和初始化，不要求按 Descriptor 顺序串行启动；但 Bootstrap 完成条件仍然是全部已声明 Subsystem ready。

对于一个 Subsystem：

```text
Main
→ 根据 descriptor.launcher 选择 nodejs Launcher
→ 准备启动环境
→ spawn Subsystem Process
→ 等待该 Process 主动连接 Main Control WebSocket
→ 验证连接身份
→ 等待 Subsystem 自身初始化
→ 接收与 descriptor.key 一致的 ready identity
→ 将 Runtime Container 标记为 ready
```

Main 注入的保留环境至少在概念上包含：

```text
Subsystem descriptor key
Main Control Endpoint
```

还可以包含后续协议需要的 Session、授权或诊断字段。精确环境变量名和认证字段由契约层冻结。

Descriptor 中声明的 `env` 作为额外启动参数注入，但不能覆盖 LoomRealm 保留环境。

## 6. Main ⇄ Subsystem Control Connection

桌面 Control Connection 的连接方向固定为：

```text
Subsystem Process
    ── connect ──▶
LoomRealm Main Control WebSocket Server
```

Main 不需要等待子进程先开放随机控制端口再反向连接。

Container 概念状态至少区分：

```text
declared
→ starting
→ connected
→ ready
→ stopping / failed
```

其中：

```text
WebSocket connected ≠ Subsystem ready
```

只有当 Subsystem 完成自身初始化，并通过已建立的 Control Connection 提交与启动 Descriptor `key` 一致的 ready identity 后，Main 才将该 Runtime Container 视为 ready。

连接建立、认证、ready 方法名、ready 字段名、超时和重复连接规则由后续 Main ⇄ Subsystem Bootstrap Protocol 冻结。

MVP 中全部 Descriptor 都是启动必需项。因此只要某个已声明 Subsystem 无法进入 ready，Game Bootstrap 就不能成功完成。

## 7. Renderer Bootstrap

Main 基础 Web 服务可用后，通过 Hostra 的现有窗口 RPC 请求打开 Renderer URL：

```text
LoomRealm Main
→ Hostra openWindow(Renderer URL)
→ Hostra Main 创建 BrowserWindow
→ Renderer 加载 LoomRealm Web 应用
→ Renderer 主动连接 LoomRealm Main Control Connection
```

Hostra 不解释 LoomRealm 的 System、Frame、Render 或 Input Payload，也不作为 Renderer ⇄ Subsystem 数据代理。

Renderer ⇄ Main Control Connection 是 Renderer 会话级长期连接，负责接收：

- Session 和当前 System 状态；
- Frame Stack / Activation / Input Target；
- System Data Connection 建立、替换和撤销信息；
- 会话错误和诊断。

普通 User Input 和 Render Update 不通过 Main 转发。

## 8. Renderer ⇄ Subsystem System Data Connection

当某 Subsystem 已 ready，并允许 Renderer 与其直接交换数据时，Main 发布该 Subsystem 的 System Data Connection Grant / Connection Information。

桌面链路：

```text
Subsystem ready
→ Subsystem Renderer Data Endpoint 可用
→ Main 生成 System Data Connection 授权
→ Main 通过 Renderer Control Connection 发布授权
→ Renderer 主动连接 Subsystem Data WebSocket
→ Connection Layer 完成认证 / 协商
→ System Data Connection ready
```

物理连接粒度固定为一个 Subsystem Runtime Container / System：

```text
Renderer × Subsystem
    最多一条有效 System Data Connection
```

它与 Frame 数量无关。一个 System 可以在零个 Frame 存在时保持 Renderer Data Connection，也可以同时服务多个 Frame Input Context 和多个 Render Context。

现有 v1 契约仍使用 `systemId` 表示这类 System Connection 身份；Descriptor `key` 如何映射到后续正式连接字段由协议迁移阶段冻结，本次不直接改写旧字段 Schema。

## 9. Frame / Input 与 Render 的独立启动链

System Data Connection ready 以后，平台不定义“创建 Frame 就自动创建 Render”的规则。

Frame / Input 链：

```text
Main
→ 建立 Frame 调用 / 输入上下文
→ 分配 frameId
→ Activation
→ Input Target
→ Renderer User Input Protocol
→ Subsystem 对应 Frame Input Handler
```

Render 链完全由 Subsystem 控制：

```text
Subsystem
→ 创建任意 Render Context
→ Render Update Protocol
→ Renderer Render Store
→ DOM / Canvas / WebGL
```

两条链可以在时间上交错：

- Subsystem 可以在没有任何 Frame 时发布 Render；
- Frame 尚未入栈或未成为 Input Target 时，已有 Render 可以继续存在；
- Frame suspend / resume / close 不产生任何隐式 Render 行为；
- 如果某个 Subsystem 希望 Frame 生命周期驱动 Render 生命周期，必须由该 Subsystem 自己显式实现。

## 10. 桌面总体拓扑

```text
                            Hostra Main
                                │
                                │ BrowserWindow
                                ▼
                             Renderer
                         ┌───────┼────────┐
                         │       │        │
                Control WS       │        │ System Data WS / Subsystem
                         │       │        ▼
                         ▼       │   Subsystem Process A
                  LoomRealm Main │        ▲
                         ▲       │        │ Control WS
                         │       │        │
                         └───────┼────────┘
                                 │
                                 └──── System Data WS ──▶ Subsystem Process B

LoomRealm Main / Renderer / Subsystems
            │
            └──── HTTP Fetch ────▶ FSDB Content Service
```

对于多个 Subsystem：

```text
Main
├── Control WS ← subsystem A
├── Control WS ← subsystem B
└── Control WS ← subsystem C

Renderer
├── Data WS ⇄ subsystem A
├── Data WS ⇄ subsystem B
└── Data WS ⇄ subsystem C
```

Main 与每个 Subsystem 的 Control Connection、Renderer 与每个 Subsystem 的 Data Connection 是不同连接和不同职责平面。

## 11. 推荐启动时序

```text
1. LoomRealm Main Process 启动
2. 创建 Session
3. Main Control Endpoint ready
4. Renderer Web Service ready
5. Content Service ready
6. 读取 Game Manifest / Entry
7. 一次性读取全部 Subsystem Descriptor
8. 校验全部 key / launcher / env 公共结构
9. Main 并行或顺序启动全部声明的 Subsystem Process
10. 各 Subsystem 主动连接 Main Control WS
11. 各 Subsystem 完成初始化并提交与 descriptor.key 一致的 ready identity
12. 全部声明 Subsystem ready，Subsystem Bootstrap 完成
13. Main 请求 Hostra 打开 Renderer
14. Renderer 主动连接 Main Control WS
15. Main 发布当前 System / Frame / Input Control State
16. Main 为可连接的 Subsystem 发布 Data Connection Grant
17. Renderer 每 Subsystem 建立一条 Data WebSocket
18. Connection Layer ready
19. Frame / Input 生命周期由 Main 控制
20. Render 生命周期由各 Subsystem 独立控制
```

步骤 9–14 的具体并发顺序可以由实现优化，只要满足依赖约束：Main Control Endpoint 必须先于 Subsystem connect；Renderer 不自行发现 System；MVP Game Bootstrap 只有在全部声明 Subsystem ready 后才成功。

## 12. Renderer 重载

Renderer 重载时，Main 和 Subsystem Process 可以继续运行。

恢复流程按两个独立域进行：

```text
Renderer
→ 重连 Main Control Connection
→ 恢复当前 System Connection 状态
→ 为需要直接通信的 ready System 重建 Data Connection

Main
→ 恢复 Frame Stack / Activation / Input Target

Subsystem
→ 在各自 System Data Connection 恢复后
→ 按 Render Update Protocol 恢复自身 Render State
```

不能再从当前 Frame 集合推导“哪些 Render 必须恢复”，也不能通过 Frame 出栈推导 Render 删除。

## 13. 故障边界

- Descriptor `key` 重复：Game Bootstrap 失败；
- 任一 Descriptor 使用 unsupported Launcher Type：Game Bootstrap 失败；
- Subsystem 在启动期限内未连接 Main：MVP Game Bootstrap 失败；
- Subsystem 已连接但未提交合法 ready identity：MVP Game Bootstrap 失败；
- ready identity 与 Descriptor `key` 不一致：身份 / 协议错误并导致 MVP Game Bootstrap 失败；
- Subsystem Process 在启动期间退出：MVP Game Bootstrap 失败；
- Subsystem Process 在会话运行期间退出：其 Control Connection 和 System Data Connection 失效，Main 更新 System 状态；
- System Data Connection 断开：该 System 的 User Input 暂停；Render 恢复由 Render Update Protocol 负责；
- Renderer 崩溃：不要求结束 Subsystem；恢复时重建 Control / Data Connection；
- Main 崩溃：第一阶段不提供透明会话恢复，宿主应终止其管理的 Subsystem；
- Content Service 故障：新内容请求失败，但不得隐式改变 Frame 或 Render 生命周期。

`launcher.entry` 路径基准和安全规则尚未进入 MVP 冻结范围，不应从当前实现行为推导协议保证。

## 14. 架构不变量

1. Game Entry 一次性声明当前会话全部 Subsystem Descriptor；
2. Descriptor 使用全局唯一、稳定的 `key`，MVP 不保留独立 `id` / `name`；
3. MVP 唯一 Launcher Type 是 `nodejs`；
4. 任一 unsupported Launcher 都使整个 Game Bootstrap 失败；
5. MVP 不定义 lazy Subsystem；Main 在启动阶段立即启动全部声明 Subsystem；
6. Subsystem Bootstrap 只有在全部声明 Subsystem ready 后才完成；
7. Main Control Endpoint 在 Subsystem Process 启动前可用；
8. Subsystem 主动连接 Main，不要求 Main 反向发现子进程控制端口；
9. Control Connection 建立不等于 Subsystem ready；
10. ready identity 必须与启动 Descriptor `key` 一致；
11. Renderer 不启动或自行发现 Subsystem；
12. Renderer 与每个 Subsystem Runtime Container 最多一条有效 System Data Connection；
13. Main Control、Subsystem Control 和 System Data Connection 的职责不可混用；
14. Frame / Input 生命周期与 Render 生命周期完全独立；
15. Main 不拥有 Render Registry，也不从 Frame Stack 推导 Render；
16. Render 的创建、更新、可见性、排序和销毁全部由 Subsystem 控制；
17. `launcher.entry` 的路径与安全规则仍是显式待冻结项。

## 15. 相关文档

- [系统架构总览](./system-overview.md)；
- [运行承载系统](./runtime-hosting-system.md)；
- [通信系统](./communication-system.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [栈式运行系统](./stack-runtime-system.md)；
- [模块子系统模型](./subsystem-model.md)；
- [ADR 0007：Subsystem Descriptor MVP 收敛](../decisions/0007-subsystem-descriptor-mvp.md)。
