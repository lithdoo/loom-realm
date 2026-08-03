# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-03

## 1. 测试目标

测试不仅验证实现正确，还用于防止下层实现破坏上层架构边界。

第一阶段重点验证：

- Game Entry 一次性声明全部 Subsystem；
- Desktop `key + nodejs + eager all-required bootstrap`；
- Launcher Entry / env / spawn / Supervisor 语义符合 v1；
- `spawn success ≠ connected ≠ identified ≠ ready`；
- Subsystem Control v1 的 hello / status / shutdown、错误 Envelope、wire limits 与 failure semantics；
- Main 拥有正常 Runtime shutdown intent，`stopped` 只来自 Supervisor observation；
- Frame / Call v1 Batch A 的 identity / authority / lifecycle / Activation 不变量；
- `failed` Frame outcome 不得替代 `closing → closed` lifecycle；
- Frame v1 不存在 `ready / initialized / frame.status`；
- revoked Activation 永久不能重新有效；
- 每个 Subsystem 一个 Runtime Container / Process / Worker；
- 一个 Container 承载 0..N Frame/Input Context；
- 一个 Container 拥有 0..N Render Context；
- Renderer 与每个 Container 最多一条 System Data Transport；
- Frame 只管理 call/input，不拥有 Render；
- Render 生命周期由 Subsystem 独立控制；
- User Input 与 Render Update 使用独立协议域和恢复语义。

## 2. 测试层次

```text
Schema / Contract Test
→ Launcher Filesystem / Process Conformance
→ Protocol State Machine Fixture
→ Module Unit Test
→ Transport Conformance Test
→ Runtime Container / Worker Interop
→ Component Integration
→ Content Golden Test
→ End-to-End Vertical Test
→ Performance / Backpressure Test
```

已经 Frozen 的 Contract 部分必须先有 fixture，再允许实现依赖。

## 3. Game Package v2 / Desktop Launcher v1

至少覆盖：

- Descriptor Schema / duplicate `key`；
- initial target 引用未声明 Subsystem；
- unsupported Launcher；
- Entry absolute / traversal / URL / backslash / empty segment；
- `.mjs / .cjs` only；
- missing / directory Entry；
- symlink / junction / reparse escape；
- canonical Installation containment；
- executable namespace case collision；
- `LOOMREALM_* / NODE_OPTIONS / NODE_PATH` rejection；
- env 数量 / key / value / 总大小限制；
- Descriptor 集合失败时零业务 Process side effect；
- Host-selected Node Runtime；
- Shell interpretation impossible；
- `cwd = Installation Root`；
- child environment 不无条件继承 Main 完整环境；
- Bootstrap Token registration happens-before Process execution；
- new Launch Attempt gets new Token；
- spawn failure / early exit revoke unconsumed Token；
- spawn success 后 public state 仍为 `starting`；
- ready 后 exit code 0 unexpected exit → Runtime failure；
- no automatic restart；
- bounded termination / force kill。

## 4. Subsystem Control Protocol v1

### Hello / identity

- 第一条 LoomRealm application message 必须是 `subsystem.hello`；
- Descriptor key 大小写敏感；
- unknown key / invalid token / consumed token wire 上统一为 `BOOTSTRAP_AUTHENTICATION_FAILED`；
- protocolVersions 非空、正整数、无重复、1..16 项；
- no common version → `CONTROL_PROTOCOL_UNSUPPORTED`；
- duplicate identified connection → `DUPLICATE_CONTROL_CONNECTION`；
- hello 成功后 Connection identity 固定；
- 后续 Runtime status 不携带第二份 key identity。

### Runtime status

- `identified → ready`；
- `identified → initializing → ready`；
- `identified / initializing / ready → failed`；
- duplicate / backward transition 为 fatal；
- status before hello 为 fatal；
- ready invalid endpoint 为 fatal；
- failed invalid error code 为 fatal；
- `stopped` 只来自 Supervisor observation。

### Shutdown

- Main 在 identified / initializing / ready 建立 shutdown intent；
- shutdown intent happens-before `subsystem.shutdown` send；
- `session-end / bootstrap-abort`；
- shutdown Response 只表示 accepted；
- shutdown → optional stopping → Process exit；
- fast exit without stopping Notification；
- unsolicited stopping → fatal；
- duplicate shutdown → `PROTOCOL_STATE_ERROR`；
- shutdown timeout → Supervisor termination escalation；
- forced termination confirmed → stopped；
- failed 后 exit 不改回 stopped。

### Connection / health / retry

- no shutdown intent + Control loss → failed；
- shutdown intent + Control loss → Supervisor 决定 terminal state；
- no same-attempt reconnect / resume；
- no application-level state-changing RPC retry；
- no `subsystem.ping / subsystem.health`；
- WebSocket ping/pong 只属于 Transport。

