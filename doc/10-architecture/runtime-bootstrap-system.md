# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：游戏启动后各进程 / Worker 的创建顺序、Subsystem Bootstrap、Control Connection 与 System Data Connection 的建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra 桌面宿主](../20-modules/desktop-host/README.md)、[PWA 宿主](../20-modules/pwa-host/README.md)  
> 正式契约：[Game Package v2 Bootstrap / Descriptor](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Main ⇄ Subsystem Control v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 最近复核：2026-08-03

## 1. 设计目标

LoomRealm Main 是会话与运行拓扑的编排者。Game Entry 一次性声明本次会话全部 Subsystem Descriptor；Main 校验完整 Descriptor 集合后启动全部声明 Subsystem；Subsystem 主动连接 Main Control Endpoint，并通过 Control Protocol 完成身份绑定与 Runtime 生命周期报告；Renderer 根据 Main 发布的连接授权建立每 Subsystem 一条数据连接。

Bootstrap 只决定 Runtime Container 与连接是否存在、是否可用，不决定 Frame 或 Render 生命周期。

Desktop 启动明确分成两条边界：

```text
链路 1：Main → Subsystem Process
    Descriptor → Launcher Target → Launch Attempt → spawn → Supervisor

链路 2：Subsystem → Main Control
    connect → hello → identified → status → ready
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

## 2. 参与方

桌面 Profile：

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / LoomRealm Web Renderer
Subsystem Process: <descriptor.key>
```

PWA 使用 Main Runtime Worker、Subsystem Worker、Window Renderer、Service Worker 映射相同逻辑边界，但当前 `nodejs` Launcher Profile 只覆盖 Desktop；PWA 的 Launcher Descriptor 映射尚未冻结。

## 3. Game Entry 与 Subsystem Descriptor

Desktop Bootstrap 使用：

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

核心语义：

- `key` 是稳定 Descriptor identity；
- Main 在启动任何业务 Subsystem 前读取并校验完整 Descriptor 集合；
- 当前全部 Descriptor eager / required；
- `launcher.entry` 是 Installation Root 相对的安全 package logical path；
- Entry 禁止 traversal、absolute/URL 与 symlink/junction/reparse escape；
- Descriptor env 不能覆盖 LoomRealm / Node 保留启动字段；
- unsupported Launcher 使 Game Bootstrap 失败。

精确规则由 [Game Package v2 Bootstrap / Descriptor Contract](../15-contracts/game-package-v2.md) 定义。

## 4. Main 基础设施启动

概念顺序：

```text
loom-realm start <installation>
→ 创建 Session
→ Main Control Endpoint ready
→ Renderer Web Service ready
→ Content Service ready
→ 读取并校验 Game Manifest / Entry
→ 一次性读取全部 Subsystem Descriptor
→ 校验完整 Descriptor 集合
→ 建立 Subsystem Descriptor Registry
→ 解析各 required Launcher Target
→ 为每个 Descriptor 创建 Launch Attempt
```

Main Control Endpoint MUST 先于业务 Subsystem Runtime 启动可用。

Descriptor 集合级错误必须在任何业务 Process spawn 前失败，避免部分启动副作用。

## 5. Desktop Subsystem Bootstrap

完整 Descriptor 集合校验通过后，Main 启动全部声明的 Subsystem Process。多个 Subsystem 可以并行启动，但 Bootstrap 完成条件是全部声明项进入 `ready`。

单个 Subsystem：

```text
Main
→ 选择 Node.js Launcher
→ 使用已验证 ResolvedLauncherTarget
→ 创建 Launch Attempt
→ 生成 Bootstrap Token
→ 在 Main Control authentication state 注册 Token + key
→ 显式构造 child environment / Bootstrap Context
→ 使用 Host-selected Node.js，shell=false，spawn Subsystem Process
→ 安装 Runtime Supervisor Record
→ 链路 1 完成，公共状态仍为 starting
→ 等待 Subsystem 主动连接 Main Control Endpoint
→ Control Transport connected
→ subsystem.hello
→ 验证 descriptor.key / Bootstrap Token / Protocol Version
→ Control Connection 永久绑定 descriptor.key
→ Main observed state = identified
→ Subsystem 可报告 initializing
→ Subsystem 完成内部初始化
→ subsystem.status(state="ready", ...)
→ Main observed state = ready
```

Launcher 的 Entry、环境、spawn、Supervisor 与退出语义由 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md) 定义；hello/status wire schema 由 [Main ⇄ Subsystem Control v1](../15-contracts/subsystem-control-lifecycle-protocol.md) 定义。

## 6. Desktop 启动上下文

Desktop v1 通过保留环境变量：

```text
LOOMREALM_BOOTSTRAP_CONTEXT
```

