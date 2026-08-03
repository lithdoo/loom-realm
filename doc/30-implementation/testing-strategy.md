# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Content API v1](../15-contracts/content-api-v1.md)  
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
- Subsystem Control v1 不存在 application heartbeat、same-attempt reconnect / resume 或 automatic restart；
- 每个 Subsystem 一个 Runtime Container / Process / Worker；
- 一个 Container 承载 0..N Frame/Input Context；
- 一个 Container 拥有 0..N Render Context；
- Renderer 与每个 Container 最多一条 System Data Transport；
- Frame 只管理 call/input，不拥有 Render；
- Render 生命周期由 Subsystem 独立控制；
- User Input 与 Render Update 使用独立协议域和恢复语义；
- Desktop WebSocket/HTTP 与未来 PWA MessagePort/Service Worker 保持相同逻辑边界，但 PWA Launcher / Control Transport Profile 独立冻结。

## 2. 测试层次

```text
Schema / Contract Test
→ Launcher Filesystem / Process Conformance
→ State Machine Fixture
→ Module Unit Test
→ Transport Conformance Test
→ Runtime Container / Worker Interop
→ Component Integration
→ Content Golden Test
→ End-to-End Vertical Test
→ Performance / Backpressure Test
```

## 3. Contract 测试

### Game Package v2 / Desktop Launcher v1

- Descriptor Schema；
- duplicate `key`；
- initial target 引用未声明 Subsystem；
- unsupported Launcher；
- Entry absolute / traversal / URL / backslash / empty segment；
- missing / directory / unsupported extension Entry；
- symlink Entry / symlink ancestor / junction / reparse escape；
- canonical Installation containment；
- executable namespace case collision；
- `LOOMREALM_*` / `NODE_OPTIONS` / `NODE_PATH` env rejection；
- env 数量 / key / value / 总大小限制；
- Descriptor 集合失败时零业务 Process side effect；
- Host-selected Node Runtime；
- Shell interpretation impossible；
- Game Package cannot supply Node flags / argv；
- `cwd = Installation Root`；
- child environment 不无条件继承 Main 完整环境；
- Bootstrap Token 在 Process spawn 前注册；
- new Launch Attempt gets new Token；
- spawn failure / early exit revoke unconsumed Token；
- spawn success 后 public state 仍为 `starting`；
- early Process exit → Bootstrap failure；
- ready 后 exit code 0 unexpected exit → Runtime failure；
- no automatic restart；
- bounded termination / force kill。

### Subsystem Control Protocol v1

#### Hello / identity

- `subsystem.hello` Schema；
- 第一条 LoomRealm application message 不是 hello → fatal；
- Descriptor key 大小写敏感精确匹配；
- unknown key / invalid token / consumed token 在 wire 上统一为 `BOOTSTRAP_AUTHENTICATION_FAILED`；
- protocolVersions 非空、正整数、无重复、1..16 项；
- no common version → `CONTROL_PROTOCOL_UNSUPPORTED`；
- duplicate identified connection → `DUPLICATE_CONTROL_CONNECTION`；
- hello 成功后 Connection identity 固定；
- 后续 Runtime status 不携带第二份 key identity。

#### Runtime status

- `identified → ready`；
- `identified → initializing → ready`；
- `identified / initializing / ready → failed`；
- duplicate initializing / ready / stopping 为 fatal；
- `ready → initializing` 为 fatal；
- `failed → anything` 为 fatal；
- status before hello 为 fatal；
- ready missing / invalid endpoint 为 fatal；
- failed missing / invalid `error.code` 为 fatal；
- `stopped` 只来自 Supervisor observation。

#### Shutdown

- Main 在 identified / initializing / ready 建立 shutdown intent；
- shutdown intent MUST happens-before `subsystem.shutdown` send；
- `subsystem.shutdown(reason="session-end")`；
- `subsystem.shutdown(reason="bootstrap-abort")`；
- shutdown Response 只表示 accepted，不等于 stopped；
- shutdown → status(stopping) → Process exit；
- shutdown → Process 快速退出，无 stopping Notification；
- unsolicited status(stopping) → fatal Protocol Error；
- duplicate shutdown → `PROTOCOL_STATE_ERROR`，既有 termination flow 继续；
- shutdown Response / cleanup timeout → Supervisor termination escalation；
- force termination 后 Supervisor 确认 Process 不存在 → stopped；
- Supervisor 无法确认 termination → failed；
- Runtime 已 terminal failed 后 exit 不改回 stopped。