### Error / limits / security

- standard JSON-RPC layer errors；
- LoomRealm semantic error = `-32000 + error.data.code`；
- frozen semantic code；
- max Control message / nesting / token / endpoint / runtime error field limits；
- Bootstrap Token 不回显；
- PID / launchId 不作为 identity。

## 5. Frame / Call Protocol v1 — Batch A Conformance

Batch A 已 Frozen，因此以下 fixture 现在就是实施前置条件，而不是未来测试建议。

### 5.1 Frame identity

- `frameId` 只能由 Main 创建；
- Session 内创建大量 Frame 时 `frameId` 无重复；
- `closed` 后相同业务调用必须得到新的 `frameId`；
- Frame 创建后 `subsystemKey` 不得改变；
- Frame 不能 migrate 到另一个 Runtime；
- `callerFrameId` 创建后 immutable；
- initial Frame `callerFrameId = null`；
- PID / Worker / Connection ID / Render ID 不能替代 `frameId`；
- 新 Frame Protocol 不从 Legacy `systemId` 建立第二 ownership identity。

### 5.2 Lifecycle state model

唯一合法公共 enum：

```text
starting
active
suspended
closing
closed
```

必须显式验证：

- 不存在 `ready`；
- 不存在 `initialized`；
- 不存在 lifecycle `failed`；
- 不存在 `frame.status`；
- `closed` terminal；
- `closed → active` impossible；
- `closing → active` impossible；
- `suspended → active` 必须伴随新的 Activation；
- `starting → closing` 合法用于 abort；
- `suspended → closing` 合法用于 unwind/termination。

### 5.3 Outcome 与 lifecycle 分离

测试 Main Registry 模型：

```text
state
    starting / active / suspended / closing / closed

outcome
    null / completed / cancelled / failed
```

至少验证：

- `failed outcome` 不把 Frame state 设置成 `failed`；
- failed/cancelled/completed Frame 仍通过 `closing → closed` cleanup；
- cleanup 完成前 outcome 可以已确定，但 Frame 仍不是 `closed`；
- closed Frame tombstone 不重新成为 live Frame。

### 5.4 Activation

- `activationId` 只能由 Main 创建；
- Session 内不重复；
- `starting.currentActivationId == null`；
- `active.currentActivationId != null`；
- `suspended / closing / closed.currentActivationId == null`；
- first active gets fresh Activation；
- resume gets fresh Activation；
- suspend 前 Activation 不得在 resume 时恢复；
- revoked Activation 永久 reject；
- Frame active→closing 时旧 Activation 立即失效；
- Runtime failure 时该 Runtime 所承载 active Frame Activation 立即失效；
- Renderer / SDK 不能自行生成或替换 Activation。

### 5.5 Stack stable state

稳定态必须满足：

```text
Stack empty
OR
Stack Top = active
AND all lower live Frames = suspended
```

至少验证：

- 非栈顶 Frame 不能保持 ordinary active；
- 同时最多一个 ordinary Input Target；
- 事务中允许短暂零 active Frame；
- 任何时间不得向 Renderer 发布两个有效 ordinary Input Target。

### 5.6 Runtime precondition

新 Frame 只能建立在：

```text
Runtime observed state == ready
AND shutdownIntent == null
```

测试：

- starting Runtime reject Frame creation；
- identified-but-not-ready reject；
- stopping reject；
- failed/stopped reject；
- call 不触发 lazy spawn / restart。

### 5.7 Render / Data independence

回归测试：

- Frame starting 不自动 create Render；
- active 不自动 show Render；
- suspended 不 hide/freeze Render；
- closing/closed 不自动 destroy Render；
- Frame create/close 不创建或关闭 System Data Connection；
- zero-frame Render 仍可存在。

## 6. Frame / Call Batch B+ — Tracking Tests

这些 fixture 先作为设计目标，不应伪装成已冻结 wire conformance：

- initialize / activate / suspend / resume / close final Schema；
- frame.call / frame.return；
- nested call；
- call establishment vs business result separation；
- Activation commit barrier；
- rollback；
- timeout / no-retry；
- cancellation scope；
- multi-Frame Runtime failure suffix-unwind。

Batch B/C 每冻结一批，就把相应 fixture 从 Tracking 转成 Normative Conformance。

## 7. Renderer–Subsystem Connection

- Main Grant authentication；
- Session / Subsystem / Connection identity；
- one active connection per Subsystem；
- reconnect / replace / revoke；
- zero Frame connection；
- protocol version / heartbeat / message limits。

这里的 heartbeat 只属于 System Data Connection Layer，不属于 Subsystem Control v1。

## 8. User Input

User Input 必须继承 Frame Batch A：

```text
Frame exists
AND lifecycle == active
AND activationId == currentActivationId
AND current Main-authorized Input Target
```

至少验证：

