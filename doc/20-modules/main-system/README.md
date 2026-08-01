# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：程序主系统的内部模块边界  
> 依赖：[栈式运行系统](../../10-architecture/stack-runtime-system.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[生命周期协议草案](../../15-contracts/system-lifecycle-protocol.md)  
> 最近复核：2026-08-01

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── System Registry
├── Runtime Container Registry
├── Frame Registry
├── Frame Stack Controller
├── Lifecycle Coordinator
├── Container Supervisor
├── Renderer Control Publisher
├── System Data Channel Authority
└── Content Grant Authority
```

## 2. Game Package Bootstrap

- 打开和校验游戏包公共结构；
- 读取入口；
- 解析安装实例和初始 `systemId`；
- 申请只读 Content Grant；
- 将 `systemId` 和 `params` 交给栈控制流程；
- 不解释目标子系统业务参数。

## 3. System Registry

- 根据 `systemId` 解析 Runtime Container Provider；
- 校验协议版本和能力；
- 区分 System 不存在、版本不兼容、Container 启动失败和 Frame 初始化失败；
- 第一阶段明确游戏包不携带可执行子系统。

待冻结：命名规则、Provider 配置、系统代码来源和内置 System 注册方式。

## 4. Runtime Container Registry

按 `systemId` 保存唯一有效 Container：

```ts
interface RuntimeContainerRecord {
  readonly systemId: string;
  readonly containerId: string;
  readonly controlConnection: ControlConnection;
  readonly rendererDataConnectionId: string | null;
  readonly frameIds: ReadonlySet<string>;
  readonly status: "starting" | "ready" | "idle" | "serving" | "closing" | "failed";
}
```

职责：

- 首次调用时启动或取得 Container；
- 复用同一 `systemId` 的 Container；
- 跟踪 Container 承载的 Frame；
- 跟踪该 Container 与 Renderer 的 System Data Connection；
- 最后一个 Frame 关闭后执行常驻或空闲退出策略；
- 将 Container 故障关联到其全部 Frame。

Registry 不持有 Container 内部业务状态。

## 5. Frame Registry

```ts
interface FrameRecord {
  readonly frameId: string;
  readonly systemId: string;
  readonly containerId: string;
  readonly callerFrameId: string | null;
  readonly status: "starting" | "ready" | "active" | "suspended" | "closing" | "failed";
  readonly activationId: string | null;
}
```

Frame Registry 负责：

- Frame 与 System/Container 的映射；
- 生命周期状态；
- Activation；
- 调用者关系；
- Renderer 是否可以为该 Frame 建立或继续使用 Logical Stream。

它不保存子系统权威业务状态、Client State Tree 或物理 Renderer Data Transport。

## 6. Frame Stack Controller

- 持有唯一调用栈；
- 校验只有栈顶 active Frame 可以普通 call/return；
- 维护 Frame 状态和 Stack Revision；
- 决定 Input Target；
- 不以 Container、进程或数据连接身份代替 Frame；
- 不持有子系统业务状态。

所有栈变化通过单一串行写入口提交，避免并发 call、return、Container 退出和 Renderer 断线产生不一致。

## 7. Lifecycle Coordinator

调用建立事务：

```text
解析 System
→ 取得或启动 Runtime Container
→ 确保 Renderer ⇄ Container 的 System Data Connection 可用
→ 在 Container 内初始化 Frame
→ Frame ready
→ 暂停旧 Frame
→ 新 Frame 入栈
→ 激活新 Frame
→ 发布 Stack 和 Input Target
```

如果该 System 已存在 Renderer Data Connection，不因为创建新 Frame 再签发新的物理连接。

返回事务：

```text
停止当前 Frame 输入
→ Frame 出栈并关闭实例
→ 清理该 Frame Logical Stream
→ 为调用者签发新 Activation
→ 交付返回结果并恢复调用者
→ 发布 Stack 和 Input Target
```

关闭 Frame 不关闭共享的 System Data Connection。

## 8. Container Supervisor

桌面实现负责：

- 启动和关闭 System 进程；
- 监听退出和错误；
- 执行关闭期限；
- 建立 localhost 控制连接；
- 将进程异常转换为 Container 故障。

PWA 实现负责：

- 创建和终止 System Dedicated Worker；
- 建立控制 MessagePort；
- 监听 `error` 和 `messageerror`；
- 在页面恢复时检查 Worker 状态。

共同规则：

- 不使用 PID 或 Worker 名称作为调用身份；
- 一个 `systemId` 对应一个有效 Container；
- Container 崩溃影响其承载的全部 Frame；
- Supervisor 不解释业务 Payload。

## 9. Renderer Control Publisher

- 发布完整调用栈 Snapshot；
- 发布 Frame 入栈、暂停、恢复和出栈；
- 发布 Frame 可见性和 Input Target；
- 在 Renderer 需要连接某 System 时发布 System Data Channel Grant；
- 发布 System Data Connection 失效/撤销信息；
- 处理 Renderer 重连；
- 不解释 Scope Tree 或转发普通数据面消息。

Renderer 根据 Stack 中的 `systemId` 将 Frame 业务消息路由到对应 System Data Connection。

## 10. System Data Channel Authority

System Data Channel Authority 管理的是 Renderer 与 Runtime Container 的**物理数据连接授权**，而不是每个 Frame 的连接。

职责：

- 每个 `systemId` 同时最多授权一条 Renderer Data Connection；
- 桌面签发 WebSocket endpoint、`sessionId`、`systemId`、`connectionId`、一次性 token 和过期时间；
- PWA 为每个 System Worker 创建一条 Renderer Data MessageChannel，并将两端分别转移给 Window 与 System Worker；
- 在 Renderer 重载、Container 重启、会话结束或 Transport 故障时更新或撤销连接；
- 限制消息大小、速率和授权范围；
- 不读取普通输入和 Client State Payload。

Grant 不包含 `frameId` 或 `activationId`。Frame 消息在已认证的 System Data Connection 内通过 `frameId + activationId` 路由。

Frame 暂停、恢复、关闭或 Resync 只更新 Frame Registry / Activation / Logical Stream 状态，不撤销共享物理连接。

## 11. Content Grant Authority

- 为程序主系统公共加载、Runtime Container 和 Renderer Resource Client 签发只读 Content Grant；
- Grant 绑定当前会话和 `installationId`；
- 区分 Manifest、Record、Group 和 Resource 权限；
- 不暴露物理游戏包路径；
- 会话或安装授权失效后撤销相应授权。

PWA 同源 Content API 不需要 Bearer token，但仍由安装注册表和 Service Worker 校验安装实例。

## 12. Container 故障协调

Container 失败时：

```text
查找该 Container 的全部 Frame
→ 撤销该 System 的 Renderer Data Connection
→ 停止相关 Input Target
→ 计算受影响调用链
→ 生成 failed 结果或会话故障
→ 更新 Stack Store
```

第一阶段如果无法安全保持调用栈一致，应使会话失败，而不是保留失去权威 Runtime 的 Frame。

## 13. Renderer 重连

```text
Renderer 重连 Main Control Connection
→ Main 发布 stack.snapshot
→ 计算当前有效 Frame 涉及的 distinct systemId
→ 每个 systemId 签发一份 System Data Channel Grant
→ Renderer 每 System 建立一条 Data Transport
→ Renderer 对该 System 的有效 Frame 分别 state.resync
```

Main 不为同一 System 的每个 Frame 重复创建 WebSocket 或 MessagePort。

## 14. 核心不变量

- 栈变化与 Input Target 变化一致；
- 一个 Frame 同时最多有一个有效 Activation；
- 一个 `systemId` 同时最多有一个有效 Runtime Container；
- 一个 Runtime Container 与 Renderer 同时最多有一个有效 System Data Connection；
- 未 ready 的 Frame 不接收普通输入；
- Frame 出栈后只清理该 Frame 的 Logical Stream 和 Renderer Store，不关闭共享 Transport；
- 关闭一个 Frame 不关闭同 Container 内其他 Frame；
- 普通输入和 Client State 不通过 Main 转发；
- Main 不依赖 `loom.map` 内部类型；
- Content Grant 不泄露物理路径。

## 15. 测试入口

- 初始 Container 和 Frame 成功与失败；
- 同一 System 同时承载多个 Frame；
- 同一 System 的多个 Frame 共享一条 Renderer Data Transport；
- Frame A 关闭、暂停或 Resync 不影响 Frame B 和共享 Transport；
- 三层嵌套调用；
- completed、cancelled 和 failed；
- 并发 call/return 拒绝；
- Container 崩溃关闭该 System Data Connection 并影响多个 Frame；
- Renderer 重载后按 distinct systemId 重建连接并逐 Frame Resync；
- 旧 Activation 消息拒绝；
- 桌面 WebSocket 与 PWA MessagePort 行为一致；
- Content Grant 权限和撤销。

现有详细资料：[程序主系统与模块子系统](../../architecture/main-system-and-subsystems.md)。
