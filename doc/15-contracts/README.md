# LoomRealm 正式契约目录

> 层级：正式契约  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：跨系统和对外协议的入口、版本、Profile 与迁移关系  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)  
> 最近复核：2026-08-08

契约层定义不同系统或不同实现必须共同遵守的可互操作语义。系统架构说明职责和所有权；契约冻结消息、状态、顺序、错误、failure recovery、limits、Profile和兼容性。

## 1. 当前已冻结边界

- Game Entry 一次性声明 required Subsystem Descriptor；Descriptor identity=`key`；
- Desktop v1 Launcher=`nodejs`，Game Package v2 / Node.js Launcher v1 已冻结 Entry/env/spawn/Supervisor/trust 边界；
- Subsystem Control Protocol v1 已冻结 `hello/status/shutdown`，Main拥有 shutdown intent，`stopped`只来自 Supervisor observation；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- **Frame / Call Protocol v1 已整体 Active / Normative / Frozen**；
- [Runtime Control Application Profile v1](./runtime-control-profile-v1.md) 冻结同一 Control Connection上 `Subsystem Control v1 + Frame / Call v1` 的静态组合、共享 Request-ID namespace 与 version binding；
- Frame lifecycle=`starting/active/suspended/closing/closed`，`completed/cancelled/failed`是 outcome；
- `frameId/activationId` Main-generated、Session unique、never reused；revoked Activation永久失效；
- Frame wire exactly seven JSON-RPC Requests；Caller relationship不进入 Subsystem wire；
- ordinary `frame.call` 不通过 reverse `frame.suspend` 建立 Caller suspension；
- call/return Success是 Main acceptance barrier，不表示 Child active/closed/Caller resumed；
- activate/resume ACK happens-before InputTarget publication；
- pre-commit recoverable failure可 abort，post-commit facts不 rollback；
- Frame Request finite deadline；timeout/loss ambiguous不猜、不 retry；
- Runtime failure root=live Stack中 lowest failed-runtime Frame；root..top whole suffix fixed-point unwind；
- accepted terminal outcome保留；root无 outcome使用 `SUBSYSTEM_RUNTIME_FAILED`；surviving Caller fresh-resume；
- Frame v1 冻结 JSON/identity/failure limits、Request ID profile与 sender-role deadline profile；
- Desktop text实际 bytes有 1 MiB hard cap；PWA object使用 Reference Compact JSON equivalent；
- Desktop WebSocket / PWA MessagePort 必须保持同一 Frame application semantics；
- `subsystem.hello.protocolVersions` 仍只协商 Subsystem Control；Frame v1 无独立 handshake/downgrade；
- [Frame / Call v1 Conformance Profile](./frame-call-conformance-v1.md) 定义正式兼容判断；
- Render 生命周期属于 Subsystem；Renderer⇄Subsystem 数据面拆为 Connection / Render Update / User Input；
- Content 使用独立 Readonly Content API。

## 2. Game Package v2 / Desktop Launcher

权威入口：

- [Game Package v2 Bootstrap / Descriptor Contract](./game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)。

Desktop v1：完整 Descriptor 集合先校验再产生 Process side effect；Entry安全解析在 Installation Root；Host选择 Node Runtime；`shell=false`、固定 cwd、显式 child env；Bootstrap authentication state在 spawn前建立；unexpected exit包括 code 0均为 failure；v1不自动 restart；Node executable code属于 trusted code，不宣称 OS sandbox。

绑定 Frame / Call v1 的 deployment/profile 还必须保证每个 `descriptor.key` 可作为 `targetSubsystemKey` 表示（`1..256 UTF-8 bytes`）。这是 Runtime/Frame profile约束，不改变 Game Package v2 的通用 Descriptor schema。

## 3. Subsystem Control Protocol v1

权威入口：[Main ⇄ Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)。

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

核心规则：hello成功后 Connection永久绑定 `descriptor.key`；`ready`是 Runtime status；`stopping`只在 Main-requested shutdown下合法；shutdown Response / `status(stopping)`都不等于 `stopped`；无 shutdown intent的 Control loss / Process exit是 Runtime failure；v1无 application heartbeat、same-attempt reconnect/resume、automatic restart；semantic RPC error使用 `-32000 + error.data.code`。

`subsystem.hello.protocolVersions` 只协商 Subsystem Control，不协商 Frame / Call。

## 4. Runtime Control Application Profile v1

权威入口：[Main ⇄ Subsystem Runtime Control Application Profile v1](./runtime-control-profile-v1.md)。

```text
Profile v1
├── Subsystem Control Protocol v1
└── Frame / Call Protocol v1
```

Profile静态绑定两个协议，不新增 hello/method/field。hello成功前不得执行 Frame；Runtime在该 Profile下 `ready` 表示完整承担后续 Frame v1 Subsystem角色。

因为两个协议复用同一物理 JSON-RPC Connection，同一 sender的 Control + Frame Request使用 connection-lifetime one-shot positive-safe-integer ID namespace；JSON-RPC Batch不在本 Profile使用。

Subsystem Control与Frame仍保持自己的 schema/error/deadline语义；Frame deadline不能替代 shutdown deadline。

## 5. Frame / Call Protocol v1

