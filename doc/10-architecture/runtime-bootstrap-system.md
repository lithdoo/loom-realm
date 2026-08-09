# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：游戏启动后 Runtime/Renderer 的创建顺序、Subsystem Bootstrap、Control Connection 与 Renderer⇄Subsystem Data Connection 的建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Desktop Host](../20-modules/desktop-host/README.md)、[PWA Host](../20-modules/pwa-host/README.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)  
> 最近复核：2026-08-09

## 1. 设计目标

LoomRealm Main 是会话与运行拓扑的编排者。Game Entry 一次性声明本次会话全部 required Subsystem Descriptor；Main 校验完整集合后启动 Runtime；Subsystem 主动建立 Main Control carrier，并通过 **Subsystem Control v1** 完成身份绑定与 Runtime lifecycle 报告。

Renderer⇄Subsystem Data carrier 不由 `subsystem.status(ready)` 发布。Main 通过 Renderer Control 发布逻辑 `DataAuthority`，Host/Platform Binding 再建立具体 WebSocket / MessagePort carrier。

Bootstrap 只决定 Runtime Container 与连接 authority/lifecycle，不决定 Frame 或 Render lifecycle。

## 2. 四条独立链路

```text
链路 1：Main → Subsystem Runtime
    Descriptor → Launcher Target → Launch Attempt → spawn → Supervisor

链路 2：Subsystem → Main Control
    connect → subsystem.hello(v1) → identified → status → ready

链路 3：Main → Renderer Control
    committed Authority Snapshot
    including DataAuthority{subsystemKey,generation,connectionProfile}

链路 4：Host/Platform → Renderer⇄Subsystem Data
    establish carrier bound to current Session/Renderer/subsystem/generation
```

因此：

```text
spawn success != connected != identified != ready
ready != Data Connection established
```

## 3. Game Entry / Descriptor

Desktop Bootstrap 使用 [Game Package v1](../15-contracts/game-package-v1.md)：

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

核心：

- `key` 是稳定 Runtime identity；
- Main 在任何业务 Runtime spawn 前校验完整 Descriptor 集合；
- 当前全部 Descriptor eager / required；
- `launcher.entry` 是 Installation Root 相对、安全的 package logical path；
- Entry 禁止 traversal、absolute/URL 与 symlink/junction/reparse escape；
- Descriptor env 不能覆盖 LoomRealm / Node 保留启动字段；
- unsupported Launcher 使 Game Bootstrap 失败。

## 4. Main 基础设施启动

```text
loom-realm start <installation>
→ create Session
→ Main Control Endpoint ready
→ Renderer Web Service ready
→ Content Service ready
→ read/validate Game Package
→ validate complete Descriptor set
→ install Descriptor Registry
→ resolve required Launcher Targets
→ create Launch Attempts
```

Main Control Endpoint MUST 在业务 Runtime 开始执行前可用。

Descriptor 集合级错误 MUST 在任何业务 Process/Worker side effect 前失败。

## 5. Desktop Subsystem Bootstrap

多个 required Subsystem MAY 并行启动，但 Bootstrap 完成条件是全部进入 `ready`。

单个 Runtime：

```text
Main
→ choose Desktop Node.js Launcher v1
→ resolve validated Launcher Target
→ create Launch Attempt
→ generate bootstrapToken
→ register token + descriptor.key in Main auth state
→ construct Bootstrap Context / child environment
→ spawn Host-selected Node.js, shell=false
→ install Supervisor Record
→ public Runtime remains starting
→ Subsystem connects Main Control Endpoint
→ Control carrier accepted → connected
→ subsystem.hello { protocolVersions:[1] }
→ validate key/token/version 1
→ bind Control Connection to descriptor.key
→ identified
→ optional status(initializing)
→ Runtime completes required initialization
→ status({state:"ready"})
→ ready
```

Launcher/Process/Supervisor 语义由 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md) 定义；Control wire 由 [Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md) 定义；Frame 组合由 [Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md) 定义。

### `ready` 边界

```json
{"state":"ready"}
```

