# ADR 0017：平台是系统级 Composition Boundary

> 状态：Accepted  
> 日期：2026-08-19  
> 影响范围：Main、Renderer、Subsystem、Content、Runtime Hosting、Control/Data Binding、Desktop/PWA Composition、package architecture  
> 关系：clarifies / extends [ADR 0002：平台 Transport Binding](./0002-platform-transport-profiles.md)；Game→Platform executable binding 部分由 [ADR 0019](./0019-platform-launch-manifest-boundary.md) 进一步闭合

> [!NOTE]
> 本 ADR 的核心结论——**Platform 是完整 physical Session 的系统级 Composition Boundary**——继续有效。ADR 0019 进一步明确 executable binding 也属于 Platform realization：current Game Package 不再声明 `module`，Hostra/PWA 可选择不同 Definition artifact；这只修正本 ADR 中“同一业务 definition”曾可能被解读为“必须同一 artifact”的部分，不改变 role/platform authority、Data Broker、ports、composition-root 等决策。

## 背景

LoomRealm 已经明确 Desktop 与 PWA 可以使用不同物理 carrier，同时共享相同 application contracts。ADR 0002 解决了：

```text
application semantics统一
physical transport由平台实现
```

随着 Subsystem SDK、Renderer Data、Runtime Hosting 和 Content 设计继续展开，一个更高层的问题出现：

> 跨平台差异不只存在于 Subsystem carrier，也不只存在于 Transport。

一个完整 LoomRealm Session 需要同时决定：

```text
Game logical topology如何绑定当前平台 executable implementation
Runtime Container 如何创建和监督
Main ⇄ Subsystem Control 如何建立
Renderer participant 如何承载
Main ⇄ Renderer Control 如何建立
Renderer ⇄ Subsystem Data 两端如何协调
Content 如何提供
bootstrap material 如何传递
物理资源如何 startup/shutdown
```

如果这些问题分别由 Main、Renderer、Subsystem 自己寻找平台资源，会产生：

```text
role package 直接依赖 WebSocket/MessagePort/Worker/Process
module-global current platform/context
每个 role 各自建立连接
Control/Data topology 被拆散
Runtime/Input/Render capability 被迫成为 service locator
平台差异向业务代码传播
```

因此需要明确系统级 Platform Composition boundary。

## 决策 1：Platform 是完整 Session 的物理 Composition Boundary

采用：

> **Main、Renderer、Subsystem、Content 保持 platform-neutral；Platform Composition 负责把这些逻辑角色实现为当前平台上的完整物理 Session。**

```text
Platform-neutral roles
    Main / Renderer / Subsystem / Content
                  │
             Platform Ports
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 Hostra Desktop            PWA
```

Platform 不成为新的 application authority。

ADR 0019 补充：Platform Composition 的 Runtime launch 子边界还负责 current-platform executable binding / preflight LaunchPlan；Main 仍只拥有 logical launch authority。

## 决策 2：Platform 通过 role-facing ports 提供基础设施

Platform 可以向不同角色提供不同投影，例如：

```text
Main-facing
    Runtime Hosting / Supervisor
    Renderer Hosting integration
    Control binding facilities
    Data Connection Broker
    Content Service integration

Renderer-facing
    Renderer Control connection source
    Data connection source
    Content binding
    browser/device environment

Subsystem-facing
    Runtime Control connection source
    Renderer Data connection source
    Content binding
```

这些 local binding interfaces 不是新的 protocol，也不是整个 Platform architecture。

Platform executable binding / LaunchPlan 同样不应通过 Main/Subsystem author API 泄漏为 module/path/URL 参数；它由 Platform RuntimeHosting 内部封装。

## 决策 3：Data Connection establishment 是系统级 Broker 责任

Renderer⇄Subsystem Data carrier 同时涉及：

```text
Main current DataAuthority
current Renderer participant
Subsystem endpoint/runtime
physical transport
```

因此其物理建立属于 system-level Data Connection Broker / Platform Composition，而不是 Renderer 或 Subsystem 单边创建。

Broker 必须在安装 carrier 前绑定：

```text
current Session
current Renderer
subsystemKey
current generation
current dataProfile
```

但 Broker 不拥有 generation/profile，也不能从 endpoint/Port 推导 authority。

## 决策 4：Hostra Desktop 与 PWA 是同一架构的两个 realization

典型映射：

```text
Hostra Desktop
    Runtime        Node child process
    Control        localhost WebSocket
    Renderer       Hostra/Electron BrowserWindow
    Data           authenticated localhost carrier
    Content        filesystem + localhost HTTP

PWA
    Runtime        Dedicated Worker
    Control        MessagePort
    Renderer       browser Window
    Data           MessageChannel / transferred Port
    Content        Fetch + Service Worker / OPFS
```

