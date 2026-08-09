# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：游戏启动后各进程 / Worker 的创建顺序、Subsystem Bootstrap、Control Connection 与 Renderer⇄Subsystem Data Connection 的建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra 桌面宿主](../20-modules/desktop-host/README.md)、[PWA 宿主](../20-modules/pwa-host/README.md)  
> 正式契约：[Game Package v2](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control v2](../15-contracts/subsystem-control-protocol-v2.md)、[Runtime Control Profile v2](../15-contracts/runtime-control-profile-v2.md)  
> 最近复核：2026-08-09

## 1. 设计目标

LoomRealm Main 是会话与运行拓扑的编排者。Game Entry 一次性声明本次会话全部 Subsystem Descriptor；Main 校验完整 Descriptor 集合后启动全部 required Subsystem；Subsystem 主动连接 Main Control Endpoint，并通过 **Subsystem Control v2** 完成身份绑定与 Runtime lifecycle报告。

Renderer 与 Subsystem 的 Data carrier不由 `subsystem.status(ready)` 发布。Main通过 Renderer Control发布逻辑 `DataAuthority`，Host/Platform Binding再建立具体 WebSocket/MessagePort carrier。

Bootstrap 只决定 Runtime Container 与连接 authority/lifecycle，不决定 Frame 或 Render 生命周期。

Desktop 启动明确分成独立链路：

```text
链路 1：Main → Subsystem Process
    Descriptor → Launcher Target → Launch Attempt → spawn → Supervisor

链路 2：Subsystem → Main Control
    connect → subsystem.hello(v2) → identified → status → ready

链路 3：Main → Renderer Control
    DataAuthority{subsystemKey,generation,connectionProfile}

链路 4：Host/Platform → Renderer⇄Subsystem Data
    establish carrier bound to current Session/Renderer/subsystem/generation
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
ready ≠ Data Connection established
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

PWA 使用 Main Runtime Worker、Subsystem Worker、Window Renderer、Service Worker映射相同逻辑边界。Control v2 lifecycle可以绑定 authenticated MessagePort；当前 `nodejs` Launcher Profile只覆盖 Desktop。

## 3. Game Entry 与 Subsystem Descriptor

Desktop Bootstrap使用：

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
- `launcher.entry` 是 Installation Root相对的安全 package logical path；
- Entry禁止 traversal、absolute/URL 与 symlink/junction/reparse escape；
- Descriptor env不能覆盖 LoomRealm / Node保留启动字段；
- unsupported Launcher使 Game Bootstrap失败。

精确规则由 [Game Package v2](../15-contracts/game-package-v2.md)定义。

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
→ 为每个 Descriptor创建 Launch Attempt
```

Main Control Endpoint MUST先于业务 Subsystem Runtime启动可用。

Descriptor集合级错误必须在任何业务 Process spawn前失败，避免部分启动副作用。

## 5. Desktop Subsystem Bootstrap

完整 Descriptor集合校验通过后，Main启动全部声明的 Subsystem Process。多个 Subsystem可以并行启动，但 Bootstrap完成条件是全部 required Subsystem进入 `ready`。

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
→ 等待 Subsystem主动连接 Main Control Endpoint
→ Control Transport connected
→ subsystem.hello { protocolVersions:[2] }
→ 验证 descriptor.key / Bootstrap Token / Control version 2
→ Control Connection永久绑定 descriptor.key
→ Main observed state = identified
→ Subsystem可报告 initializing
→ Subsystem完成 required initialization
→ subsystem.status({state:"ready"})
→ Main observed state = ready
```

Launcher的 Entry、环境、spawn、Supervisor与退出语义由 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)定义；Control wire由 [Subsystem Control v2](../15-contracts/subsystem-control-protocol-v2.md)定义；Frame应用语义由 [Runtime Control Profile v2](../15-contracts/runtime-control-profile-v2.md)静态组合。

### 5.1 `ready` 边界

当前 `ready` 不携带 Data endpoint：

```json
{"state":"ready"}
```

它只证明 Runtime可以承担 enclosing Runtime Profile角色。

不得从 `ready` 推导：

```text
Renderer Data endpoint known
Renderer connected
DataAuthority exists
Data carrier exists
Frame exists
Render Domain exists
InputTarget exists
```

## 6. Desktop 启动上下文

Desktop Launcher Profile v1通过保留环境变量：

```text
LOOMREALM_BOOTSTRAP_CONTEXT
```

传递 Base64URL编码的 UTF-8 JSON：

```ts
interface LoomRealmBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