- stale Activation rejection；
- Frame A 输入不进入 Frame B；
- suspend / resume 后旧输入拒绝；
- input reset；
- continuous intent；
- discrete action ordering；
- UI Interaction 不假设 Render identity = frameId。

## 9. Render Update / Renderer

必须长期验证：

- independent Render identity；
- create / update / destroy；
- Revision / Event / recovery；
- Frame lifecycle 不改变 Render epoch；
- Frame pop / close 不删除 Render Store；
- zero-frame Render；
- Stack order 不作为 Render z-order；
- active Frame 不等于 only visible Render。

## 10. Main System

至少验证：

- Descriptor / Launcher / Runtime Supervisor；
- public Runtime state machine；
- Control Connection Registry；
- Main-owned shutdown intent；
- one Runtime Container per Subsystem；
- Frame Registry lifecycle/outcome separation；
- frameId / activationId generator non-reuse；
- permanent Frame → subsystemKey；
- callerFrameId immutable；
- active ↔ currentActivationId invariant；
- stable Stack top-active / others-suspended；
- no two ordinary Input Targets；
- Runtime failure revokes affected Activation；
- Main 不发布 Frame visibility / Render Registry。

## 11. Map Subsystem

- shared Repository Cache；
- Core deterministic；
- Execution Loop serialized；
- multiple Frame Input Context；
- current Activation accept / old Activation reject；
- shared world state 可跨多个 Frame handler；
- Render Manager 独立于 Frame Registry；
- Frame suspend 不自动暂停 Render；
- Frame close 不自动 destroy world/hud Render；
- no-frame loading/debug Render。

## 12. Golden / Fixture

适合 Golden Fixture：

- Game Package v2 Descriptor / Entry validity；
- Launcher errors；
- Bootstrap Context decoder；
- Subsystem Control hello / status / shutdown / semantic errors；
- Frame Batch A lifecycle / identity / Activation vectors；
- 后续 Batch B Frame/Call messages；
- Connection auth；
- User Input sequences；
- Render State / Event sequences；
- Content API Response；
- `fsdb.index.json`；
- Pokémon Essentials intermediate JSON。

Golden 更新必须说明是设计变化还是回归修复。

## 13. Desktop E2E

```text
start Main
→ Bootstrap all required Runtime Containers
→ hello / identified / ready
→ open Renderer
→ establish Data Connections
→ create initial Frame
→ initial Frame gets fresh Activation
→ ordinary input accepted only for current Activation
→ create child Frame without new Process/Data socket
→ caller old Activation revoked
→ child active with new Activation
→ close/return child
→ caller receives another new Activation
→ old caller Activation remains rejected
→ close Frame while shared Render remains
→ Renderer reload
→ restore current Stack/Input state and Render independently
→ clean Runtime shutdown
```

失败 E2E 至少包括 invalid Entry、early exit、never-ready、Control disconnect、shutdown timeout、stale Activation、Frame outcome failure、Runtime failure with active Frame。

## 14. PWA E2E

PWA Launcher / Control Transport Profile 冻结后运行与 Desktop 同一组：

```text
Subsystem identity / Runtime lifecycle
Frame identity / lifecycle / Activation
User Input stale-Activation rejection
Render independence
```

Transport 差异不得改变 Batch A 语义。

## 15. 性能与背压

分别采集 User Input path 与 Render path 的 P50 / P95 / P99 / max。

背压测试包括 continuous intent、discrete burst、multi-Frame input、multi-Render update、Event burst、large Content fetch、Renderer long frame、Subsystem GC/CPU saturation。

Launcher/日志还需验证 stdout/stderr flood 不导致 Main 无限内存增长。

## 16. 架构回归测试

必须长期保留：

1. Descriptor 集合校验失败时不 spawn 任何业务 Process；
2. Bootstrap Token 在 Process spawn 前注册；
3. spawn success 不跳过 `connected / identified / ready`；
4. Desktop v1 不自动 restart failed Runtime；
5. Frame `failed` 不能成为 lifecycle state；
6. Frame v1 不出现 `ready / initialized / frame.status`；
7. closed frameId 不复用；
8. revoked activationId 不复用；
9. Caller resume 不恢复旧 Activation；
10. 正常稳定状态只有 Stack Top active；
11. 创建第二个 Frame 不创建第二个 Process / Worker；
12. 创建第二个 Frame 不创建第二条 System Data Transport；
13. Frame suspend 不隐藏 Render；
14. Frame close 不销毁 Render；
15. Render 可以在零 Frame 时创建和更新；
16. Renderer 不根据 Stack order 计算 Render z-order；
17. Render recovery 不改变 Activation；
18. User Input Sequence 不充当 Render Revision；
19. Game call 不触发当前 MVP 的 Runtime lazy spawn；
20. Hostra 不承载 LoomRealm Main 或业务 Payload。
