# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 的内部模块边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)  
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

当前：

- `key` 唯一且大小写敏感；
- Desktop 只接受 `nodejs`；
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

概念记录：

```ts
interface RuntimeContainerRecord {
  readonly subsystemKey: string;
  readonly launchId: string;
  readonly controlConnectionId: string | null;
  readonly rendererDataConnectionId: string | null;
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

Main establishes shutdown intent
    → stopping

actual Process exit observed under shutdown intent
    → stopped

unexpected Process/Control loss or terminal protocol/runtime failure
    → failed
```

Runtime self-reported Status 与 Main-observed state 必须分开保存；`stopped` 只来自 Supervisor observation。

Registry 不持有 Subsystem 业务状态或 Render Registry。

## 8. Runtime Supervisor

Desktop：

- 持有受管理 Process Handle；
- 监听 spawn error、exit code、signal / platform exit reason；
- 区分 expected / unexpected exit；
- 在 Main 已建立 shutdown intent 时等待有限 graceful deadline；
- deadline 后执行强制终止；
- SHOULD 使用 process group / Job Object / 平台等价监督域；
- 将实际 Process observation 转换为 Main-observed Runtime state。

v1 明确：

- ready 前 Process 退出 → Game Bootstrap failure；
- ready 后、Main 没有 shutdown intent 的退出 → Runtime failure；
- exit code 0 不自动表示正常；
- Main shutdown intent 下，Supervisor 确认 Runtime 已不存在 → `stopped`；
- 已经 terminal `failed` 的 Runtime 不因后续 exit 改回 `stopped`；
- 不自动 restart failed Runtime。

## 9. Control Connection Registry

负责 Main ⇄ Subsystem 的 **Subsystem Control Protocol v1**：

```text
connected
→ subsystem.hello
→ identified
→ subsystem.status(initializing?)
→ subsystem.status(ready)

normal termination:
Main establishes shutdown intent
→ subsystem.shutdown(reason)
→ subsystem.status(stopping) [optional]
→ Supervisor confirms exit
→ stopped
```

职责：

- 校验 Bootstrap Credential；
- 校验 hello `key` 与 active Launch Attempt；
- 协商 Subsystem Control Protocol Version；
- hello 成功后将 Connection 永久绑定到 Descriptor Key；
- 接收并验证 Runtime status state machine；
- 原子建立 Main-owned shutdown intent；
- 发送 `subsystem.shutdown`；
- 保证 shutdown Response 只表示 accepted，不把它当作 `stopped`；
- 将非法 status / fatal Protocol Error 转换为 Runtime failure；
- 实现 JSON-RPC `-32000` + `error.data.code` 的 LoomRealm semantic error envelope；
- 执行 Subsystem Control v1 wire limits；
- 没有 shutdown intent 的 Control Connection loss → Runtime failure；
- shutdown intent 下的连接关闭交给 Supervisor 收敛为 `stopped / failed`；
- 为独立 Frame / Call Protocol 提供已经认证的物理 Control Connection。

Subsystem Control v1 **不实现 application-level heartbeat、same-attempt reconnect、resume 或 automatic restart**。

## 10. Frame Registry

Frame / Call Protocol v1 Batch A 已冻结 Frame identity、lifecycle 与 Activation。Main 数据结构必须按这些维度分离：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

type FrameOutcome =
  | { readonly type: "completed"; readonly value?: unknown }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: unknown };

interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;

  state: FrameLifecycleState;
  currentActivationId: string | null;
  outcome: FrameOutcome | null;
}
```

其中 `FrameOutcome` 只是模块概念类型；最终 wire Schema 由 Frame / Call Batch B 冻结。

Registry 必须保证：

```text
frameId
    Main-generated / Session unique / never reused

subsystemKey
    创建时永久绑定 descriptor.key

callerFrameId
    创建后 immutable

active
    currentActivationId != null

starting / suspended / closing / closed
    currentActivationId == null