权威入口：[Main ⇄ Subsystem Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

```text
Protocol identity  loomrealm.frame-call
Version            1
Status             Active / Normative
Stability          Frozen
```

设计溯源 A-F 已全部 Frozen，但不是独立兼容等级。

### Wire / transaction

```text
Main → Subsystem
    frame.initialize / activate / suspend / resume / close
Subsystem → Main
    frame.call / return
```

```text
Call Acceptance
→ call Success
→ Child initialize/activate
→ activate ACK
→ publish Child InputTarget

Return Acceptance
→ return Success
→ close ACK/pop
→ Caller resume(fresh Activation) ACK
→ publish Caller InputTarget
```

### Error / recovery

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Runtime failure：failed set → lowest root → whole suffix Top→Bottom → healthy close / failed logical retire → fixed-point expansion → accepted root outcome或 `SUBSYSTEM_RUNTIME_FAILED` → fresh surviving Caller resume或 Stack empty。

### Completion profile

```text
max application message       1 MiB
max JSON depth                64
max business JsonValue        512 KiB
frameId / activationId        1..128 UTF-8 bytes
targetSubsystemKey            1..256 UTF-8 bytes
Frame Request ID              positive safe integer; shared sender/Connection namespace never reused
Frame deadlines               sender role outbound methods; 1,000..300,000 ms monotonic policy
JSON-RPC Batch                forbidden by Runtime Control Profile v1
```

Desktop sender使用 compact JSON，receiver还对实际 complete WebSocket text UTF-8 bytes做 1 MiB hard cap；PWA plain object按 Reference Compact JSON equivalent计算 whole-message size。Structured Clone不得扩大 Frame value model。

Conformance companion：[Frame / Call Protocol v1 Conformance Profile](./frame-call-conformance-v1.md)。正式 report记录 tested fixtureSetRevision。

旧 [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) 仅为 Legacy redirect。

## 6. Main ⇄ Renderer Control Protocol v1 Draft

权威草案：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)。

当前 Draft 采用：

```text
Main = authority
Renderer = read-only committed mirror
full Authority Snapshot
monotonic Session-local revision
revision gap allowed / publication may coalesce
renderer.hello + renderer.state only
reconnect = fresh current snapshot, no historical replay
```

协议继续服从 Frame v1 publication/recovery barrier：`activate/resume ACK` 后才可发布对应 InputTarget；revoked Activation 永不重新出现；normal/recovery `InputTarget=null` 合法；Renderer 不参与 Frame RPC、failure root计算或 unwind。

当前仍需重点审查 Data Grant ownership/lifecycle，以及 Renderer Control loss 对既有 Renderer⇄Subsystem Data Connection 的影响边界；因此本协议尚未 Frozen。

## 7. 当前契约状态

| 主题 | 入口 | 状态 |
|---|---|---|
| Game Package v2 | [game-package-v2.md](./game-package-v2.md) | Active / Normative；Desktop subset Frozen |
| Desktop Node.js Launcher v1 | [nodejs-launcher-profile-v1.md](./nodejs-launcher-profile-v1.md) | Active / Normative / Frozen |
| Subsystem Control v1 | [subsystem-control-lifecycle-protocol.md](./subsystem-control-lifecycle-protocol.md) | Active / Normative / Frozen |
| Runtime Control Application Profile v1 | [runtime-control-profile-v1.md](./runtime-control-profile-v1.md) | Active / Normative / Frozen |
| Frame / Call v1 | [frame-call-protocol-v1.md](./frame-call-protocol-v1.md) | **Active / Normative / Frozen** |
| Frame / Call v1 Conformance | [frame-call-conformance-v1.md](./frame-call-conformance-v1.md) | Active / Normative / Frozen |
| Main ⇄ Renderer Control v1 | [main-renderer-control-v1.md](./main-renderer-control-v1.md) | **Active Design / Draft** |
| Renderer ⇄ Subsystem Connection | 尚待新文档 | Draft target |
| User Input | 尚待新文档 | Draft target |
| Render Update | 尚待新文档 | Draft target |
| Render State | 尚待新文档 | Draft target |
| Content API | [content-api-v1.md](./content-api-v1.md) | Active / Normative |
| 旧 Frame lifecycle path | [system-lifecycle-protocol.md](./system-lifecycle-protocol.md) | Legacy / Superseded |
| Renderer–Subsystem Data v1 | [frame-data-channel-v1.md](./frame-data-channel-v1.md) | Legacy / Superseded |
| Client State Tree v1 | [client-state-tree-v1.md](./client-state-tree-v1.md) | Legacy / Superseded |

## 8. Version / Profile 规则

- 改变 Frame method/field含义、identity ownership、commit point、error classification、unwind root、Frozen limits或 ordering guarantee属于不兼容改变；
- Frame / Call v1没有 minor wire version、独立 hello或运行时 downgrade；
- Runtime Control Application Profile v1静态绑定 Control1+Frame1；
- Transport不得改变 Frame application semantics；
- `subsystem.hello.protocolVersions`只协商 Subsystem Control；
- Fixture coverage可以增加而不改变 protocol version，前提是只验证既有 v1语义；
- Renderer Control v1 当前 Draft 使用 full Snapshot + monotonic revision；Main MAY coalesce intermediate revision，但必须服从 Frame publication/recovery barrier。

## 9. 后续冻结顺序

```text
Game Package v2 / Desktop Launcher v1       Frozen
Subsystem Control v1                        Frozen
Runtime Control Application Profile v1      Frozen
Frame / Call Protocol v1                    Frozen
    ↓
Main ⇄ Renderer Control v1                  Draft / under review
    ↓
Renderer ⇄ Subsystem Connection
User Input
Render Update
Render State
```

## 10. 当前明确暂缓

PWA Launcher/credential bootstrap profile、第二 Launcher、Sandbox/Publisher Trust、automatic Runtime restart/resume/checkpoint、same-attempt reconnect、Control heartbeat、lazy/idle recycle、多 Runtime per key、remote Subsystem、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery、Frame runtime downgrade/capability negotiation。

实现不得以“优化”为由隐式加入这些语义。
