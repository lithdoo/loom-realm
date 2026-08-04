# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 的内部模块边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

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
├── Activation Registry
├── Frame Stack Controller
├── Frame / Call Coordinator
├── Renderer Control Publisher
├── System Data Connection Authority
└── Content Grant Authority
```

## 2. Game Package Bootstrap

负责读取 Manifest / Entry / initial target 与全部 Subsystem Descriptor，在产生任何业务 Process side effect 前完成 Descriptor Schema、duplicate `key`、Launcher、Entry 与 env 集合级校验并建立 Descriptor Registry。

不负责解释 Subsystem 业务输入，不根据 Legacy `systemId` 猜 Provider，也不把首次 Frame 调用当 Runtime 启动触发器。

## 3. Subsystem Descriptor Registry

```ts
interface SubsystemDescriptorRecord {
  readonly key: string;
  readonly launcherType: "nodejs";
  readonly entry: string;
  readonly env: Readonly<Record<string, string>>;
}
```

当前所有 Descriptor eager / required；`key` 唯一且大小写敏感；Desktop 只接受 `nodejs`。

Registry 保存逻辑 Descriptor，不保存 Process Handle、物理 Entry 或 Render Registry。

## 4. Launcher Target Resolver / Dispatcher

Resolver 实现 Game Package v2 与 Node.js Launcher Profile v1：

```text
logical entry
→ resolve against trusted Installation Root
→ reject redirect / escape
→ verify regular file
→ canonical containment
→ ResolvedLauncherTarget
```

Launcher 只接受已验证目标，使用 Host-selected Node.js，`shell=false`、`cwd=Installation Root`、显式 child environment，不接受 Game-supplied Node executable / flags / argv。

## 5. Launch Attempt Registry

```ts
interface LaunchAttemptRecord {
  readonly launchId: string;
  readonly subsystemKey: string;
  readonly target: ResolvedLauncherTarget;
  readonly bootstrapToken: string;
  readonly state: "prepared" | "spawning" | "supervised" | "exited" | "failed";
}
```

每次 Launch Attempt 使用新 Token；Token 必须在 Process spawn 前注册；spawn/early-exit/cancel 时 revoke 未 consumed Token。`launchId`、PID、Process Handle 不是协议 identity。

## 6. Runtime Container Registry

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

```text
spawn success          → still starting
Control accepted       → connected
hello accepted         → identified
status(ready) accepted → ready
Main shutdown intent   → stopping
Supervisor expected exit → stopped
unexpected loss/failure  → failed
```

Runtime self-report 与 Main-observed state 必须分开；`stopped` 只来自 Supervisor observation。

## 7. Runtime Supervisor

Desktop Supervisor 持有 Process Handle，监听 spawn/exit/signal，区分 expected/unexpected exit，执行有限 graceful deadline 与强制终止。

冻结语义：

- ready 前退出 → Game Bootstrap failure；
- ready 后、无 shutdown intent 的任何退出 → Runtime failure；
- exit code 0 不表示正常；
- shutdown intent 下确认 Runtime 不存在 → `stopped`；
- terminal `failed` 不因后续 exit 改回 `stopped`；
- v1 不自动 restart。

## 8. Control Connection Registry

实现 Frozen Subsystem Control Protocol v1：

```text
connected
→ subsystem.hello
→ identified
→ subsystem.status(initializing?)
→ subsystem.status(ready)

normal termination:
Main shutdown intent
→ subsystem.shutdown(reason)
→ subsystem.status(stopping) [optional]
→ Supervisor confirms exit
→ stopped
```

职责包括 Bootstrap Credential/version/identity 校验、Runtime status state machine、shutdown intent、semantic error envelope、wire limits 与 connection-loss failure handling。

它还向 Frame / Call Protocol 提供已经认证且 connection-bound `descriptor.key` 的物理 Control Connection。

Subsystem Control v1 无 application heartbeat、same-attempt reconnect / resume 或 automatic restart。

## 9. Frame Registry

Frame / Call Protocol v1 Batch A/B 已冻结 Frame identity/lifecycle/Activation 与 wire Outcome。

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | {
      readonly type: "failed";
      readonly error: {
        readonly code: string;
        readonly message?: string;
        readonly data?: JsonValue;
      };
    };

interface FrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  state: FrameLifecycleState;
  currentActivationId: string | null;
  outcome: FrameOutcome | null;
}
```

Registry 必须保证：

```text
frameId       Main-generated / Session unique / never reused
subsystemKey  permanent descriptor.key assignment
callerFrameId Main-owned / immutable
active        currentActivationId != null
other states  currentActivationId == null
```

不得使用 `status=failed` 代替 cleanup lifecycle，不得加入 Frame `ready/initialized`，不得复用 frameId/Activation，也不得保存 Render/Data Transport 作为 Frame-owned state。

## 10. Activation Registry

Main 是 Activation 唯一签发方。

每次 Frame first active 或 suspended Frame 被恢复时都创建新的 Session-unique `activationId`。

```text
Activation never rolls back.
Activation never resumes.
Revoked Activation never becomes valid again.
```

Frame 离开 `active` 时，旧 Activation 必须 revoke。

## 11. Frame / Call RPC Adapter

Batch B 冻结的完整 wire surface：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