传递 Base64URL 编码的 UTF-8 JSON：

```ts
interface LoomRealmBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

Descriptor `env` 作为额外启动环境注入，但不能覆盖 `LOOMREALM_*`、`NODE_OPTIONS`、`NODE_PATH`。

Child environment 由 Host Safe Baseline + validated descriptor env + LoomRealm reserved environment 显式构造，不默认继承 Main 完整 ambient environment。

Bootstrap Context 只提供开始链路 2 所需的信息，不完成 identity binding；身份仍由 `subsystem.hello` 绑定。

## 7. Launcher / Supervisor 与 Runtime 状态

Main-observed Runtime Container 状态：

```text
declared
→ starting
→ connected
→ identified
→ ready
→ stopping
→ stopped

任意允许阶段
→ failed
```

Launcher 内部可以维护 `prepared / spawning / supervised / exited / failed`，但 MUST NOT 将这些状态提升为第二套公共 Runtime lifecycle。

关键边界：

- Launcher invoked 后 Runtime 进入 `starting`；
- Process spawn 成功并纳入 Supervisor 后仍为 `starting`；
- `connected` 只来自 Control Transport accepted；
- `identified` 只来自合法 `subsystem.hello`；
- `ready` 只来自合法 `subsystem.status(state="ready")`；
- `stopped` 只来自 Supervisor 对实际 Process exit 的观察。

PID、Process Handle、Launch Attempt ID 均不是协议身份。

## 8. Process Failure 与 Restart

Desktop v1 不自动 restart failed Subsystem。

以下 Process exit 属于 Bootstrap failure：

```text
spawn 后、connect 前退出
connected 后、hello 前退出
identified 后、ready 前退出
```

Runtime `ready` 后，如果 Main 没有开始 termination，则任何 Process exit 都是 unexpected runtime termination；即使 exit code 为 0 也不能自动视为正常。

未来 restart 必须显式定义 Runtime generation、Frame recovery、Render recovery 与 Data Connection replacement，不能作为 Supervisor 的隐式优化加入 v1。

## 9. Renderer Bootstrap

Main 通过 Hostra 请求打开 Renderer URL：

```text
LoomRealm Main
→ Hostra openWindow(Renderer URL)
→ Hostra Main 创建 BrowserWindow
→ Renderer 加载 LoomRealm Web 应用
→ Renderer 主动连接 LoomRealm Main Control Connection
```

Hostra 不解释 LoomRealm 的 Subsystem、Frame、Render 或 Input Payload，也不代理 Renderer ⇄ Subsystem 数据面。

Renderer ⇄ Main Control Connection 负责：

- Session 与当前 Subsystem 状态；
- Frame Stack / Activation / Input Target；
- System Data Connection Grant / replace / revoke；
- 会话错误和诊断。

普通 User Input 和 Render Update 不通过 Main 转发。

## 10. Renderer ⇄ Subsystem System Data Connection

当某 Subsystem 已 ready，并允许 Renderer 与其直接通信时，Main 发布 System Data Connection Grant / Connection Information。

桌面链路：

```text
Subsystem status = ready
→ Renderer Data Endpoint 已由 Runtime Lifecycle Protocol 报告并被 Main 接受
→ Main 生成 System Data Connection Grant
→ Main 通过 Renderer Control Connection 发布授权
→ Renderer 主动连接 Subsystem Data WebSocket
→ Connection Layer 完成认证 / 协商
→ System Data Connection ready
```

物理连接粒度固定为一个 Runtime Container / Subsystem：

```text
Renderer × Subsystem
    最多一条有效 System Data Connection
