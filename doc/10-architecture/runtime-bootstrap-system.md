# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：游戏启动后各进程 / Worker 的创建顺序、Subsystem Bootstrap、Control Connection 与 System Data Connection 的建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra 桌面宿主](../20-modules/desktop-host/README.md)、[PWA 宿主](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-02

## 1. 设计目标

LoomRealm Main 是会话与运行拓扑的编排者。Game Entry 一次性声明本次会话全部 Subsystem Descriptor；Main 校验完整 Descriptor 集合后启动全部声明 Subsystem；Subsystem 主动连接 Main Control Endpoint，并通过 Control Protocol 完成身份绑定与 Runtime 生命周期报告；Renderer 根据 Main 发布的连接授权建立每 Subsystem 一条数据连接。

Bootstrap 只决定 Runtime Container 与连接是否存在、是否可用，不决定 Frame 或 Render 生命周期。

## 2. 参与方

桌面 Profile：

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / LoomRealm Web Renderer
Subsystem Process: <descriptor.key>
```

PWA 使用 Main Runtime Worker、System Worker、Window Renderer、Service Worker 映射相同逻辑边界，但当前 `nodejs` Launcher Profile 只覆盖桌面 MVP；PWA 的 Launcher Descriptor 映射尚未冻结。

## 3. Game Entry 与 Subsystem Descriptor

MVP 概念结构：

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

`key` 是稳定 Descriptor identity。MVP 不保留独立 `id` 或 `name`。

当前 Desktop MVP 只支持：

```text
launcher.type = nodejs
```

Main 在启动任何业务 Subsystem 前读取并校验完整 Descriptor 集合，至少确认：

- Descriptor 结构可解析；
- `key` 不重复；
- 所有 `launcher.type` 都受当前 Runtime 支持；
- Descriptor env 不覆盖 LoomRealm 保留环境。

任一 unsupported Launcher 都使 Game Bootstrap 失败。MVP 不定义 `lazy` 字段。

`launcher.entry` 的路径基准、安装根边界和路径安全规则尚未冻结；本文不能把某个当前实现算法提升为稳定契约。

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
→ 为每个 Descriptor 创建 Launch Attempt
```

Main Control Endpoint 必须先于业务 Subsystem Runtime 启动可用。

## 5. Desktop Subsystem Bootstrap

完整 Descriptor 集合校验通过后，Main 启动全部声明的 Subsystem Process。多个 Subsystem 可以并行启动，但 Bootstrap 完成条件是全部声明项进入 ready。

单个 Subsystem 的架构流程：

```text
Main
→ 根据 descriptor.launcher 选择 Node.js Launcher
→ 创建 Launch Attempt 与 Bootstrap Credential
→ 准备保留启动上下文 + descriptor env
→ spawn Subsystem Process
→ 等待 Subsystem 主动连接 Main Control Endpoint
→ Control Transport connected
→ subsystem.hello
→ 验证 descriptor.key / Bootstrap Credential / Protocol Version
→ Control Connection 永久绑定 descriptor.key
→ Main observed state = identified
→ Subsystem 可报告 initializing
→ Subsystem 完成内部初始化
→ subsystem.status(state="ready", ...)
→ Main observed state = ready
```

因此：

```text
connected ≠ identified ≠ ready
```

`ready` 不重新声明 Subsystem identity；身份已经由成功的 `subsystem.hello` 绑定到 Control Connection。

精确 hello/status wire schema、Bootstrap Token 语义与状态转换由 [Main ⇄ Subsystem 控制与运行时生命周期协议 v1](../15-contracts/subsystem-control-lifecycle-protocol.md) 定义。

## 6. 启动上下文

Main 启动 Runtime 时在概念上必须提供：

```text
Subsystem Descriptor Key
Main Control Endpoint
Bootstrap Credential
```

还可以提供 Session、诊断或后续协议需要的保留字段。Descriptor `env` 作为额外启动参数注入，但不能覆盖 LoomRealm 保留字段。

精确环境变量名不由架构层冻结。

## 7. Runtime Container 状态

Main-observed 概念状态与 Runtime-reported Status 必须区分。

Main-observed 状态至少包括：

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

Runtime 自报告状态由 Control Protocol v1 定义为：

```text
initializing
ready
stopping
failed
```

`stopped` 是 Main / Supervisor 对 Runtime 实际退出的观察结果，不由 Subsystem 自报告。

## 8. Renderer Bootstrap

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

## 9. Renderer ⇄ Subsystem System Data Connection

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