#### Connection / retry / health

- no shutdown intent + Control Connection loss → failed；
- shutdown intent + Control Connection loss → 等待 Supervisor 收敛，不立即制造第二个 failure；
- old Bootstrap Token 不可 same-attempt reconnect；
- no Control Connection resume / transparent replacement；
- state-changing Control Request 不做 application-level retry；
- Subsystem Control v1 没有 `subsystem.ping / subsystem.health`；
- WebSocket ping/pong 不进入 LoomRealm application message fixture。

#### Error / limits / security

- 标准 JSON-RPC parse/request/method/params error code；
- LoomRealm semantic error 固定 `-32000` + `error.data.code`；
- `BOOTSTRAP_AUTHENTICATION_FAILED / CONTROL_PROTOCOL_UNSUPPORTED / DUPLICATE_CONTROL_CONNECTION / PROTOCOL_STATE_ERROR` 稳定；
- max Control JSON-RPC message = 1 MiB；
- max JSON nesting depth = 64；
- token / endpoint URL / runtime error code / message limits；
- Bootstrap Token 不回显；
- PID / launchId 不作为 identity。

### Frame / Call

- initialize / activate / suspend / resume / close；
- completed / cancelled / failed；
- old Activation rejection；
- nested call；
- 同一 Subsystem 多 Frame；
- Frame close 不影响 Render / Data Connection；
- Runtime failure 调用链；
- Frame / Call 不重新定义 Runtime ready / shutdown / restart。

### Renderer–Subsystem Connection

- Main Grant authentication；
- Session / Subsystem / Connection identity；
- one active connection per Subsystem；
- reconnect / replace / revoke；
- zero Frame connection；
- protocol version / heartbeat / message limits。

这里的 heartbeat 只属于 System Data Connection Layer，不属于 Subsystem Control v1。

### User Input

- continuous intent latest/current state；
- discrete action ordering；
- input reset；
- Frame / Activation routing；
- old Activation input rejection；
- Frame A 输入不进入 Frame B；
- UI Interaction mapping 不假设 Render identity = frameId。

### Render Update

- independent Render identity；
- create / update / destroy；
- State Revision；
- Scope / Node validation；
- Event ordering / overflow；
- Render recovery；
- Frame lifecycle 不改变 Render epoch。

## 4. Bootstrap / Runtime Control 测试

Descriptor / Launcher / Control 测试必须独立于具体游戏业务：

```text
valid-entry
invalid-entry
symlink-entry
reserved-env
spawn-failure
early-exit
hello-ready
hello-invalid-key
hello-reused-token
never-ready
exit-zero-after-ready
shutdown-normal
shutdown-fast-exit
shutdown-timeout
unsolicited-stopping
control-disconnect
ignore-shutdown
runtime-failure
```

至少验证：

- 完整 Descriptor 集合先校验再产生 Process side effect；
- 多 Subsystem 可以 parallel spawn；
- Bootstrap Credential registration happens-before process execution；
- 任一 required Subsystem 无法 ready → Game Bootstrap fail；
- Bootstrap 失败后 Main 对已经启动的其他 required Runtime 建立 `bootstrap-abort` shutdown intent；
- cleanup 优先走 `subsystem.shutdown`，有限 deadline 后由 Supervisor 强制终止；
- Frame 尚不存在时全部 declared Subsystem 已 ready；
- Launcher failure 与 Control Bootstrap failure 使用不同故障来源，但最终都能收敛为 Game Bootstrap failure。

## 5. Frame / Call 互操作测试

测试 Subsystem：

```text
echo-input
nested-call
recursive-call
multi-frame-input
cancel
failure
```

至少验证：

- 栈顶限定；
- Activation 更新；
- 调用建立与业务结果分离；
- 目标 Runtime 已 ready，不因 call 再 spawn；
- 同一 Subsystem 多 Frame 复用同一 Runtime Container；
- Frame close 只删除 Frame/Input Context；
- Frame close 不关闭 System Data Transport；
- Frame close 不删除 Render；
- Runtime crash 影响其承载的全部 Frame。

## 6. Renderer–Subsystem Data Conformance

