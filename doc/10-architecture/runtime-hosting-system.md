# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem、Runtime Container、Frame/Input、Render、进程、Worker 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 正式契约：[Game Package v2](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[桌面宿主模块](../20-modules/desktop-host/README.md)、[PWA 宿主模块](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-03

## 1. 设计目标

运行承载系统定义 LoomRealm 的逻辑 Subsystem/System 如何映射到桌面进程和浏览器 Worker，同时保持 Subsystem、Frame/Input、Render、通信和内容访问的所有权边界清晰。

核心结论：

> 每个 Subsystem 对应一个可复用 Runtime Container；Frame 是 Main 管理的调用 / 输入上下文；Render 是 Subsystem 自主拥有的呈现上下文。Frame 和 Render 都不是独立进程或独立物理连接，且二者之间不存在平台级所有权绑定。

## 2. 核心术语

```text
Subsystem Descriptor
    Game Entry 中声明的启动描述
    当前字段：key、launcher、env

Subsystem / System
    业务扩展单元，例如 loom.map 或 loom.menu
    Descriptor identity = key
    部分旧数据协议仍使用 systemId

Runtime Container
    一个 Subsystem 的运行承载单元
    Desktop = 独立 OS Process
    PWA = Dedicated Worker

System Data Connection
    Renderer 与一个 Runtime Container 之间的长期双向数据 Transport

Frame
    Main 管理的一次调用 / User Input Context

Render Context
    Subsystem 管理的呈现上下文

Host
    提供窗口、页面、进程或 Worker 创建、平台生命周期与安全边界
```

进程 ID、Worker 身份、Connection ID、Frame ID 和 Render identity 不能互相替代。

## 3. 承载粒度

```text
每个 Subsystem / System
    一个有效 Runtime Container

每个 Runtime Container
    0..N Frame / Input Context
    0..N Render Context
    与 Main 一条长期 Control Connection
    与 Renderer 最多一个有效 System Data Connection

每个 Frame
    一个调用 / 输入路由上下文

每个 Render Context
    一个 Subsystem 自主管理的呈现上下文
```

平台不规定：

```text
一个 Frame 必须有一个 Render
一个 Frame 必须有独立业务状态
一个 Render 必须属于某个 Frame
Frame close 必须删除 Render
```

如果存在这些关系，全部属于 Subsystem 内部实现。

## 4. Subsystem Descriptor 与 Desktop 启动

Desktop v1 Descriptor：

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

当前会话全部 Subsystem 由 Game Entry 一次性声明。Main 在启动阶段立即启动全部声明项；当前不定义 lazy 启动。

Desktop 单个 Runtime：

```text
validate Descriptor / launcher.entry / env
→ resolve trusted ResolvedLauncherTarget
→ create Launch Attempt / Bootstrap Token
→ register Token in Main Control authentication state
→ construct explicit child environment / Bootstrap Context
→ Host-selected Node.js + shell=false spawn Process
→ Runtime Supervisor takes ownership
→ public state remains starting
→ Subsystem connects Main
→ subsystem.hello completes identity binding
→ identified
→ subsystem.status(state="ready", ...)
→ ready
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

`launcher.entry`、Node selection、环境、spawn 和 Process supervision 由 [Game Package v2](../15-contracts/game-package-v2.md) 与 [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md) 冻结；Control wire schema 和 Runtime lifecycle 由 [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md) 冻结。

PID、Process Handle 和 Launch Attempt ID 只属于 Host supervision，不是 Subsystem protocol identity。

## 5. Container 级共享与内部自由度

Runtime Container 可以共享：

- 系统代码和 Schema；
- 协议编解码器；
- Renderer System Data Connection；
- 只读 Content Client；
- Repository 和并发请求去重；
- 已解析不可变内容；
- WASM Module、纹理描述等只读缓存；
- Subsystem 自己定义的共享业务状态；
- Render Manager 与 Render Registry。

平台只要求不同 Frame 的调用 / 输入身份不能混淆，不要求业务状态、Runtime Core、Tick 或 Projector 按 Frame 拆分。

## 6. Frame 隔离边界

Frame 必须独立维护的公共语义仅包括调用 / 输入相关身份，例如：

- `frameId`；
- 所属 Subsystem/System reference；
- 调用者关系；
- Frame 状态；
- `activationId`；
- User Input eligibility 和必要的输入顺序状态。

以下不是平台要求的 Frame 必备状态：

- 权威业务世界状态；
- Runtime Core；
- Execution Loop；
- Client/Render State Projector；
- Render State Revision；
- Render Scope；
- Render Event Queue。

## 7. Render 承载边界

Render Context 由 Runtime Container 创建、更新和销毁。

一个 Container 可以：

- 在任何 Frame 创建前建立 Render；
- 在 Frame suspended 时继续更新 Render；
- 在 Frame close 后保留 Render；
- 同时维护多个 Render；
- 根据自身业务显式将某个 Frame 与某个 Render 关联。

Main 不维护 Render Registry。Renderer 也不能从 Main Stack 推导哪些 Render 应存在。

本文使用 `Render Context` 作为概念术语；具体 wire identity 字段名由 Render Update Protocol 冻结。

## 8. LoomRealm Main 位置

Main 拥有：

```text
Session
Subsystem Descriptor Registry
Launch Attempt / Runtime Container Registry
Runtime Supervisor
Runtime shutdown intent
Frame Registry / Stack
Activation / Input Target
Control Connection authority
System Data Connection authority
```

Main 不持有 Subsystem 权威业务状态，不维护 Render Registry，也不转发普通 User Input 或 Render Update Payload。

## 9. Desktop Profile

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / Web Renderer
每个已声明 Subsystem 一个 Subsystem Process
```