只证明 Runtime 可以承担 enclosing Runtime Profile 角色。

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

## 6. Desktop Bootstrap Context

Launcher Profile v1 使用：

```text
LOOMREALM_BOOTSTRAP_CONTEXT
= Base64URL(no padding)(UTF-8 JSON)
```

```ts
interface LoomRealmBootstrapContextV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
}
```

Bootstrap Context v1 与 Subsystem Control v1 是独立版本空间；当前恰好都为 `1`。

Bootstrap Context MUST NOT 携带：

```text
Renderer Data Endpoint
DataAuthority generation
Data ticket
MessagePort
Frame / Activation / Render identity
```

它只提供发起 Control Bootstrap 所需 material；正式 Runtime identity 仍由 `subsystem.hello` 绑定。

## 7. Runtime public state / Supervisor

Main-observed Runtime state：

```text
declared
→ starting
→ connected
→ identified
→ ready
→ stopping
→ stopped

legal stages → failed
```

Launcher 内部状态不得提升为第二套公共 Runtime lifecycle。

来源必须明确：

```text
starting    Main/Launcher lifecycle
connected   Main accepted Control carrier
identified  successful subsystem.hello
ready       valid subsystem.status(ready)
stopped     Supervisor/Host observed actual Runtime termination
failed      Control/Runtime failure classification
```

PID、Process Handle、Launch Attempt ID 都不是协议 identity。

## 8. Failure / Restart

Desktop Launcher v1 MUST NOT 自动 restart failed Runtime。

Bootstrap 期间以下 exit 都是 failure：

```text
spawn后、connect前
connected后、hello前
identified后、ready前
```

Runtime ready 后，如果 Main 没有 termination intent，则任何 exit 都是 unexpected Runtime failure，包括 exit code 0。

未来 restart 必须是新的显式 Launch Attempt，并获得 fresh Bootstrap Credential；Frame/Data/Render recovery 不能由 Supervisor 私自推导。

## 9. Renderer Bootstrap

```text
Main
→ Host opens Renderer
→ Renderer loads Web application
→ establish Main ⇄ Renderer Control
→ renderer.hello
→ initial full Authority Snapshot
```

Renderer Control 镜像 Main committed authority：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority{subsystemKey,generation,connectionProfile}
```

不携带 Data WebSocket URL、MessagePort 或 bearer ticket。

普通 User Input 与 Render Update 不通过 Main 转发。

## 10. Renderer ⇄ Subsystem Data Connection

当 Main 允许 current Renderer 与某 Subsystem 建立 Data carrier 时，Renderer Control 发布：

```ts
DataAuthority {
  subsystemKey,
  generation,
  connectionProfile
}
```

随后 Host/Platform Binding 建立实际 carrier。

### Desktop

```text
Main commits DataAuthority(S,G)
→ Renderer observes current authority
→ Desktop Host obtains/creates endpoint + auth material
→ establish carrier bound to Session/current Renderer/S/G
→ install at most one current Data Connection
```

### PWA

```text
Main commits DataAuthority(S,G)
→ Host creates/transfers authenticated MessagePort
→ bind to Session/current Renderer/S/G
→ install at most one current Data Connection
```

endpoint、ticket、MessagePort creation/transfer 都不属于 Subsystem Control。

物理连接粒度：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

同 generation 仍 current 时，旧 carrier retired 后可建立 fresh carrier；`generation` 不是 reconnect counter。

## 11. Frame/Input 与 Render 独立

Frame/Input：

```text
Main Frame authority
→ frameId / Activation / InputTarget
→ Renderer User Input
→ Subsystem Frame/Input Context
```

Render：

```text
Subsystem Render Domain Registry / State
→ Render Update
→ Renderer Render Store
→ Components / DOM / Canvas / WebGL
```

禁止隐式关系：

- Frame create 不自动创建 Render Domain；
- Frame suspend/resume/close 不隐式 hide/show/destroy Render；
- Subsystem 可以在没有 Frame 时发布 Render；
- Runtime `ready` 不表示任何 Frame/Render 已存在。

## 12. 推荐启动时序

```text
1. Main create Session
2. Main Control Endpoint ready
3. Renderer/Content infrastructure ready
4. read + validate Game Package v1 / complete Descriptor set
5. resolve Launcher Targets
6. create Launch Attempts + Control bootstrapTokens
7. register token auth state
8. spawn/supervise all required Runtime Containers
9. each Runtime establishes Control carrier
10. subsystem.hello selects Control v1
11. Runtime identified
12. Runtime status(ready)
13. all required Runtime ready → Subsystem Bootstrap complete
14. Renderer establishes Main Control
15. Renderer receives current Authority Snapshot
16. Main publishes DataAuthority by policy
17. Host establishes Data carriers for current generations
18. User Input / Render Update establish fresh data-plane baselines
19. Frame lifecycle remains Main/Frame v1 authority
20. Render lifecycle remains Subsystem authority
```

必须保持：

```text
Main Control Endpoint ready
→ bootstrapToken registered
→ Runtime executable starts
```

Renderer 不自行启动 Subsystem，也不从 Runtime `ready`发现 Data endpoint。

## 13. Renderer Reload

```text
Renderer Control lost
→ old Renderer Data Connections retired
→ fresh Renderer Control attempt/token
→ renderer.hello + current full Authority Snapshot
→ fresh Host/Platform carriers for current DataAuthority generations
→ User Input starts with empty Interest then fresh State baselines
→ Render Update starts with Registry + fresh Snapshots
```

不得从 Frame 集合推导“哪些 Data Connection / Render 必须恢复”。

## 14. Trust Boundary

Desktop Node.js Launcher 的 Entry 路径安全与 Node Process OS 权限是不同问题：

```text
safe launcher.entry
    Main only executes a declared/validated Installation entry

