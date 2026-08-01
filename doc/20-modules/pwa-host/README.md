# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、System Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[Renderer–Subsystem 数据协议 v1](../../15-contracts/frame-data-channel-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-01

## 1. 模块结构

```text
PWA
├── Window Host Adapter
├── Web Renderer
├── Main Runtime Dedicated Worker
├── System Worker Registry
├── System Data MessageChannel Factory
├── Service Worker Content Service
├── Package Installer
├── OPFS Package Store
└── Page Lifecycle Coordinator
```

## 2. Window Host Adapter

Window 主线程负责浏览器要求必须由用户手势触发或与页面绑定的能力：

- 创建 Main Runtime Worker；
- 注册和等待 Service Worker；
- 选择本地目录或文件；
- 全屏、锁屏、震动和手柄能力；
- 监听 `visibilitychange`、`pagehide` 和 `pageshow`；
- 承载 Web Renderer。

Window 不拥有 Frame Stack 或业务权威状态。

## 3. Main Runtime Dedicated Worker

Main Runtime Worker 是桌面 LoomRealm Main Process 的 PWA 对应物：

```text
Frame Stack
System Registry
System Worker Registry
Frame Registry
Activation / Input Target
Lifecycle Coordinator
System Data Channel Authority
```

它不承载普通 DOM，不通过自身转发 Frame 普通输入和 Client State。

## 4. 每个 System 一个 Dedicated Worker

```text
loom.map
    一个 Dedicated Worker

loom.menu
    一个 Dedicated Worker

loom.battle
    一个 Dedicated Worker
```

每个 System Worker 内维护：

```text
frames: Map<frameId, FrameRuntime>
一个 Renderer Data MessagePort
共享只读 Content Client
共享 Repository Cache
共享 Schema / WASM Module
```

Frame 的权威状态、Activation、输入队列、Execution Loop、Projector、Revision 和 Logical Stream Sequence 必须独立。

## 5. System Worker Registry

```ts
interface SystemWorkerRecord {
  readonly systemId: string;
  readonly worker: Worker;
  readonly controlPort: MessagePort;
  readonly rendererDataPort: MessagePort | null;
  readonly frameIds: ReadonlySet<string>;
  readonly status: "starting" | "ready" | "idle" | "serving" | "failed";
}
```

职责：

- 首次调用时创建 Worker；
- 等待 `container.hello` 和 `container.ready`；
- 后续 Frame 复用 Worker；
- 每个 System Worker 最多维护一条 Renderer Data Port；
- 监听 `error` 和 `messageerror`；
- 最后一个 Frame 关闭后常驻或空闲终止；
- Worker 失败时通知 Lifecycle Coordinator。

## 6. 控制 MessagePort

每个 System Worker 与 Main Runtime Worker 之间有一条长期控制 MessagePort：

```text
Main Runtime Worker ⇄ System Worker
```

承载：

- Container 握手；
- Frame initialize/activate/suspend/resume/close；
- system.call 和 Frame return；
- Container 错误、heartbeat 和诊断。

控制 Port 不承载普通输入、Client State 或资源主体。

## 7. System Renderer 数据 MessagePort

Window Renderer 与每个 System Worker 之间建立一条长期数据 MessagePort：

```text
Window Renderer
    ⇄ MessagePort(system=loom.map)
loom.map Worker
    ├── Frame A Runtime
    └── Frame B Runtime
```

Main Runtime Worker 创建一个 `MessageChannel`：

```text
port A → Window Renderer
port B → 对应 System Worker
```

这条 Port 服务该 System Worker 中的全部 Frame，不为每个 Frame 再创建 MessageChannel。

端口建立后双方执行 `channel.hello`，验证：

```text
protocolVersion
sessionId
systemId
connectionId
```

Frame 业务消息通过：

```text
frameId
activationId
sequence
```

在同一 Port 内多路复用。

Main Runtime Worker 只创建、转移和撤销 System 数据端口，不读取普通 Payload。

## 8. Frame Logical Stream

System Worker 和 Window Renderer 都维护 Frame Stream Registry：

```ts
interface FrameStreamRecord {
  readonly frameId: string;
  readonly activationId: string;
  readonly connectionId: string;
  readonly inboundSequence: number;
  readonly outboundSequence: number;
}
```

规则：

- Frame 创建不新建 Port；
- Frame suspend 不关闭 Port；
- Frame resume 在现有 Port 上创建新的 Activation epoch；
- Frame close 只删除该 Frame Stream；
- 一个 Frame 的 Sequence Gap 或 Resync 不影响同 Worker 其他 Frame；
- System Worker 退出才使该 System Data Port 失效。

## 9. Service Worker Content Service

Service Worker 拦截：

```text
/_lr/v1/games/...
```

并从 OPFS、Cache Storage 和安装注册表构造 Response。

负责：

- Manifest、Record、Group 和 Resource 路由；
- Package Index 解析；
- MIME、ETag 和 Content Version；
- 离线缓存；
- GET/HEAD 和错误语义。

不负责：

- Frame Stack；
- 输入；
- 权威业务状态；
- Runtime Tick；
- Client State Projector；
- 持续后台游戏运行。

Service Worker 必须能够在内存被回收后从持久存储重新加载索引和安装登记。

## 10. OPFS Package Store