允许物理 topology 不同；application contracts、authority、identity、ordering、recovery 必须保持等价。

ADR 0019 进一步允许：

```text
same logical subsystem key
Hostra → Hostra-selected Definition artifact
PWA    → PWA-selected Definition artifact
```

不要求 module path/bytes/build artifact相同；要求相同 SubsystemDefinitionFactory ABI、formal semantics与 business-observable result。

## 决策 5：Business Core 不依赖 Platform implementation

业务包只依赖 platform-neutral role SDK，例如：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

Desktop/PWA composition 负责将业务 Subsystem source/definition semantics 运行在不同平台。

禁止业务 core 出现：

```text
if desktop → WebSocket
if pwa → MessagePort
read launch.hostra.json / launch.pwa.json
branch on module URL / Runner type
```

业务 source SHOULD platform-neutral；不同平台 build artifact 的差异由 build + Platform Launch Manifest吸收。

## 决策 6：Platform Architecture 不等于 Platform npm package

Platform 是架构职责；当前产品实现仍默认放在：

```text
apps/desktop
apps/pwa
```

并组合：

```text
role packages
technical adapters
platform-local glue
```

不因为存在 Platform Architecture 就自动创建：

```text
@loomrealm/platform-hostra
@loomrealm/platform-pwa
```

只有真实独立消费者、稳定 API 与独立发布价值出现后才抽包。

ADR 0019 明确建立的：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

是**窄的 Subsystem Runtime launch capability packages**，不等价完整 Platform package；Renderer Hosting、DataConnectionBroker、Content product、Shell/UI 等仍由 composition root组合。

## 决策 7：Transport 只是 Platform realization 的一个技术能力

```text
transport-websocket
transport-messageport
launcher-node
content-http
content-service-worker
```

都只是可组合 adapter。

它们不得拥有 Session/Frame/Data/Render application authority，也不得把 transport bootstrap 机制升级成业务协议。

同理，`game-launcher-hostra/pwa` 不因为负责 Runtime launch 就获得 Renderer/Data/Content 的完整 Platform authority。

## 决策 8：不新增 Platform application protocol

本决策不新增：

```text
Platform Protocol
Hostra Protocol
PWA Protocol
Data Bootstrap Protocol
Universal Launcher Protocol
```

现有正式 contracts 继续定义 application interoperability。

Platform Launch Manifest 是当前产品安装/启动配置 contract，不自动意味着 Hostra/PWA 共享同一 wire/schema；两个 Platform Profile 可独立演化。

只有未来出现独立第三方 Host 与独立 Role implementation 之间必须共享新的 bootstrap wire，且不共享会破坏 interoperability/security 时，才考虑形成新 Contract/Profile。

## 结果

系统设计从“各 role 各自处理平台差异”收敛为：

```text
Game logical topology
        ↓
current Platform executable binding / preflight plan
        ↓
Platform Composition
    owns physical topology
        ↓
role-facing platform ports
        ↓
platform-neutral role implementations
        ↓
shared business semantics
```

由此得到：

- Subsystem SDK 中的 connection bindings 被重新定位为 Subsystem role-local platform ports；
- Main 不直接等同 Node launcher/WebSocket，也不接收 module/path/URL；
- Renderer 不自己寻找 Data carrier；
- Data carrier establishment 有系统级协调点；
- Hostra Desktop / PWA module docs 实现同一个 Platform Composition Architecture；
- Game logical topology与 executable realization分离；
- 业务 Subsystem source/API 可以单一实现跨平台复用；
- `apps/desktop` / `apps/pwa` 保持 composition roots；
- package boundary 仍按能力/消费者，而不是按平台强制建立大包；
- 新平台优先新增自己的 launch profile/realization，而不是扩张 Game common manifest。

## 重新评估条件

以下情况可以重新评估 Platform port、launch profile 或 package boundary：

- 多个独立产品复用完全相同的 Hostra/PWA composition glue；
- 第三方 Host 必须与第三方 Main/Renderer/Subsystem 通过公开 bootstrap wire 互操作；
- 新平台无法通过现有 role-facing ports 实现相同 logical trace；
- lazy/optional Subsystem改变 Game↔Platform exact key-set join规则；
- remote Runtime / multiple Renderer 等新拓扑要求扩展 Platform coordination model；
- executable signing/sandbox形成独立 trust contract。

仅仅增加一个新 Transport、换一种 Process/Worker API，或为同一业务 key生成不同平台 build artifact，不足以修改 application architecture。
