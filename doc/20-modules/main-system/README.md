# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 的内部模块边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[栈式运行系统](../../10-architecture/stack-runtime-system.md)、[Main ⇄ Subsystem Control Lifecycle v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call 协议草案](../../15-contracts/system-lifecycle-protocol.md)  
> 最近复核：2026-08-02

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── Subsystem Descriptor Registry
├── Launcher Registry / Dispatcher
├── Runtime Container Registry
├── Runtime Supervisor
├── Control Connection Registry
├── Frame Registry
├── Frame Stack Controller
├── Frame / Call Coordinator
├── Renderer Control Publisher
├── System Data Connection Authority
└── Content Grant Authority
```

## 2. Game Package Bootstrap

负责：

- 打开和校验游戏包公共结构；
- 读取 Manifest / Entry；
- 读取 initial target；
- 一次性读取全部 Subsystem Descriptor；
- 校验 Descriptor 公共结构、重复 `key`、当前支持的 Launcher Type、env 保留字段；
- 建立 Descriptor Registry；
- 把 Descriptor 集合交给 Runtime Bootstrap。

不负责：

- 解释目标 Subsystem 业务参数；
- 根据 `systemId` 猜测平台预注册 Provider；
- 把首个 Frame 调用当作启动 Runtime 的触发器。

## 3. Subsystem Descriptor Registry

按稳定 `descriptor.key` 保存当前会话声明：

```ts
interface SubsystemDescriptorRecord {
  readonly key: string;
  readonly launcherType: "nodejs";
  readonly entry: string;
  readonly env: Readonly<Record<string, string>>;
}
```

MVP：

- `key` 在当前 Game Entry 中唯一；
- 当前只接受 `nodejs`；
- 所有 Descriptor 都是 eager / required；
- 任一 unsupported Launcher 使 Game Bootstrap 失败。

Registry 不决定 `launcher.entry` 的最终路径安全规则；该规则仍待 Game Package / Launcher Contract 冻结。

## 4. Launcher Registry / Dispatcher

Launcher Registry 将 Descriptor Launcher Type 映射到 Main 特权启动实现。

Desktop MVP：

```text
nodejs → NodeJsSubsystemLauncher
```

Node.js Launcher：

- 为每个 Descriptor 创建 Launch Attempt；
- 生成一次性 Bootstrap Credential；
- 注入 Descriptor Key、Main Control Endpoint、Bootstrap Credential 和 descriptor env；
- 启动一个 Subsystem Process；
- 不把 PID 当协议身份；
- 不解释业务 Payload。

MVP 不声明 Shell / Executable / Deno / Bun 等其他 Launcher 已受支持。

## 5. Runtime Container Registry

按 Subsystem 保存唯一有效 Runtime Container：

```ts
interface RuntimeContainerRecord {
  readonly subsystemKey: string;
  readonly launchId: string;
  readonly controlConnectionId: string | null;
  readonly rendererDataConnectionId: string | null;
  readonly frameIds: ReadonlySet<string>;
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

- 在 Game Bootstrap 阶段记录所有声明 Subsystem；
- 跟踪 Launch Attempt 与 Control Connection；
- 区分 connected / identified / ready；
- 跟踪所属 Frame/Input Context；
- 跟踪 Renderer System Data Connection；
- 将 Runtime failure 关联到受影响 Frame。

Registry 不持有 Subsystem 业务状态或 Render Registry。

## 6. Runtime Supervisor

Desktop：

- 启动和终止 Subsystem Process；
- 监听退出和错误；
- 执行有限关闭期限；
- 将 Process observation 转换为 Main-observed Runtime state。

PWA：

- 创建和终止每 Subsystem 一个 Dedicated Worker；
- 监听 `error` / `messageerror`；
- 与 PWA Bootstrap Profile 组合控制 MessagePort。

Supervisor 不解释 Frame、Render 或业务 Payload。

## 7. Control Connection Registry

负责 Main ⇄ Subsystem Control Connection：

```text
connected
→ subsystem.hello
→ identified
→ subsystem.status(...)
→ ready / stopping / failed
```

职责：

- 校验 Bootstrap Credential；
- 校验 hello `key` 与 Launch Attempt；
- 协商 Control Protocol Version；
- hello 成功后将 Connection 永久绑定到 Descriptor Key；
- 接收 Runtime status；
- 把 Protocol Error 转换为 Runtime failure；
- 为后续 Frame / Call Control 提供已认证通道。

## 8. Frame Registry

```ts
interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  readonly status: "starting" | "active" | "suspended" | "closing" | "failed";
  readonly activationId: string | null;
}
```

Frame Registry 只负责：

- Frame → Subsystem 映射；
- 调用者关系；
- 生命周期状态；
- Activation；
- Input eligibility。

它不保存：

- Subsystem 权威业务状态；
- Render identity / Render State；
- Render Revision；
- Renderer Render Store；
- 物理 System Data Transport。

## 9. Frame Stack Controller

- 持有唯一调用栈；
- 校验只有栈顶 active Frame 可以普通 call / return；
- 维护 Stack Revision；
- 决定 Input Target；
- 串行提交栈变化；
- 不发布 Render visibility；
- 不根据栈顺序生成 Render z-order。

## 10. Frame / Call Coordinator

调用建立：

```text
解析目标 Subsystem
→ 确认 Descriptor 已声明且 Runtime ready
→ 分配 newFrameId
→ 通过已存在的 Control Connection frame.initialize
→ Frame/Input Context 初始化成功
→ suspend caller input
→ push target Frame
→ sign activationId
→ publish Stack / Input Target
```

调用建立**不负责**：

- 启动 Runtime Container；
- 确保 Render 已创建；
- 等待 Render Snapshot；
- 为 Frame 建立新的物理 Data Connection。

返回：

```text
停止当前 Frame 输入
→ pop / close Frame Input Context
→ 为 caller 签发新 Activation
→ 交付 result
→ publish Stack / Input Target
```

Frame close 不产生任何隐式 Render 操作。

## 11. Renderer Control Publisher

发布：

- Session 状态；
- Subsystem Runtime 状态；
- Frame Stack Snapshot / increment；
- Activation / Input Target；
- System Data Connection Grant / replace / revoke；
- 会话错误和诊断。

明确不发布：

- Frame visibility；
- Render Registry；
- Render visibility / z-order；
- Frame → Render mapping。

Renderer 重连时：

```text
恢复 Session / ready Subsystem 状态
→ 恢复 Frame Stack / Input Target
→ 根据 ready Subsystem 与授权策略重新发布 Data Grant
```

不能只从当前 Frame 集合推导需要连接的 Subsystem，因为 Subsystem 可以在零 Frame 时继续 Render。

## 12. System Data Connection Authority

管理 Renderer 与 Runtime Container 的**System 级物理连接授权**。

职责：

- 每个 Subsystem 同时最多一条 Renderer Data Connection；
- Desktop 签发 endpoint、Session/Subsystem/Connection identity、一次性 credential 与过期时间；
- PWA 创建每 Subsystem 一条 Renderer Data MessageChannel；
- Renderer 重载、Runtime restart、Session end 或 Transport failure 时替换 / 撤销；
- 不读取 User Input 或 Render Update Payload。

Grant 不绑定 `frameId`、`activationId` 或 Render identity。

## 13. Content Grant Authority

- 为 Main、Runtime Container 和 Renderer Resource Client 签发只读 Content Grant；
- Grant 绑定 Session 与 `installationId`；
- 区分 Manifest / Record / Group / Resource 权限；
- 不暴露物理游戏包路径；
- 不复用 Control Bootstrap Credential。

## 14. Runtime failure 协调

```text
Runtime failed / stopped unexpectedly
→ 撤销对应 System Data Connection
→ 停止相关 Frame 普通输入
→ 查找受影响 Frame
→ 按调用栈计算 failed result 或 Session failure
→ 更新 Stack / Runtime State
```

Main 不删除 Renderer Render Store 来“完成”Frame failure；Render 恢复/清理由 Render Protocol 决定。

## 15. 核心不变量

- Game Bootstrap 在 Frame 创建前启动全部 required Subsystem；
- `connected ≠ identified ≠ ready`；
- hello 成功后 Control Connection 绑定稳定 Descriptor Key；
- 一个 Subsystem 同时最多一个有效 Runtime Container；
- 一个 Runtime Container 可以承载多个 Frame/Input Context；
- Frame 不是业务状态或 Render 所有权单元；
- Main 不维护 Render Registry；
- Main 不发布 Frame visibility；
- System Data Grant 基于 ready Subsystem / connection policy，不基于 Frame 集合；
- Frame suspend/resume/close 不关闭共享 Data Connection；
- 普通 User Input 和 Render Update 不通过 Main 转发。

## 16. 测试入口

- Descriptor duplicate / unsupported Launcher；
- eager 启动全部声明 Subsystem；
- hello key/token/version 校验；
- connected / identified / ready 状态转换；
- 同一 Subsystem 多 Frame；
- 三层嵌套调用；
- 旧 Activation 输入拒绝；
- Frame close 不修改 Render 或 Data Connection；
- Runtime failure 影响多个 Frame；
- Renderer 重载时零 Frame 但有 Render 的 Subsystem 仍可恢复 Data Connection；
- Content / Bootstrap Credential 隔离。