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
├── Frame Channel Authority
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
  readonly frameIds: ReadonlySet<string>;
  readonly status: "starting" | "ready" | "idle" | "serving" | "closing" | "failed";
}
```

职责：

- 首次调用时启动或取得 Container；
- 复用同一 `systemId` 的 Container；
- 跟踪 Container 承载的 Frame；
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
- 数据连接授权状态。

它不保存子系统权威业务状态或 Client State Tree。

## 6. Frame Stack Controller

- 持有唯一调用栈；
- 校验只有栈顶 active Frame 可以普通 call/return；
- 维护 Frame 状态和 Stack Revision；
- 决定 Input Target；
- 不以 Container 或进程身份代替 Frame；
- 不持有子系统业务状态。

所有栈变化通过单一串行写入口提交，避免并发 call、return、Container 退出和 Renderer 断线产生不一致。

## 7. Lifecycle Coordinator

调用建立事务：

```text
解析 System
→ 取得或启动 Runtime Container
→ 在 Container 内初始化 Frame
→ Frame ready
→ 暂停旧 Frame
→ 新 Frame 入栈
→ 签发 Frame Channel Grant
→ 激活新 Frame
→ 发布 Stack 和 Input Target
```

返回事务：

```text
停止当前 Frame 输入
→ 撤销 Frame Channel
→ Frame 出栈并关闭实例
→ 为调用者签发新 Activation
→ 交付返回结果并恢复调用者
→ 发布 Stack 和 Input Target
```

任一步失败都需要明确回滚或会话失败策略。

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
- 发布 Frame Channel Grant；
- 处理 Renderer 重连；
- 不解释 Scope Tree 或转发普通数据面消息。

## 10. Frame Channel Authority

- 为每个有效 Frame 创建或授权 Renderer 与 Frame Runtime 的独立数据连接；
- 桌面签发 WebSocket endpoint、一次性 token 和过期时间；
- PWA 创建 MessageChannel 并将两端转移给 Window 和 System Worker；
- 绑定 `sessionId`、`systemId`、`frameId`、`activationId` 和 `connectionId`；
- 在暂停、恢复、出栈和重连时更新或撤销连接；
- 限制消息大小、速率和授权范围；
- 不读取普通输入和 Client State Payload。

## 11. Content Grant Authority

- 为程序主系统公共加载、Runtime Container 和 Renderer Resource Client 签发只读 Content Grant；
- Grant 绑定当前会话和 `installationId`；
- 区分 Manifest、Record、Group 和 Resource 权限；
- 不暴露物理游戏包路径；
- Frame 或会话关闭后撤销相应授权。

PWA 同源 Content API 不需要 Bearer token，但仍由安装注册表和 Service Worker 校验安装实例。

## 12. Container 故障协调

Container 失败时：

```text
查找该 Container 的全部 Frame
→ 撤销相关 Frame Channel
→ 停止相关 Input Target
→ 计算受影响调用链
→ 生成 failed 结果或会话故障
→ 更新 Stack Store
```

第一阶段如果无法安全保持调用栈一致，应使会话失败，而不是保留失去权威 Runtime 的 Frame。

## 13. 核心不变量

- 栈变化与 Input Target 变化一致；
- 一个 Frame 同时最多有一个有效 Activation；
- 一个 `systemId` 同时最多有一个有效 Runtime Container；
- 未 ready 的 Frame 不接收普通输入；
- Frame 出栈后其数据连接和 Renderer Store 必须清理；
- 关闭一个 Frame 不关闭同 Container 内其他 Frame；
- 普通输入和 Client State 不通过 Main 转发；
- Main 不依赖 `loom.map` 内部类型；
- Content Grant 不泄露物理路径。

## 14. 测试入口

- 初始 Container 和 Frame 成功与失败；
- 同一 System 同时承载多个 Frame；
- 三层嵌套调用；
- completed、cancelled 和 failed；
- 并发 call/return 拒绝；
- 单 Frame 关闭不影响同 Container 其他 Frame；
- Container 崩溃影响多个 Frame；
- Renderer 重载和 Frame Channel 重建；
- 旧 Activation 消息拒绝；
- 桌面 WebSocket 与 PWA MessagePort 行为一致；
- Content Grant 权限和撤销。

现有详细资料：[程序主系统与模块子系统](../../architecture/main-system-and-subsystems.md)。