同一组 Fixture 运行在：

```text
DesktopWebSocketSystemTransport
PwaMessagePortSystemTransport
InMemorySystemTransport
```

Transport 只测试 Connection Layer 和域分发，不实现统一 Frame Stream Sequence。

同一 Transport 必须可交错承载：

```text
Render R1 updates
Render R2 events
Frame F1 input
Frame F2 input
```

验证：

- Render A 错误不污染 Render B；
- Frame F1 输入错误不污染 F2；
- User Input ordering 不重置 Render Revision；
- Render recovery 不改变 Frame Activation；
- Frame suspend / close 不关闭 Transport；
- zero-frame Render 仍可通过 Transport 更新；
- Connection reconnect 后 Input / Render 各自恢复。

## 7. Web Renderer 测试

### System Data Connection Registry

- one active connection per Subsystem；
- Grant auth / replace / close；
- zero Frame Subsystem 仍可连接；
- Frame close 不删除 connection；
- Runtime stopping / failed 后不再获得新的 Grant；
- Runtime failure 关闭对应 connection。

### Frame Input Registry

- Frame → Subsystem route；
- Activation update；
- Input Target change；
- page blur reset；
- Frame A/B input isolation；
- registry 不保存 Render State。

### Render Registry / Store

- Render create / replace / destroy；
- Render/Scope Revision；
- Snapshot 原子提交；
- Scope Replace；
- invalid Tag / duplicate Key / oversized tree；
- recovery 保留旧 Store；
- Frame pop **不删除** Render Store；
- zero-frame Render；
- one Frame close while shared Render remains；
- multiple Frames influence same Render through Subsystem business logic。

### Render Scheduler / Reconciler

- 每 rAF 最多一次昂贵提交；
- State coalescing 不丢 Event；
- Key reuse / move / destroy；
- DOM 不是恢复源；
- Frame Stack order 不作为 Render z-order；
- active Frame 不等于 only visible Render。

## 8. Main System 测试

- Descriptor Registry；
- Launcher Target Resolver；
- Node.js Launcher Dispatch；
- Launch Attempt / Bootstrap Token；
- Runtime Supervisor exit classification；
- public Runtime states declared→starting→connected→identified→ready；
- Main-owned shutdown intent → stopping → Supervisor-confirmed stopped；
- Control Connection Registry hello/status/shutdown state machine；
- semantic error envelope / wire limits；
- unexpected Control loss / Process exit failure；
- one Runtime Container per Subsystem；
- no application heartbeat / reconnect / implicit Runtime restart；
- Frame Stack / Input Target 原子一致；
- Data Grant 绑定 Subsystem/Connection，不绑定 Frame/Render；
- Runtime stopping / failed 后停止新 Data Grant；
- Renderer reconnect 根据 ready Subsystem / Grant 恢复连接；
- **不能**只按 distinct Frame Subsystem 推导 Data Connection；
- zero-frame rendering Subsystem 的 Grant 保持；
- Main 不发布 Frame visibility / Render Registry。

## 9. Content API Conformance

同一 Fixture 运行在：

```text
DesktopHttpContentService
ServiceWorkerContentService
InMemoryContentService
```

验证：

- Manifest / Record / Group / Resource；
- status code / Content-Type / ETag / Content Version；
- GET / HEAD；
- invalid installationId / namespace / key；
- URL/path traversal；
- Range Profile；
- token / Origin；
- Service Worker cold start；
- Package Index corruption；
- Content request 不读取 Frame state；
- Resource access 不因 Frame close 自动失效；
- Content API 不暴露 Launcher physical Entry。

## 10. Map Subsystem 测试

- shared Repository Cache；
- Core deterministic；
- Execution Loop serialized；
- fixed tick / catch-up limit；
- Portal Effect Barrier；
- map transition atomic commit；
- multiple Frame Input Context；
- old Activation input reject；
- shared world state 允许跨多个 Frame handler；
- Render Manager 独立于 Frame Registry；
- Frame suspend 不自动暂停 Render；
- Frame close 不自动 destroy world/hud Render；
- no-frame loading/debug Render；
- Render Projector 输出 Render State，而非 Frame Snapshot。

## 11. Golden / Fixture Test

适合 Golden Fixture：

