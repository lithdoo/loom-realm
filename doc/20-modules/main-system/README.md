# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 的内部模块边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Main ⇄ Subsystem Control Lifecycle v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call 协议草案](../../15-contracts/system-lifecycle-protocol.md)  
> 最近复核：2026-08-03

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── Subsystem Descriptor Registry
├── Launcher Target Resolver
├── Launcher Registry / Dispatcher
├── Launch Attempt Registry
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
- 读取 Manifest / Entry / initial target；
- 一次性读取全部 Subsystem Descriptor；
- 校验 Descriptor Schema、重复 `key`、Launcher Type、Entry 语法、env 与保留字段；
- 确保 initial target 引用已声明 Subsystem；
- 建立 Descriptor Registry；
- 在任何业务 Process spawn 前完成集合级校验。

不负责：

- 解释目标 Subsystem 业务参数；
- 根据旧 `systemId` 猜测平台 Provider；
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

- `key` 唯一且大小写敏感；
- 当前只接受 `nodejs`；
- 所有 Descriptor eager / required；
- unsupported Launcher 使 Game Bootstrap 失败。

Registry 保存逻辑 Descriptor，不保存 Process Handle、物理 Entry 或 Render Registry。

## 4. Launcher Target Resolver

Desktop Resolver 实现 [Game Package v2](../../15-contracts/game-package-v2.md) 与 [Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md) 的 Entry 规则：

```text
logical entry
→ resolve against trusted Installation Root
→ reject symlink / junction / reparse redirect
→ verify regular file
→ canonical containment
→ ResolvedLauncherTarget
```

概念内部对象：

```ts
interface ResolvedLauncherTarget {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalEntry: string;
  readonly physicalEntry: string; // Host-private
}
```

未经验证的 `entry` string 不得直接传给 Launcher。

## 5. Launcher Registry / Dispatcher

Desktop v1：

```text
nodejs → NodeJsSubsystemLauncher
```

Node.js Launcher：

- 只接受 `ResolvedLauncherTarget`；
- 使用 Host-selected Node.js Runtime；
- 不接受 Game-supplied Node executable / flags / argv；
- `shell = false`；
- `cwd = Installation Root`；
- 显式构造 child environment；
- 不默认继承 Main 完整 `process.env`；
- 不解释业务 Payload。

MVP 不声明 Shell / Executable / Deno / Bun 等其他 Launcher 已受支持。

## 6. Launch Attempt Registry

每个启动尝试维护 Host-private Record：

```ts
interface LaunchAttemptRecord {
  readonly launchId: string;
  readonly subsystemKey: string;
  readonly target: ResolvedLauncherTarget;
  readonly bootstrapToken: string;
  readonly state: "prepared" | "spawning" | "supervised" | "exited" | "failed";
}
```

规则：

- 每次 Launch Attempt 新 Token；
- Token 在 Process spawn 前注册到 Main Control authentication state；
- spawn / early-exit / cancellation 时 revoke 未 consumed Token；
- `launchId`、PID、Process Handle 均不是协议 identity；
- 同一 `descriptor.key` 同时最多一个 active Runtime Container。

## 7. Runtime Container Registry

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

关键规则：

```text
spawn success
    public status remains starting

Control Transport accepted
    → connected

hello accepted
    → identified

ready status accepted
    → ready

actual Process exit observed
    → stopped / failed according to lifecycle context
```

Registry 不持有 Subsystem 业务状态或 Render Registry。

## 8. Runtime Supervisor

Desktop：

- 持有受管理 Process Handle；
- 监听 spawn error、exit code、signal / platform exit reason；
- 区分 expected / unexpected exit；
- 执行有限 graceful period 后的强制终止；
- SHOULD 使用 process group / Job Object / 平台等价监督域；
- 将实际 Process observation 转换为 Main-observed Runtime state。

v1 明确：

- ready 前 Process 退出 → Game Bootstrap failure；
- ready 后、Main 未请求 termination 的退出 → Runtime failure；
- exit code 0 不自动表示正常；
- 不自动 restart failed Runtime。

PWA Worker Supervisor 继续由 PWA Bootstrap Profile 单独冻结，不复用 Desktop Process API 细节。

## 9. Control Connection Registry

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
- 校验 hello `key` 与 active Launch Attempt；
- 协商 Control Protocol Version；
- hello 成功后将 Connection 永久绑定到 Descriptor Key；
- 接收 Runtime status；
- 把 Protocol Error 转换为 Runtime failure；
- 为后续 Frame / Call Control 提供已认证通道。

## 10. Frame Registry

```ts
interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  readonly status: "starting" | "active" | "suspended" | "closing" | "failed";
  readonly activationId: string | null;
}
```