这里的 `version:1` 是 **Desktop Launcher Bootstrap Context版本**，不是 Subsystem Control protocol version。

Bootstrap Context MUST NOT携带：

```text
Renderer Data Endpoint
DataAuthority generation
Data ticket
MessagePort
Frame/Activation/Render identity
```

Descriptor `env`作为额外启动环境注入，但不能覆盖 `LOOMREALM_*`、`NODE_OPTIONS`、`NODE_PATH`。

Child environment由 Host Safe Baseline + validated descriptor env + LoomRealm reserved environment显式构造，不默认继承 Main完整 ambient environment。

Bootstrap Context只提供发起 Control Bootstrap所需信息；身份仍由 `subsystem.hello`绑定。

## 7. Launcher / Supervisor 与 Runtime 状态

Main-observed Runtime Container状态：

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

Launcher内部可以维护 `prepared / spawning / supervised / exited / failed`，但 MUST NOT将这些状态提升为第二套公共 Runtime lifecycle。

关键边界：

- Launcher invoked后 Runtime进入 `starting`；
- Process spawn成功并纳入 Supervisor后仍为 `starting`；
- `connected`只来自 Control carrier被Main接受；
- `identified`只来自合法 Control v2 `subsystem.hello`；
- `ready`只来自合法 `subsystem.status({state:"ready"})`；
- `stopped`只来自 Supervisor对实际 Process exit的观察。

PID、Process Handle、Launch Attempt ID均不是协议身份。

## 8. Process Failure 与 Restart

Desktop Node.js Launcher v1不自动 restart failed Subsystem。

以下 Process exit属于 Bootstrap failure：

```text
spawn后、connect前退出
connected后、hello前退出
identified后、ready前退出
```

Runtime `ready`后，如果 Main没有开始 termination，则任何 Process exit都是 unexpected runtime termination；即使 exit code为0也不能自动视为正常。

未来 restart必须显式定义新的 Launch Attempt / bootstrap credential，以及 Frame/Data/Render recovery policy，不能作为 Supervisor隐式优化。

## 9. Renderer Bootstrap

Main通过 Hostra请求打开 Renderer URL：

```text
LoomRealm Main
→ Hostra openWindow(Renderer URL)
→ Hostra Main创建 BrowserWindow
→ Renderer加载 LoomRealm Web应用
→ Renderer建立 Main ⇄ Renderer Control Connection
→ renderer.hello
→ initial full Authority Snapshot
```