全部是 JSON-RPC Request，params/result 使用 closed schema。

Main Adapter MUST NOT：

- 接受 `system.call / system.return` 作为 v1 方法；
- 在 `frame.initialize` 或 `frame.return` wire 中要求 `callerFrameId`；
- 在 Main→Subsystem RPC 中重复 source `systemId / subsystemKey`；
- 给 `frame.close` 增加实现私有 reason；
- 增加独立 `frame.result`；
- 把 `FrameOutcome.failed` 当 JSON-RPC Error；
- 把无业务返回值编码为缺失 `completed.value`，必须使用 `null`。

结构性 Schema 错误使用 JSON-RPC `-32602`；稳定 semantic error 与 fatal/local policy 等 Batch D。

## 12. Frame Stack Controller / Call Coordinator

Frame Stack Controller：

- 持有 Main-owned 单一 LIFO Stack；
- 稳定状态 Stack Top = `active`，其他 live Frame = `suspended`；
- 只有当前 active Stack Top 可 ordinary `frame.call / frame.return`；
- 维护 Stack Revision 与 Input Target；
- 串行提交栈变化；
- 事务期间允许短暂零 active Frame；
- MUST NOT 发布两个 ordinary Input Target；
- 不发布 Render visibility / z-order。

Call Coordinator 只能在 ready 且无 shutdown intent 的 Runtime 上建立 Frame。

Batch B 已确定局部操作语义：

```text
frame.initialize  create target-side Frame Context
frame.activate    install first Activation
frame.suspend     revoke current Activation
frame.resume      deliver Child Outcome + install replacement Activation
frame.close       delete target-side Frame Context
frame.call        request creation of Child call
frame.return      submit terminal FrameOutcome
```

特别：

- `callerFrameId` 只留在 Main Registry，不复制到 Subsystem wire；
- `frame.return` 的 receiver 由 Main Registry 决定；
- `frame.call` success 只返回 `childFrameId`，不是 Child 最终业务结果；
- Child 最终结果沿 `frame.return → Main → frame.resume` 交付；
- `frame.resume` 不拆成 resume + activate 两步。

Batch C 继续冻结 RPC 之间的精确事务顺序、commit barrier 与 rollback，不得修改上述 wire fields。

## 13. Renderer Control Publisher

发布 Session / Runtime State、Frame Stack、Frame lifecycle 只读镜像、current Activation/Input Target、Data Grant/revoke/replace。

不发布 Frame visibility、Render Registry、Render z-order 或 Frame→Render ownership。

Batch C 将冻结 `frame.activate / frame.resume` 与 Input Target publish 的 happens-before barrier；在此之前实现不得自行选择会改变语义的顺序。

## 14. System Data Connection Authority

- 每 Subsystem 最多一条有效 Renderer Data Connection；
- Grant 不绑定 `frameId / activationId / Render identity`；
- Runtime stopping/failed 后停止新 Grant；
- Frame create/suspend/resume/close 不隐式创建或关闭 Data Connection；
- Main 不读取 User Input 或 Render Update Payload。

## 15. Runtime Failure Coordination

```text
Runtime failure / unexpected loss
→ revoke affected current Activations
→ stop ordinary input
→ identify affected Frames
→ assign failed outcome where required
→ drive lifecycle through closing / closed
→ publish Runtime / Stack state
```

`Runtime failure ≠ Frame lifecycle state = failed`。

Batch E 冻结具体 multi-Frame suffix-unwind；Renderer Render Store 不是 Frame cleanup 或业务恢复源。

## 16. 核心不变量

- Runtime bootstrap 在 Frame 前完成；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Subsystem Control 与 Frame / Call 是独立协议域；
- Frame 是 Main-owned call/input object；
- Frame lifecycle = `starting / active / suspended / closing / closed`；
- outcome = `completed / cancelled / failed`；
- only active Frame has valid Activation；
- revoked Activation 永久失效；
- Batch B wire surface exactly seven JSON-RPC Requests；
- Caller relationship 不下发给 Subsystem；
- `frame.call` 非 long-running result RPC；
- `frame.resume` 同时交付 outcome + replacement Activation；
- Frame 不拥有 Render/Data Connection；
- Main 不维护 Render Registry；
- ordinary User Input / Render Update 不通过 Main 转发。

## 17. 测试入口

除 Launcher / Subsystem Control 与 Batch A fixture 外，Batch B 至少验证：

- exact seven method names / directions；
- all seven are JSON-RPC Request；
- closed params/result schema；
- `frame.initialize` has exactly `frameId + input`，无 `callerFrameId`；
- `frame.activate` only accepts new Activation on starting Frame；
- `frame.suspend` carries current Activation；
- `frame.resume` carries new Activation + `returnedFrameId + result`；
- `frame.close` only carries `frameId`；
- `frame.call` uses `targetSubsystemKey` and returns `childFrameId`；
- same-Subsystem call 仍产生新 childFrameId；
- `frame.return` 无 caller/target identity；
- completed outcome requires `value`，no-value uses `null`；
- `FrameOutcome.failed` is not JSON-RPC Error；
- `system.call / system.return / frame.result / frame.close(reason)` rejected；
- structural invalid params → JSON-RPC `-32602`。