Frame Registry 只负责 Frame → Subsystem、调用关系、状态、Activation 和 Input eligibility。

它不保存业务 State、Render identity、Render Revision、Renderer Store 或物理 System Data Transport。

## 11. Frame Stack Controller / Call Coordinator

Frame Stack Controller：

- 持有唯一调用栈；
- 只有栈顶 active Frame 可普通 call / return；
- 维护 Stack Revision 与 Input Target；
- 串行提交栈变化；
- 不发布 Render visibility 或 z-order。

Call Coordinator 在**已经 ready 的 Runtime Container** 上建立 Frame：

```text
resolve target Subsystem
→ confirm Runtime ready
→ allocate frameId
→ frame.initialize
→ suspend caller input
→ push Frame
→ sign activationId
→ publish Stack / Input Target
```

调用建立不启动 Runtime、不创建 Render、不等待 Render Snapshot、不建立 per-Frame Data Connection。

Frame close 不产生隐式 Render 操作。

## 12. Renderer Control Publisher

发布：

- Session / Subsystem Runtime 状态；
- Frame Stack / Activation / Input Target；
- System Data Connection Grant / replace / revoke；
- 会话错误和诊断。

明确不发布 Frame visibility、Render Registry、Render z-order 或隐式 Frame → Render ownership。

Renderer 重连时根据 ready Subsystem 与授权策略恢复 Data Grant，不能只从当前 Frame 集合推导连接。

## 13. System Data Connection Authority

管理 Renderer 与 Runtime Container 的 System 级物理连接授权：

- 每个 Subsystem 同时最多一条 Renderer Data Connection；
- Desktop 签发 endpoint、Session/Subsystem/Connection identity、credential 与过期信息；
- PWA 创建每 Subsystem Renderer Data MessageChannel；
- Renderer 重载、Runtime failure、Session end 或 Transport failure 时替换 / 撤销；
- 不读取 User Input 或 Render Update Payload。

Grant 不绑定 `frameId`、`activationId` 或 Render identity。

## 14. Content Grant Authority

- 为 Runtime / Renderer Resource Client 签发只读 Content Grant；
- Grant 绑定 Session 与 `installationId`；
- 不暴露物理游戏包路径；
- 不复用 Control Bootstrap Credential。

注意：Content API 的能力限制不等于 Desktop Node.js Process 的 OS sandbox。Desktop v1 executable Subsystem code 属于 trusted code。

## 15. Runtime failure 协调

```text
Runtime failed / stopped unexpectedly
→ revoke corresponding System Data Connection
→ stop affected Frame normal input
→ find affected Frames
→ compute failed result / Session failure according to call stack
→ publish Runtime / Stack state
```

Main 不通过删除 Renderer Render Store 来“完成”Frame failure；Render 恢复/清理由 Render Protocol 决定。

## 16. 核心不变量

- Game Bootstrap 在 Frame 创建前启动全部 required Subsystem；
- `launcher.entry` 在 spawn 前安全解析；
- Node executable 由 Host 选择，Launcher 不经过 Shell；
- Bootstrap Token 在 spawn 前注册；
- child environment 显式构造；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- hello 成功后 Control Connection 绑定 Descriptor Key；
- PID / launchId / Process Handle 不是协议身份；
- Supervisor 对实际 Process exit 有最终观察权；
- Desktop v1 不自动 restart；
- 一个 Subsystem 同时最多一个有效 Runtime Container；
- 一个 Runtime Container 可以承载多个 Frame/Input Context；
- Frame 不是业务状态或 Render 所有权单元；
- Main 不维护 Render Registry；
- 普通 User Input 和 Render Update 不通过 Main 转发。

## 17. 测试入口

- Descriptor duplicate / unsupported Launcher；
- Entry traversal / absolute / URL / symlink / containment / case collision；
- reserved env / `NODE_OPTIONS` / `NODE_PATH`；
- Descriptor 集合失败时零 Process side effect；
- Bootstrap Token 在 spawn 前注册；
- shell interpretation impossible；
- spawn success 仍保持 `starting`；
- early Process exit → Bootstrap failure；
- ready 后 exit code 0 unexpected exit → Runtime failure；
- no automatic restart；
- bounded termination；
- hello key/token/version 校验；
- connected / identified / ready 状态转换；
- 同一 Subsystem 多 Frame；
- Frame close 不修改 Render 或 Data Connection；
- Runtime failure 影响多个 Frame；
- Renderer 重载时零 Frame 但有 Render 的 Subsystem 仍可恢复 Data Connection；
- Content / Bootstrap Credential 隔离。