```

该连接与 Frame 数量无关。Subsystem 可以在零 Frame 时保持 Renderer Data Connection，也可以同时服务多个 Frame Input Context 和多个 Render Context。

## 11. Frame/Input 与 Render 独立

Frame / Input：

```text
Main
→ 建立 Frame 调用 / 输入上下文
→ 分配 frameId
→ Activation
→ Input Target
→ Renderer User Input Protocol
→ Subsystem Frame Input Handler
```

Render：

```text
Subsystem
→ 创建任意 Render Context
→ Render Update Protocol
→ Renderer Render Store
→ DOM / Canvas / WebGL
```

平台不定义任何隐式关系：

- 创建 Frame 不自动创建 Render；
- Frame 不在栈顶不意味着 Render 不显示；
- Frame suspend / resume / close 不产生隐式 Render 行为；
- Subsystem 可以在没有 Frame 时发布 Render。

## 12. 推荐启动时序

```text
1. LoomRealm Main Process 启动
2. 创建 Session
3. Main Control Endpoint ready
4. Renderer Web Service ready
5. Content Service ready
6. 读取 Game Manifest / Entry
7. 一次性读取全部 Subsystem Descriptor
8. 校验完整 Descriptor 集合
9. 安全解析全部 required Launcher Target
10. 为每个 Descriptor 创建 Launch Attempt / Bootstrap Token
11. 在 Control authentication state 注册各 Token
12. 启动全部声明 Subsystem Process 并纳入 Supervisor
13. 各 Subsystem 主动连接 Main Control Endpoint
14. 各连接通过 subsystem.hello 进入 identified
15. 各 Subsystem 完成初始化并通过 subsystem.status 进入 ready
16. 全部声明 Subsystem ready，Subsystem Bootstrap 完成
17. Main 请求 Hostra 打开 Renderer
18. Renderer 主动连接 Main Control Connection
19. Main 发布当前 Subsystem / Frame / Input Control State
20. Main 为可连接 Subsystem 发布 System Data Grant
21. Renderer 每 Subsystem 建立一条 Data Connection
22. Connection Layer ready
23. Frame/Input 生命周期由 Main 控制
24. Render 生命周期由各 Subsystem 独立控制
```

Process 启动 MAY 并行，但不能破坏以下依赖：

```text
Main Control Endpoint ready
→ Bootstrap Token registered
→ Process spawn
```

Renderer 不自行发现或启动 Subsystem。

## 13. Renderer 重载

Renderer 重载时 Main 与 Subsystem Runtime 可以继续运行。

恢复按独立域进行：

```text
Renderer
→ 重连 Main Control Connection
→ 恢复 ready Subsystem / Connection Grant 状态
→ 重建需要的 System Data Connection

Main
→ 恢复 Frame Stack / Activation / Input Target

Subsystem / Render Protocol
→ 在 Data Connection 恢复后独立恢复 Render State
```

不得从当前 Frame 集合推导“哪些 Subsystem Connection 或 Render 必须恢复”。

## 14. Trust Boundary

Desktop `nodejs` Launcher 的 Entry 路径安全与 Node Process 的 OS 权限必须分开理解。

```text
safe launcher.entry
    保证 Main 只执行 Installation 内已声明、已验证的 Entry

Node.js Process sandbox
    v1 不提供
```

因此 Desktop v1 将 Subsystem executable JavaScript 视为 trusted executable code。

普通游戏内容和协议输入仍必须按不可信数据校验；Content API 不提供任意物理路径能力，但这不等于普通 Node Process 在 OS 层没有 `fs` / network / child_process 等能力。

## 15. 故障边界

- Descriptor / Entry / env 不合法：Game Bootstrap 失败，且集合级校验失败时不得产生业务 Process side effect；
- unsupported Launcher：Game Bootstrap 失败；
- Process spawn 失败：Game Bootstrap 失败；
- Runtime 未在期限内连接 Main：Game Bootstrap 失败；
- `subsystem.hello` 身份、Credential 或版本校验失败：fatal Bootstrap / Protocol Error；
- Runtime 已 identified 但无法进入 ready：Game Bootstrap 失败；
- Runtime 在启动期间退出：Game Bootstrap 失败；
- Runtime 在会话运行期间 unexpected exit：Runtime failure，不自动 restart；
- System Data Connection 断开：该 Subsystem 的普通 User Input 暂停，Render 按 Render Protocol 恢复；
- Renderer 崩溃：不要求结束 Subsystem；
- Main 崩溃：第一阶段不提供透明会话恢复，宿主终止其管理的 Subsystem；
- Content Service 故障：内容请求失败，但不隐式改变 Frame 或 Render 生命周期。

## 16. 架构不变量

1. Game Entry 一次性声明当前会话全部 Subsystem Descriptor；
2. Descriptor 使用稳定 `key`；
3. Desktop v1 唯一 Launcher Type 是 `nodejs`；
4. 当前不定义 lazy Subsystem；
5. 全部声明 Subsystem ready 后 Bootstrap 才完成；
6. `launcher.entry` 是 Installation-relative、安全解析的 package path；
7. Node executable 由 LoomRealm Host 选择，Launcher 不使用 Shell；
8. Bootstrap authentication state 在 Process spawn 前存在；
9. Child environment 显式构造，不无条件继承 Main 完整环境；
10. Main Control Endpoint 在 Subsystem Runtime 启动前可用；
11. Subsystem 主动连接 Main；
12. `spawn success ≠ connected ≠ identified ≠ ready`；
13. Identity 由 `subsystem.hello` 绑定到 Control Connection；
14. Supervisor 对实际 Process exit 有最终观察权；
15. Desktop v1 不自动 restart；
16. Renderer 不启动或自行发现 Subsystem；
17. Renderer 与每个 Runtime Container 最多一条有效 System Data Connection；
18. Frame/Input 与 Render 生命周期独立；
19. Entry 路径安全不等于 Node Process sandbox。
