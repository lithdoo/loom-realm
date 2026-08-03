# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-03

## 1. 模块结构

```text
PWA
├── Window Host Adapter
├── Web Renderer
├── Main Runtime Dedicated Worker
├── Subsystem Worker Registry
├── Control MessageChannel Factory
├── System Data MessageChannel Factory
├── Service Worker Content Service
├── Package Installer
├── OPFS Package Store
└── Page Lifecycle Coordinator
```

## 2. Window Host Adapter

Window 主线程负责浏览器要求必须与页面或用户手势绑定的能力：

- 创建 Main Runtime Worker；
- 注册和等待 Service Worker；
- 选择本地目录或文件；
- 全屏、锁屏、震动和手柄能力；
- 监听 `visibilitychange`、`pagehide`、`pageshow`；
- 承载 Web Renderer。

Window 不拥有 Frame Stack、Subsystem 权威业务状态或 Render 权威状态。

## 3. Main Runtime Dedicated Worker

Main Runtime Worker 是 Desktop LoomRealm Main Process 的 PWA 对应物：

```text
Session
Subsystem Descriptor Registry
Subsystem Worker Registry
Runtime shutdown intent
Frame Registry / Stack
Activation / Input Target
Frame / Call Coordinator
System Data Connection Authority
```

它不承载 DOM，也不转发普通 User Input 或 Render Update Payload。

## 4. 每个 Subsystem 一个 Dedicated Worker

```text
loom.map
    一个 Dedicated Worker

loom.menu
    一个 Dedicated Worker

loom.battle
    一个 Dedicated Worker
```

每个 Subsystem Worker 可以维护：

```text
0..N Frame/Input Context
0..N Render Context
一个 Renderer System Data MessagePort
共享只读 Content Client
共享 Repository Cache
共享 Schema / WASM Module
Subsystem 自己决定的业务状态
```

平台不要求每个 Frame 拥有独立 Runtime Core、Execution Loop、Projector、Revision 或 Render State。

## 5. PWA Bootstrap 边界

Desktop v1 已冻结 `launcher.type = nodejs`，但 PWA 如何把 Game Entry Descriptor 映射为 Worker script / module，以及如何传递 Bootstrap Credential、建立 Control MessagePort，尚未冻结。

因此当前 PWA 模块只固定以下架构边界：

- 进程等价承载粒度仍是每 Subsystem 一个 Dedicated Worker；
- Main 在会话 Bootstrap 阶段建立全部 required Subsystem Worker，而不是等待第一次 Frame 调用；
- Main ⇄ Subsystem Worker 使用每 Subsystem 一条长期控制 MessagePort；
- Window ⇄ Subsystem Worker 使用每 Subsystem 一条长期 System Data MessagePort；
- Frame 与 Render 所有权语义必须与 Desktop 一致；
- 未来 PWA Control Profile MUST 保持 Subsystem Control v1 的 identity / lifecycle / shutdown 语义，除非显式提升协议版本。

Worker script URL、module type、Bootstrap Credential Transport、Control Port bootstrap 和 Descriptor Launcher 字段映射留给 PWA Bootstrap / Transport Profile 冻结。

## 6. Subsystem Worker Registry

概念记录：

```ts
interface SubsystemWorkerRecord {
  readonly subsystemKey: string;
  readonly worker: Worker;
  readonly controlPort: MessagePort;
  readonly rendererDataPort: MessagePort | null;
  readonly frameIds: ReadonlySet<string>;
  readonly shutdownIntent: null | {
    readonly reason: "session-end" | "bootstrap-abort";
  };
  readonly status:
    | "declared"
    | "starting"
    | "connected"
    | "identified"
    | "ready"
    | "stopping"
    | "stopped"
    | "failed";
}
```

职责：