该连接与 Frame 数量无关。Subsystem 可以在零个 Frame 存在时保持 Renderer Data Connection，也可以同时服务多个 Frame Input Context 和多个 Render Context。

现有部分 v1 数据契约仍使用 `systemId`；它与 Descriptor `key` 的最终映射由后续对应契约版本冻结。

## 10. Frame/Input 与 Render 独立

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
- Subsystem 可以在没有 Frame 时发布 Render；
- 如果业务希望 Frame 生命周期影响 Render，必须由 Subsystem 自己显式实现。

## 11. 推荐启动时序

```text
1. LoomRealm Main Process 启动
2. 创建 Session
3. Main Control Endpoint ready
4. Renderer Web Service ready
5. Content Service ready
6. 读取 Game Manifest / Entry
7. 一次性读取全部 Subsystem Descriptor
8. 校验完整 Descriptor 集合
9. 为每个 Descriptor 创建 Launch Attempt / Bootstrap Credential
10. 启动全部声明 Subsystem Process
11. 各 Subsystem 主动连接 Main Control Endpoint
12. 各连接通过 subsystem.hello 进入 identified
13. 各 Subsystem 完成初始化并通过 subsystem.status 进入 ready
14. 全部声明 Subsystem ready，Subsystem Bootstrap 完成
15. Main 请求 Hostra 打开 Renderer
16. Renderer 主动连接 Main Control Connection
17. Main 发布当前 Subsystem / Frame / Input Control State
18. Main 为可连接 Subsystem 发布 System Data Grant
19. Renderer 每 Subsystem 建立一条 Data Connection
20. Connection Layer ready
21. Frame/Input 生命周期由 Main 控制
22. Render 生命周期由各 Subsystem 独立控制
```

步骤 10–16 可以并发优化，只要不破坏依赖：Control Endpoint 必须先于 Subsystem connect；Renderer 不自行发现 Subsystem；MVP Game Bootstrap 只有在全部声明 Subsystem ready 后才成功。

## 12. Renderer 重载

Renderer 重载时 Main 与 Subsystem Runtime 可以继续运行。

恢复按独立域进行：

```text
Renderer
→ 重连 Main Control Connection
→ 恢复当前 ready Subsystem / Connection Grant 状态
→ 重建需要的 System Data Connection

Main
→ 恢复 Frame Stack / Activation / Input Target

Subsystem / Render Protocol
→ 在 Data Connection 恢复后
→ 独立恢复自身 Render State
```

不得从当前 Frame 集合推导“哪些 Subsystem Connection 或 Render 必须恢复”。

## 13. 故障边界

- Descriptor `key` 重复：Game Bootstrap 失败；
- unsupported Launcher：Game Bootstrap 失败；
- Runtime 未在期限内连接 Main：Game Bootstrap 失败；
- `subsystem.hello` 身份、Credential 或版本校验失败：fatal Bootstrap / Protocol Error；
- Runtime 已 identified 但无法进入 ready：Game Bootstrap 失败；
- Runtime 在启动期间退出：Game Bootstrap 失败；
- Runtime 在会话运行期间退出：Main 标记 stopped/failed，Control 与 Data Connection 失效；
- System Data Connection 断开：该 Subsystem 的普通 User Input 暂停，Render 按 Render Protocol 恢复；
- Renderer 崩溃：不要求结束 Subsystem；
- Main 崩溃：第一阶段不提供透明会话恢复，宿主终止其管理的 Subsystem；
- Content Service 故障：内容请求失败，但不隐式改变 Frame 或 Render 生命周期。

## 14. 架构不变量

1. Game Entry 一次性声明当前会话全部 Subsystem Descriptor；
2. Descriptor 使用稳定 `key`，MVP 不保留独立 `id` / `name`；
3. Desktop MVP 唯一 Launcher Type 是 `nodejs`；
4. MVP 不定义 lazy Subsystem；
5. 全部声明 Subsystem ready 后 Bootstrap 才完成；
6. Main Control Endpoint 在 Subsystem Runtime 启动前可用；
7. Subsystem 主动连接 Main；
8. `connected ≠ identified ≠ ready`；
9. Identity 由 `subsystem.hello` 绑定到 Control Connection，后续 status 不重复声明 key；
10. Renderer 不启动或自行发现 Subsystem；
11. Renderer 与每个 Runtime Container 最多一条有效 System Data Connection；
12. Frame/Input 与 Render 生命周期独立；
13. `launcher.entry` 路径与安全规则仍是显式待冻结项。