Desktop 使用 localhost WebSocket 承载：

- Renderer ⇄ Main Control；
- Subsystem → Main Control；
- Renderer ⇄ Subsystem System Data。

localhost HTTP 承载只读 Content API。

Hostra 只负责窗口与桌面生命周期，不承载 LoomRealm Main，不解释 Subsystem、Frame、Render 或 Input。

Desktop `nodejs` Subsystem executable code 在 v1 中属于 trusted code；安全 `launcher.entry` 不构成 OS sandbox。

## 10. PWA Profile

```text
Window
    Web Renderer

Main Runtime Dedicated Worker
    Session / Frame Stack / Input Target / Worker Registry

每个 Subsystem 一个 Dedicated Worker
    Business Runtime / Frame Input Contexts / Render Contexts

Service Worker
    Readonly Content API

OPFS / Cache Storage
    已安装游戏包和资源
```

PWA 的 Descriptor → Worker Script、Bootstrap Credential 和 Control Transport Profile 尚未冻结。不得把 Desktop `nodejs` Process API 细节直接解释成 PWA Contract。

未来 PWA Profile SHOULD 保持当前 Subsystem Control v1 的 identity / lifecycle 语义；若 wire 行为不兼容则必须显式提升对应协议版本。

## 11. Runtime Container 生命周期

Main-observed 状态：

```text
declared
→ starting
→ connected
→ identified
→ ready
→ stopping
→ stopped

任意非终止阶段
→ failed
```

其中：

- `starting`：Launch Attempt 已开始；Process spawn 成功后仍保持该状态；
- `connected`：Control Transport 已建立；
- `identified`：`subsystem.hello` 成功，Connection 已永久绑定 `descriptor.key`；
- `ready`：Main 接受合法 `subsystem.status(state="ready")`；
- `stopping`：Main 已建立正常 shutdown intent；
- `stopped`：Supervisor 观察到 Runtime 在 shutdown intent 下实际退出；
- `failed`：不可恢复的 Launcher / Transport / Protocol / Runtime failure。

正常结束固定为：

```text
Main establishes shutdown intent
→ subsystem.shutdown(reason)
→ status(stopping) [optional]
→ Supervisor confirms Runtime exit
→ stopped
```

关键边界：

```text
subsystem.shutdown Response ≠ stopped
status(stopping) ≠ stopped
```

Runtime 不得在没有 Main shutdown intent 时自行 `ready → stopping`；不能继续正常服务时应报告 `failed`。

没有 shutdown intent 的 Control Connection loss 或 Runtime exit 都是 failure，即使 Process exit code 为 0。

Subsystem Control v1 不支持 same-attempt reconnect / resume / automatic restart，也不定义 application-level heartbeat。

ready 不表示任何 Frame、Render 或 Renderer Data Connection 必须已经存在。

## 12. System Data Connection 生命周期

Main 根据 ready Subsystem 状态和连接授权策略发布 System Data Connection Grant。连接可以服务：

```text
0..N Frame Input Context
0..N Render Context
```

因此：

- 创建或关闭 Frame 不创建或关闭物理 Data Connection；
- 创建或销毁 Render 不创建或关闭物理 Data Connection；
- 最后一个 Frame 关闭后连接仍可继续服务 Render；
- 没有 Frame 时 System Data Connection 仍可存在；
- Runtime Container 退出会使该连接失效。

System Data Connection 的建立依据 ready Subsystem / Main Grant，不根据当前 Frame 集合推导。

## 13. Container 正常终止与故障

正常终止：

```text
Main shutdown intent
→ graceful Control request
→ finite Host-defined deadline
→ Supervisor confirms exit
→ stopped
```

如果 Runtime 未在期限内退出，Supervisor 可以强制终止；只要最终确认 Runtime 已不存在，公共状态仍为 `stopped`，graceful / forced 只属于诊断信息。

不可恢复故障：

```text
Runtime failed / exits unexpectedly / Control Connection lost unexpectedly
→ Main marks failed
→ revoke corresponding System Data Connection
→ stop affected Frame normal input
→ handle affected Frames according to call stack
→ Render Store cleanup / recovery remains a Render Protocol concern
```

Runtime 如果已经进入 terminal `failed`，后续 Process exit 不得把它改回 `stopped`。

Renderer DOM / Canvas / WebGL 不能作为权威业务状态恢复源。

## 14. 核心不变量

1. 进程 / Worker 隔离粒度 = Subsystem；
2. Frame = Main-managed call/input context；
3. 每个 Runtime Container 可以承载 0..N Frame；
4. Render 生命周期完全属于 Subsystem；
5. Frame 与 Render 不存在平台级所有权关系；
6. System Data Connection 与 Frame 数量解耦；
7. Desktop v1 = `key + nodejs + eager all-required bootstrap`；
8. Desktop Entry / env / spawn / Supervisor 语义已经冻结；
9. Control identity 在 `subsystem.hello` 成功后绑定到 Connection；
10. `spawn success ≠ connected ≠ identified ≠ ready`；
11. `ready` 是 Runtime status，不是身份声明；
12. Main 拥有正常 Runtime shutdown intent；
13. `stopped` 只来自 Supervisor 对实际退出的观察；
14. 没有 shutdown intent 的 Runtime exit / Control loss 是 failure；
15. Subsystem Control v1 不定义 application heartbeat、reconnect、resume 或 automatic restart；
16. PWA Launcher / Bootstrap Transport Profile 仍待单独冻结。