Renderer Control负责复制 Main committed authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority{subsystemKey,generation,connectionProfile}
```

它不携带 Data WebSocket URL、MessagePort或 bearer ticket。

普通 User Input和 Render Update不通过 Main转发。

## 10. Renderer ⇄ Subsystem Data Connection

当 Main允许 current Renderer与某 Subsystem建立 Data carrier时，Renderer Control发布逻辑：

```ts
DataAuthority {
  subsystemKey,
  generation,
  connectionProfile
}
```

随后由 Host/Platform Binding建立实际 carrier：

### Desktop

```text
Main commits DataAuthority(S,G)
→ Renderer receives current Authority Snapshot
→ Desktop Host/Transport Binding obtains/creates endpoint + authentication material
→ establish carrier bound to Session/current Renderer/S/G
→ install at most one current Data Connection
```

### PWA

```text
Main commits DataAuthority(S,G)
→ PWA Host creates/transfers authenticated MessagePort carrier
→ bind to Session/current Renderer/S/G
→ install at most one current Data Connection
```

具体 endpoint、ticket、MessagePort creation/transfer都不属于 Subsystem Control v2。

物理连接粒度：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

同 generation仍被授权时，carrier丢失后可以建立 fresh carrier；generation不是 reconnect counter。

## 11. Frame/Input 与 Render 独立

Frame / Input：

```text
Main
→ 建立 Frame调用 / 输入上下文
→ frameId / Activation
→ InputTarget
→ Renderer User Input
→ Subsystem
```

Render：

```text
Subsystem
→ Render Domain Registry / State
→ Render Update
→ Renderer Render Store
→ Components / DOM / Canvas / WebGL
```

平台不定义任何隐式关系：

- 创建 Frame不自动创建 Render Domain；
- Frame不在栈顶不意味着 Render不显示；
- Frame suspend/resume/close不产生隐式 Render行为；
- Subsystem可以在没有 Frame时发布 Render；
- Runtime `ready`不表示任何 Frame/Render存在。

## 12. 推荐启动时序

```text
1. LoomRealm Main启动并创建 Session
2. Main Control Endpoint ready
3. Renderer Web Service / Content Service ready
4. 读取并验证 Game Package / complete Subsystem Descriptor set
5. 为每个 Descriptor安全解析 Launcher Target
6. 创建 Launch Attempt + Control v2 bootstrapToken
7. token注册到 Main authentication state
8. 启动全部 required Subsystem并纳入 Supervisor
9. Subsystem建立 Control carrier
10. subsystem.hello选择 Control version 2
11. Runtime identified
12. Runtime完成初始化并 status(ready)
13. 全部 required Runtime ready → Subsystem Bootstrap完成
14. Main/Host启动 Renderer
15. Renderer建立 Main Control并取得 current full Authority Snapshot
16. Main按 policy发布各 Subsystem DataAuthority
17. Host/Platform Binding为 current generations建立 Data carriers
18. User Input / Render Update在 current Data Connection上独立恢复
19. Frame lifecycle由 Main / Frame v1控制
20. Render lifecycle由各 Subsystem独立控制
```

Process启动 MAY并行，但不能破坏：

```text
Main Control Endpoint ready
→ Bootstrap Token registered
→ Process spawn
```

Renderer不自行启动 Subsystem，也不从 Runtime `ready`自行发现 Data endpoint。

## 13. Renderer 重载

Renderer重载时 Main与Subsystem Runtime可以继续运行。

恢复：

```text
Renderer Control lost
→ old Renderer Data Connections retired
→ fresh Renderer Control token/connection
→ renderer.hello + current full Authority Snapshot
→ fresh Host/Platform Data carriers for current DataAuthority generations
→ User Input从 empty Interest + fresh State恢复
→ Render Update从 Registry + fresh Snapshots恢复
```

不得从当前 Frame集合推导“哪些 Data Connection或Render必须恢复”。

## 14. Trust Boundary

Desktop `nodejs` Launcher的 Entry路径安全与 Node Process的 OS权限必须分开理解。

```text
safe launcher.entry
    Main只执行 Installation内已声明、已验证 Entry

Node.js Process sandbox
    当前 Profile不提供
```

因此 Desktop Node.js Subsystem executable JavaScript属于 trusted executable code。

普通游戏内容和协议输入仍必须按不可信数据校验。

## 15. 故障边界

- Descriptor / Entry / env不合法：Game Bootstrap失败；
- unsupported Launcher / spawn失败：Game Bootstrap失败；
- Runtime未在期限内连接/hello/ready：Game Bootstrap失败；
- Control v2 authentication/version/protocol error：Runtime/Bootstrap failure；
- Runtime会话期间 unexpected Control loss/exit：Runtime failure，不自动 restart；
- Data Connection断开：Data carrier retired；**不自动等于 Runtime failure或 Frame unwind**；
- same-generation仍授权时 MAY建立 fresh Data carrier；
- Renderer Control loss：撤销 Renderer ordinary input/DataAuthority usage并 retire Data carriers；
- Renderer崩溃：不要求结束 Subsystem；
- Main崩溃：第一阶段不提供透明 Session恢复；
- Content Service故障：内容请求失败，但不隐式改变 Frame/Render lifecycle。

## 16. 架构不变量

1. Game Entry一次性声明当前会话全部 required Subsystem Descriptor；
2. Descriptor使用稳定 `key`；
3. Desktop当前 Launcher Type=`nodejs`；
4. 全部 required Subsystem ready后 Bootstrap才完成；
5. Main Control Endpoint在 Runtime启动前可用；
6. Control bootstrap authentication state在 Process执行前存在；
7. Subsystem主动建立 Control carrier；
8. 当前 Control protocol只有 v2；v1已实现前废弃；
9. `spawn success ≠ connected ≠ identified ≠ ready`；
10. `ready ≠ Data Connection established`；
11. Identity由 Control v2 `subsystem.hello`绑定；
12. `ready`不携 Renderer Data endpoint；
13. Supervisor对实际 Runtime exit有最终观察权；
14. Desktop Launcher不自动 restart；
15. Renderer Control只发布逻辑 DataAuthority，不携 transport bootstrap secret；
16. Host/Platform Binding负责实际 Data carrier establishment；
17. 每 Subsystem对 current Renderer最多一条 current Data Connection；
18. Data loss不等于 Runtime failure/Frame unwind；
19. Frame/Input、Render、Data lifecycle互相独立；
20. Entry路径安全不等于 Node Process sandbox。