- Game Package v2 Descriptor / Entry validity；
- Launcher error categories；
- Bootstrap Context decoder；
- Subsystem Control hello / status / shutdown / semantic errors；
- Frame/Call messages；
- Connection auth；
- User Input sequences；
- Render State / Event sequences；
- Render Tree / Scope；
- Content API Response；
- `fsdb.index.json`；
- Pokémon Essentials intermediate JSON；
- Autotile outputs；
- map Runtime Snapshot。

Filesystem fixture 需要跨 Windows / Linux/macOS 能力差异归一化测试 symlink/reparse/case collision 语义。

Golden 更新必须说明是设计变化还是回归修复。

## 12. Desktop E2E

```text
start LoomRealm Main
→ Main Control Endpoint ready
→ read Game Entry / all descriptors
→ validate complete Descriptor set
→ resolve all Launcher Entries
→ create/register Launch Attempts / Tokens
→ spawn all nodejs Subsystem Processes under Supervisor
→ hello / identified / ready for each
→ open Renderer through Hostra
→ Renderer connects Main
→ Main publishes Data Grants
→ Renderer connects each required Subsystem
→ create initial Frame/Input Context
→ User Input drives loom.map
→ loom.map publishes Render State independently
→ create second Frame without new process/data socket
→ close Frame while shared Render remains
→ Renderer reload
→ reconnect Main / Data
→ restore Input Context and Render independently
→ Main establishes session-end shutdown intent for each Runtime
→ subsystem.shutdown
→ Supervisor confirms exit / force terminates within deadline
→ stopped
```

必须另外运行失败 E2E：Entry invalid、spawn failure、early exit、never-ready、Control disconnect、unsolicited stopping、ready-after-crash、ignore-shutdown。

## 13. PWA E2E

```text
install package to OPFS
→ Service Worker control ready
→ Main Runtime Worker
→ create one Worker per declared Subsystem
→ establish Control Ports
→ all required Subsystems ready
→ Window establishes per-Subsystem Data Ports
→ Frame/Input + Render operate independently
→ page hidden / visible
→ restore Control / Data / Input / Render by their own domains
```

PWA Launcher Descriptor、Bootstrap Credential、Control Transport 与 termination observation Profile 必须冻结后再加入正式 Subsystem Control transport conformance fixture。Desktop Node.js Process fixture 不直接套用到 Worker。

## 14. 性能与背压

分别采集 User Input path 与 Render path 的 P50 / P95 / P99 / max。

背压测试包括 continuous intent、discrete burst、multi-Frame input、multi-Render update、Event burst、large Content fetch、Renderer long frame、Subsystem GC/CPU saturation。

Launcher/日志还需验证 stdout/stderr flood 不导致 Main 无限内存增长。

Subsystem Control 额外验证 oversized Control message 在达到 v1 限制时不会导致 Main 无界内存增长。

## 15. 架构回归测试

必须长期保留：

1. Descriptor 集合校验失败时不 spawn 任何业务 Process；
2. Launcher 不经 Shell 执行 Entry；
3. Bootstrap Token 在 Process spawn 前注册；
4. spawn success 不跳过 `connected / identified / ready`；
5. hello 成功后 connection-bound `descriptor.key` 不改变；
6. unsolicited status(stopping) 是 fatal Protocol Error；
7. shutdown Response / status(stopping) 不等于 stopped；
8. stopped 只来自 Supervisor termination observation；
9. 没有 shutdown intent 的 Control loss / exit code 0 是 failure；
10. Subsystem Control v1 没有 application heartbeat / same-attempt reconnect / resume；
11. Desktop v1 不自动 restart failed Runtime；
12. 创建第二个 Frame 不创建第二个 Process / Worker；
13. 创建第二个 Frame 不创建第二条 System Data Transport；
14. Frame suspend 不隐藏 Render；
15. Frame close 不销毁 Render；
16. Frame close 不清空 Render Store；
17. Render 可以在零 Frame 时创建和更新；
18. zero-frame Subsystem 可以保持 / 恢复 Data Connection；
19. Renderer 不根据 Stack order 计算 Render z-order；
20. Render recovery 不改变 Activation；
21. User Input Sequence 不充当 Render Revision；
22. Game call 不触发当前模型的 Runtime lazy spawn；
23. Hostra 不承载 LoomRealm Main 或业务 Payload。