- Bootstrap 阶段为全部 required Descriptor 建立 Worker；
- 绑定控制 Port；
- 跟踪 identified / ready 状态；
- 跟踪 Main-owned shutdown intent；
- 后续 Frame 复用该 Worker；
- 每个 Worker 最多维护一条 Renderer Data Port；
- 监听 `error` 和 `messageerror`；
- Worker failure 时通知 Frame / Call Coordinator。

当前不定义“首次调用时 lazy 创建 Worker”。

## 7. Control MessagePort

逻辑拓扑：

```text
Main Runtime Worker ⇄ Subsystem Worker
```

未来 PWA Control Transport Profile 必须映射两套独立协议域：

```text
Subsystem Control Protocol v1
    subsystem.hello
    subsystem.status
    subsystem.shutdown

Frame / Call Protocol
    frame lifecycle / activation / call / return
    独立冻结
```

Subsystem Control v1 已冻结的逻辑状态必须保持：

```text
connected ≠ identified ≠ ready

normal shutdown:
Main establishes shutdown intent
→ subsystem.shutdown
→ status(stopping) [optional]
→ Worker termination observation
→ stopped
```

具体 Bootstrap Credential Transport、MessagePort envelope 和 Worker termination observation Profile 尚未冻结，因此本文不把 Desktop WebSocket 细节直接复制成 PWA wire contract。

Subsystem Control v1 **不定义 application-level heartbeat / health RPC**。如果 PWA 需要 Worker liveness / event-loop health 检测，应由 PWA Host/Transport Profile 或未来显式协议扩展定义，不能偷偷新增 `subsystem.ping`。

控制 Port 不承载普通 User Input、Render Update 或资源主体。

## 8. System Data MessagePort

Window Renderer 与每个 Subsystem Worker 之间最多一条长期数据 Port：

```text
Window Renderer
    ⇄ MessagePort(subsystem=loom.map)
loom.map Worker
    ├── Render Contexts
    └── Frame Input Contexts
```

Main Runtime Worker 创建 `MessageChannel` 并把两端转移给 Window 与目标 Subsystem Worker。

物理 Port 与 Frame 数量无关，可以在零 Frame 时继续服务 Render。

连接内部拆分：

```text
Connection Layer
Render Update Protocol
User Input Protocol
```

不再定义统一 Frame Logical Stream 来同时控制 Render State 和 User Input。

## 9. Frame Input Context

Frame 只负责调用 / 输入：

- `frameId`；
- Activation；
- Input eligibility；
- caller / return relationship。

Frame suspend / close：

- 停止或改变普通输入资格；
- 不关闭 System Data Port；
- 不销毁 Render；
- 不要求删除 Subsystem 共享业务状态。

Frame / Call Protocol 不得重新定义 Runtime bootstrap、Subsystem identity、ready、shutdown 或 restart 语义。

## 10. Render Context

Subsystem Worker 完全控制 Render：

- create；
- update；
- visibility / ordering；
- event；
- destroy；
- recovery。

Render 可以在没有 Frame 时存在。

Window Renderer 按 Render identity 保存 Render Store，不能从 Frame Stack 推导 Render lifecycle。

## 11. Service Worker Content Service

Service Worker 响应：

```text
/_lr/v1/games/...
```

负责 Manifest、Record、Group、Resource、MIME、ETag、Content Version、GET/HEAD 和错误语义。

不负责 Frame Stack、User Input、业务 Runtime Tick、Render lifecycle 或持续后台游戏运行。

Service Worker 必须能在内存回收后从持久存储重新加载索引和安装登记。

## 12. OPFS Package Store / Installer

安装流程：

```text
用户选择内容
→ 复制到临时 OPFS 位置
→ 校验 Manifest / Entry / Descriptor / Content Index
→ 校验内容引用
→ 标记安装 complete
→ 原子登记 installationId
```

未完成安装不得通过 Content API 服务。

Installer 是可写能力，不能暴露给普通 Runtime Container。

## 13. 页面生命周期

隐藏：