建议结构：

```text
OPFS/
└── loom-realm/
    └── games/
        └── <installationId>/
            ├── install.json
            ├── realm.game.json
            ├── realm.entry.json
            ├── fsdb.index.json
            └── data/...
```

运行阶段通过只读 Content API 暴露。用户清除站点数据时安装内容会丢失，因此原始游戏包不应只存在于 OPFS。

## 11. Package Installer

安装流程：

```text
用户选择目录 / 文件或远程包
→ 读取并验证 manifest 和 entry
→ 复制到临时 OPFS 安装目录
→ 生成或校验 fsdb.index.json
→ 校验大小、Hash 和强引用
→ 写入 install.json complete
→ 原子登记 installationId
```

未完成安装不得被 Service Worker Content API 读取。

安装器是可写能力，不能暴露给 Runtime Container。

## 12. 首次 Service Worker 控制

Runtime Worker 开始 Fetch 内容前必须确认：

```text
Service Worker 已注册
→ 已激活
→ 当前页面受其控制
```

如果首次加载尚未被控制，可以等待 `controllerchange` 或要求刷新。实现不得假设 Service Worker 在注册调用返回时已经接管当前页面。

## 13. 页面生命周期

### 隐藏

```text
visibilitychange: hidden
→ Window 停止采集普通输入
→ Main Runtime Worker 暂停 Input Target
→ System Worker 暂停活动 Frame 调度
→ 按需要保存会话检查点
```

### 恢复

```text
页面 visible
→ 检查 Main/System Worker 和 System Data Port
→ 重建失效 Worker
→ 恢复 Stack
→ 为每个有效 System 确保一条 Renderer Data Port
→ 恢复各 Frame Activation
→ 对各有效 Frame 分别 state.resync
```

PWA 第一阶段不保证应用进入后台后仍持续 60Hz 运行。

## 14. Worker 数量与资源策略

逻辑规则固定为每个 `systemId` 一个 Worker，但宿主可以：

- 只在首次调用时懒创建；
- 最后一个 Frame 关闭后延迟 terminate；
- 对未使用 System 不创建 Worker；
- 在内存压力下关闭 idle Worker；
- 恢复时重新加载共享不可变缓存。

最后一个 Frame 关闭后是否立即关闭 Renderer Data Port 属于宿主资源策略；不能把 Frame close 语义定义成 Transport close。

不能把多个不同 `systemId` 静默合并到同一个业务 Worker，除非未来定义新的复合 Container Profile。

## 15. 故障处理

- System Worker `error`：该 System 的 Data Port 失效，其全部 Frame 失败；
- System Data Port `messageerror` / 关闭：停止该 System 下所有普通输入，按恢复策略重建 Port 并逐 Frame Resync；
- 单 Frame 协议错误：只影响该 Frame Logical Stream，不自动终止整个 Worker 或 Data Port；
- Window 重载：全部 Dedicated Worker 随页面销毁，第一阶段从持久检查点或新会话恢复；
- Service Worker 重启：不影响仍在内存中的 Frame Runtime；
- OPFS 内容损坏：Content API 返回稳定错误，不修改权威运行状态；
- 页面冻结后 Timer 延迟：恢复时不能补跑无限 Tick，应由 Execution Loop 的 catch-up 限制处理。

## 16. 安全

- Worker 脚本来自同源可信应用包；
- 不通过游戏包动态加载任意 JavaScript；
- System Data MessagePort 只向对应 System Worker 和 Window 转移；
- Port 握手校验 `sessionId + systemId + connectionId`；
- 所有 Frame 业务消息继续执行 Schema、Frame 和 Activation 校验；
- 共享 Port 不赋予 Frame 跨流访问权限；
- Content API 只访问已登记安装实例；
- 游戏包内容视为不可信；
- Window 不获得 OPFS 任意写能力，写入通过 Installer；
- Service Worker 不执行内容中的脚本。

## 17. 核心不变量

- Main Runtime Worker 拥有调用栈；
- 每个 `systemId` 一个 Dedicated Worker；
- 每个 System Worker 与 Window Renderer 最多一条有效 Data MessagePort；
- 同一 System 的多个 Frame 共享该 Port，但 Runtime 实例和 Logical Stream 独立；
- Frame suspend/resume/close 不关闭共享 Port；
- 普通输入和 Client State 在 Window 与 System Worker 间直连，并通过 Frame 身份路由；
- Service Worker 只提供无状态 Content API；
- 页面后台运行不构成可靠游戏时钟；
- PWA 与桌面使用相同 System、Frame、Activation、State 和 Content 语义。

## 18. 测试入口

- Main Worker 启动和 Stack Snapshot；
- 一个 System Worker 承载多个 Frame；
- 两个 Frame 共用同一 Data MessagePort；
- 两个 Frame 的输入、State、Activation 和 Sequence 相互隔离；
- Frame close 不影响同 Worker 其他 Frame或共享 Port；
- Worker error 影响该 System 的全部 Frame；
- System Data Port 重建后逐 Frame Resync；
- Service Worker 首次控制和重启；
- OPFS 安装、完整性和删除；
- 页面隐藏、恢复和 Resync；
- 与桌面 Profile 共用 Renderer–Subsystem Data 和 Content API Fixture。