Node.js Process sandbox
    not provided by current profile
```

因此 Desktop Node.js Subsystem 是 trusted executable code；普通游戏内容和所有协议输入仍按不可信数据校验。

## 15. 故障边界

- Descriptor / Entry / env invalid → Game Bootstrap failure；
- unsupported Launcher / spawn failure → Game Bootstrap failure；
- Runtime 未在期限内 connect/hello/ready → Game Bootstrap failure；
- Control authentication/version/protocol failure → Runtime/Bootstrap failure；
- Runtime session 中 unexpected Control loss/exit → Runtime failure，不自动 restart；
- Data carrier loss → Data Connection retired；**不自动等于 Runtime failure或 Frame unwind**；
- same generation 仍授权时 MAY establish fresh Data carrier；
- Renderer Control loss → revoke Renderer ordinary input/Data authority usage并 retire Data carriers；
- Renderer crash 不要求结束 Subsystem；
- Main crash 第一阶段不提供透明 Session recovery；
- Content failure 不隐式改变 Frame/Render lifecycle。

## 16. 架构不变量

1. Game Entry 一次性声明当前会话全部 required Subsystem Descriptor；
2. Descriptor identity=`key`；
3. Desktop current Launcher Type=`nodejs`；
4. 全部 required Runtime ready 后 Bootstrap 才完成；
5. Main Control Endpoint 在 Runtime 执行前可用；
6. Control bootstrap authentication state 在 Runtime 执行前存在；
7. Subsystem 主动建立 Control carrier；
8. Subsystem Control v1 是当前 Control contract；
9. `spawn success != connected != identified != ready`；
10. `ready != Data Connection established`；
11. Runtime identity由 Control v1 `subsystem.hello`绑定；
12. `ready`不携 Renderer Data endpoint；
13. Supervisor对实际 Runtime exit有最终观察权；
14. Desktop Launcher不自动 restart；
15. Renderer Control只发布逻辑 DataAuthority；
16. Host/Platform Binding负责实际 Data carrier establishment；
17. 每 Subsystem对 current Renderer最多一条 current Data Connection；
18. Data loss不等于 Runtime failure/Frame unwind；
19. Frame/Input、Render、Data lifecycle互相独立；
20. Entry路径安全不等于 Node Process sandbox。