```text
visibilitychange: hidden
→ Window 停止采集普通输入
→ Main 暂停/清理 Input Target 意图
→ Subsystem 按自己的策略处理 Tick / presentation
```

页面隐藏不要求 Subsystem Render 或业务 world state 跟随 Frame 统一暂停。

恢复：

```text
页面 visible
→ 检查 Main / Subsystem Worker / Data Port
→ 按声明的 Subsystem 集合恢复必要 Worker
→ 恢复 Control State
→ 为 ready Subsystem 恢复 Data Port
→ 恢复 Frame Input Context
→ 各 Subsystem 独立恢复 Render State
```

不能逐 Frame `state.resync` 作为统一 Render 恢复模型。

页面/Worker 重启如何恢复 Session 属于后续 PWA Session/Checkpoint 设计；不得解释成 Subsystem Control v1 的 same-attempt reconnect / resume。

## 14. Worker 数量与资源策略

逻辑规则固定：

```text
一个 Subsystem
→ 一个 Worker
```

当前 eager 模型中所有 Game Entry 声明 Subsystem 在 Bootstrap 阶段建立 Worker。

未来如果引入 lazy / idle recycle，必须通过新的显式协议策略定义，不能把资源优化偷偷解释成当前语义。

不能把多个不同 Subsystem 静默合并到一个业务 Worker，除非未来定义新的复合 Container Profile。

## 15. 故障与终止

- Subsystem Worker error：对应 Subsystem failure，Data Port 失效，Main 处理全部受影响 Frame；
- 没有 Main shutdown intent 的 Control Port loss / Worker termination：Runtime failure；
- Main shutdown intent 下的 graceful Worker shutdown / forced `worker.terminate()` 如何映射为最终 `stopped`，由 PWA Host Profile 冻结，但必须保持“实际 termination observation 才是 stopped”的语义；
- 已 terminal `failed` 的 Runtime 不得因后续 Worker termination 改回 stopped；
- Data Port failure：停止该 Subsystem 普通输入，Render 按 Render Protocol 恢复；
- 单 Frame 输入协议错误：只影响目标 Frame/Input Context；
- 单 Render 错误：只影响目标 Render 恢复域；
- Window reload：Dedicated Worker 通常随页面生命周期结束，后续按 PWA Session/Checkpoint 策略恢复；
- Service Worker restart：不改变仍存活 Runtime 的 Frame/Render 生命周期；
- OPFS 内容损坏：Content API 返回稳定错误；
- Timer throttle：恢复时不得无限补跑 Tick。

## 16. 安全

- Worker script 必须来自受信任的应用 / 安装启动边界；
- Game Package 不获得任意 `eval` 或动态代码执行能力；
- PWA Descriptor → Worker script 的最终安全映射尚未冻结；
- Data Port 只转移给目标 Subsystem Worker 和 Window；
- User Input 校验 Frame / Activation；
- Render Update 限制当前 Subsystem Render namespace；
- Content API 只访问已登记安装实例；
- Service Worker 不暴露任意 OPFS 路径。

## 17. 核心不变量

- 每个 Subsystem 一个 Dedicated Worker；
- 当前不按首次 Frame 调用 lazy 创建 Worker；
- 每个 Worker 一条 Main Control Port；
- Window 与每个 Worker 最多一条 System Data Port；
- PWA Bootstrap Credential / Control Transport Profile 尚待冻结；
- 未来 PWA Control Profile 必须保持 Subsystem Control v1 的 identity / lifecycle / shutdown 语义；
- Subsystem Control v1 没有 application heartbeat / same-attempt reconnect / resume；
- Main 拥有正常 Runtime shutdown intent；
- stopped 必须来自实际 Worker termination observation；
- Frame = call/input context；
- Render = Subsystem-owned context；
- Frame lifecycle 不控制 Render/Data Port；
- Render recovery 与 Frame recovery 独立。
