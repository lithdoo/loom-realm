# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-03

模块层说明各系统当前准备如何拆解。模块可以重构、合并或替换，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Descriptor Registry、Launcher Target Resolver、Launch Attempt、Runtime Supervisor、Frame Stack、Control 与 Data Grant |
| Web 渲染端 | [web-renderer](./web-renderer/README.md) | Main Control、System Connection、Render Store、Frame Input、DOM/Canvas/WebGL |
| 游戏包与内容 | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository、Validator |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop HTTP 与 PWA Service Worker 的统一只读 Content API |
| 地图子系统 | [loom-map](./loom-map/README.md) | 地图 Runtime、Frame Input Adapter、Render Manager/Projector、兼容层 |
| 桌面宿主 | [desktop-host](./desktop-host/README.md) | Hostra Window Adapter、Desktop WebSocket/HTTP、Node.js Launcher 与 Process Supervisor |
| PWA 宿主 | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、每 Subsystem Data MessagePort、Service Worker 和 OPFS |

## Desktop Launcher 模块边界

链路 1 的模块关系：

```text
Game Package Bootstrap
→ Descriptor Registry
→ Launcher Target Resolver
→ Launch Attempt Registry
→ NodeJsSubsystemLauncher
→ Runtime Supervisor
```

约束：

- Game Package Loader / Validator 不 spawn Process；
- Resolver 不接收业务 Payload，只把合法 logical Entry 变成 Host-private ResolvedLauncherTarget；
- Launcher 只接受 ResolvedLauncherTarget；
- Game Package 不指定 Node executable / flags / argv；
- Launcher 不经 Shell；
- Bootstrap Token 在 spawn 前注册；
- Process spawn 成功后公共 Runtime 状态仍为 `starting`；
- Supervisor 负责实际 Process exit observation；
- Desktop v1 不自动 restart。

Desktop executable Subsystem code 属于 trusted code；Launcher Entry 安全不等于 Node Process sandbox。

## 跨平台承载映射

```text
Desktop
    LoomRealm Main Process
    每个 Subsystem 一个 OS Process
    Renderer ⇄ 每个 Subsystem 一条 System Data WebSocket
    FSDB localhost HTTP Content Service

PWA
    Main Runtime Dedicated Worker
    每个 Subsystem 一个 Dedicated Worker
    Window ⇄ 每个 Subsystem 一条 System Data MessagePort
    Service Worker Content Service
```

进程 / Worker 隔离粒度是 Subsystem，不是 Frame。Desktop Node.js Process Profile 与 PWA Worker Bootstrap Profile 是不同 Host Profile；PWA 映射尚未冻结。

## Runtime Container、Frame 与 Render

```text
Runtime Container 级
    Subsystem business state（由 Subsystem 自己决定结构）
    System Data Connection
    Content Client / Repository Cache
    Render Manager / Render Registry
    共享协议与只读缓存

Frame 级公共语义
    frameId
    caller relationship
    Activation
    Input eligibility / routing
    return lifecycle

Render 级公共语义
    Subsystem-owned Render identity
    Render State / Event / Recovery
```

平台不要求 Frame 固定拥有 Runtime Instance、独立业务状态、Execution Loop、Projector、Render Revision/Scope 或 Render Event Queue。

一个 Subsystem 可以将多个 Frame 映射到共享 world state，也可以给不同 Frame 建立独立内部 session；这些属于 Subsystem 实现自由度。

## Renderer 模块边界

Renderer 模块应按两个业务域分开：

```text
System Data Connection Registry
├── Render Registry / Render Store / Scheduler
└── Frame Input Registry / Input Router
```

不得重新建立统一的 “Frame Stream” 来同时承载 Render State 与 User Input 生命周期。

Frame suspend / close：

- 改变 Input eligibility；
- 不自动删除 Render；
- 不自动删除 Renderer Render Store；
- 不关闭共享 System Data Connection。

## 模块文档规则

模块文档应说明：

1. 模块目标；
2. 输入和输出；
3. 拥有的状态；
4. 明确不拥有的状态；
5. 与其他模块的调用方向；
6. 并发和事务边界；
7. 失败和清理；
8. 实现不变量；
9. 依赖的正式契约；
10. 最小测试。

## 依赖规则

- 模块不能绕过正式契约直接修改另一个系统的内部状态；
- Main 不能依赖地图子系统内部类型；
- Web Renderer 不能依赖游戏包物理路径；
- Game Package Loader 不能产生 Process / Worker side effect；
- Launcher 不能接受未经验证的 Entry 或无条件继承 Main 完整环境；
- Hostra Adapter 不能承载 LoomRealm Main 或业务 Runtime；
- Service Worker 不能承载 Frame Stack、权威业务状态或固定 Tick；
- Content Service 不能读取或修改 Frame Runtime State；
- Subsystem SDK 不能强迫每 Frame 创建独立进程、Worker、WebSocket 或 MessagePort；
- 普通 User Input 和 Render Update 不经过 Main 或 Hostra 业务转发；
- Renderer 不从 Frame Stack 推导 Render visibility、order 或 lifecycle。

## 迁移说明

仍存在的旧目录资料只作为迁移/历史参考。与当前模块设计冲突的旧结论必须降级为 Legacy，而不是继续作为实现入口。