```

Registry MUST NOT：

- 使用 `status = failed` 代替 Frame cleanup lifecycle；
- 引入 Frame `ready / initialized` 公共状态；
- 复用 closed Frame 的 `frameId`；
- 复用 revoked `activationId`；
- 保存 Render identity、Render Revision、Renderer Store 或物理 System Data Transport 作为 Frame-owned state。

## 11. Activation Registry / Signing

Main 是 Activation 唯一签发方。

每次：

```text
Frame first becomes active
Frame resumes after child call / recovery
```

都必须创建新的 Session-scoped unique `activationId`。

冻结：

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

Frame 离开 `active` 时，Main 必须立即把 `currentActivationId` 置空并使旧值永久失效。

## 12. Frame Stack Controller / Call Coordinator

Frame Stack Controller：

- 持有 Main-owned 单一 LIFO 调用栈；
- 正常稳定状态 Stack Top = `active`；
- 其他 live Frame = `suspended`；
- 只有 Stack Top active Frame 可普通 call / return；
- 维护 Stack Revision 与 Input Target；
- 串行提交栈变化；
- 事务期间允许短暂零 active Frame；
- MUST NOT 发布两个同时有效的 ordinary Input Target；
- 不发布 Render visibility 或 z-order。

Call Coordinator 只能在**已经 ready 且没有 shutdown intent 的 Runtime Container** 上建立 Frame。

当前 Batch A 只冻结模型，不冻结最终调用事务顺序。后续 Batch B/C 将明确：

```text
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
frame.call
frame.return
```

的 Schema、pre/postcondition、commit barrier 与 rollback。

调用建立不得：

- 启动 Runtime；
- 创建 Render；
- 等待 Render Snapshot；
- 建立 per-Frame Data Connection；
- 引入 Frame ready/status。

## 13. Renderer Control Publisher

发布：

- Session / Subsystem Runtime 状态；
- Frame Stack；
- Frame lifecycle 的只读镜像；
- current Activation / Input Target；
- System Data Connection Grant / replace / revoke；
- 会话错误和诊断。

明确不发布 Frame visibility、Render Registry、Render z-order 或隐式 Frame → Render ownership。

Main MUST NOT 对 Renderer 发布两个同时有效的 ordinary Input Target。

后续 Frame Batch C 将冻结 `activate/resume` 与 Input Target publish 的 causal commit barrier。

## 14. System Data Connection Authority

管理 Renderer 与 Runtime Container 的 System 级物理连接授权：

- 每个 Subsystem 同时最多一条 Renderer Data Connection；
- Grant 不绑定 `frameId`、`activationId` 或 Render identity；
- Runtime 进入 Main-owned shutdown intent 后停止签发新的 Data Grant；
- Frame create / suspend / resume / close 不隐式创建或关闭 Data Connection；
- 不读取 User Input 或 Render Update Payload。

## 15. Content Grant Authority

- 为 Runtime / Renderer Resource Client 签发只读 Content Grant；
- Grant 绑定 Session 与 `installationId`；
- 不暴露物理游戏包路径；
- 不复用 Control Bootstrap Credential。

Content API 的能力限制不等于 Desktop Node.js Process 的 OS sandbox。

## 16. Runtime termination / failure 协调

正常结束：

```text
Main establishes shutdown intent
→ stop issuing new Runtime work / connection grants
→ subsystem.shutdown(reason)
→ wait finite deadline
→ Supervisor confirms exit or force terminates
→ publish stopped
```

不可恢复故障：

```text
Runtime failed / unexpected exit / unexpected Control loss
→ revoke corresponding System Data Connection
→ revoke affected Frames' current Activation
→ stop affected Frame ordinary input
→ identify affected Frames
→ assign failed outcome where required
→ drive Frames through closing / closed according to Batch E unwind
→ publish Runtime / Stack state
```

重要：

```text
Runtime failure
≠ Frame lifecycle state = failed
```

Frame `failed` 是 termination outcome；Frame Context lifecycle 仍需要通过 `closing → closed` 收敛。

Batch E 冻结具体 multi-Frame suffix-unwind。

## 17. 核心不变量

- Game Bootstrap 在 Frame 创建前启动全部 required Subsystem；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- hello 成功后 Control Connection 绑定 Descriptor Key；
- Main 拥有正常 Runtime shutdown intent；
- `stopped` 只来自 Supervisor 对实际 Process exit 的确认；
- Subsystem Control 与 Frame / Call 是独立协议域；
- 一个 Subsystem 同时最多一个有效 Runtime Container；
- 一个 Runtime Container 可以承载多个 Frame/Input Context；
- Frame 是 Main-owned call/input object；
- `frameId` Session 内唯一且不复用；
- Frame 永久绑定 `subsystemKey` 和 `callerFrameId`；
- Frame lifecycle 只有 `starting / active / suspended / closing / closed`；
- `completed / cancelled / failed` 是 outcome，不是 lifecycle state；
- Frame v1 没有 `ready / initialized / frame.status`；
- 只有 active Frame 拥有有效 Activation；
- revoked Activation 永久失效；
- 正常稳定状态只有 Stack Top active；
- Frame 不是业务状态或 Render ownership 单元；
- Main 不维护 Render Registry；
- 普通 User Input 和 Render Update 不通过 Main 转发。

## 18. 测试入口

除 Launcher / Subsystem Control 测试外，Frame Batch A 至少增加：

- frameId Session unique / never reused；
- Frame permanent `subsystemKey` assignment；
- immutable callerFrameId；
- lifecycle only `starting / active / suspended / closing / closed`；
- no Frame ready / initialized / frame.status；
- failed outcome does not replace closing / closed；
- only active Frame has currentActivationId；
- first activation unique；
- resume always gets new activation；
- revoked activation never valid again；
- stable Stack: top active / others suspended；
- no two ordinary Input Targets；
- Frame can only be created on ready Runtime without shutdown intent；
- Frame close 不修改 Render 或 Data Connection；
- Runtime failure revokes affected Activation without inventing Frame failed lifecycle state。
