# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-02

## 1. 测试目标

测试不仅验证实现正确，还用于防止下层实现破坏上层架构边界。

第一阶段重点验证：

- Game Entry 一次性声明全部 Subsystem；
- Desktop MVP `key + nodejs + eager all-required bootstrap`；
- `connected ≠ identified ≠ ready`；
- 每个 Subsystem 一个 Runtime Container / Process / Worker；
- 一个 Container 承载 0..N Frame/Input Context；
- 一个 Container 拥有 0..N Render Context；
- Renderer 与每个 Container 最多一条 System Data Transport；
- Frame 只管理 call/input，不拥有 Render；
- Render 生命周期由 Subsystem 独立控制；
- User Input 与 Render Update 使用独立协议域和恢复语义；
- Desktop WebSocket/HTTP 与 PWA MessagePort/Service Worker 保持相同逻辑边界。

## 2. 测试层次

```text
Schema / Contract Test
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

### Subsystem Control v1

- `subsystem.hello` Schema；
- Descriptor key mismatch；
- invalid / reused Bootstrap Token；
- protocol version negotiation；
- hello 成功后 Connection identity 固定；
- `initializing / ready / stopping / failed` 合法状态转换；
- duplicate / backward status 为 fatal；
- `stopped` 只来自 Supervisor observation；
- `ready` 不重新声明 identity。

### Frame / Call

- initialize / activate / suspend / resume / close；
- completed / cancelled / failed；
- old Activation rejection；
- nested call；
- 同一 Subsystem 多 Frame；
- Frame close 不影响 Render / Data Connection；
- Runtime failure 调用链。

### Renderer–Subsystem Connection

- Main Grant authentication；
- Session / Subsystem / Connection identity；
- one active connection per Subsystem；
- reconnect / replace / revoke；
- zero Frame connection；
- protocol version / heartbeat / message limits。

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

## 4. Bootstrap 测试

测试 Game Entry / Descriptor：

- duplicate `key`；
- unsupported Launcher；
- initial target 引用未声明 Subsystem；
- descriptor env 覆盖保留字段；
- 多 Subsystem parallel spawn；
- 任一 required Subsystem 无法 ready → Game Bootstrap fail；
- Frame 尚不存在时全部 declared Subsystem 已 ready；
- `launcher.entry` 安全规则冻结后加入路径逃逸 / link / absolute URL fixture。

测试最小 Subsystem：

```text
hello-ready
hello-invalid-key
hello-reused-token
never-ready
runtime-failure
```

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
- Node.js Launcher Dispatch；
- Launch Attempt / Bootstrap Token；
- Runtime states declared→starting→connected→identified→ready；
- one Runtime Container per Subsystem；
- Frame Stack / Input Target 原子一致；
- Data Grant 绑定 Subsystem/Connection，不绑定 Frame/Render；
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
- Resource access 不因 Frame close 自动失效。

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

## 11. Golden Test

适合 Golden Fixture：

- Control Protocol hello/status；
- Frame/Call messages；
- Connection auth；
- User Input sequences；
- Render State / Event sequences；
- Render Tree / Scope；
- Content API Response；
- `fsdb.index.json`；
- Game Package v2 Descriptor；
- Pokémon Essentials intermediate JSON；
- Autotile outputs；
- map Runtime Snapshot。

Golden 更新必须说明是设计变化还是回归修复。

## 12. Desktop E2E

```text
start LoomRealm Main
→ Main Control Endpoint ready
→ read Game Entry / all descriptors
→ spawn all nodejs Subsystem Processes
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
→ clean shutdown
```

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

PWA Launcher Descriptor mapping 必须在该 Profile 冻结后加入互操作 Fixture。

## 14. 性能与背压

分别采集：

```text
User Input path
    capture → normalize → transport → Frame Input Handler → business commit

Render path
    business commit → projection → transport → Render Store → rAF presentation
```

记录 P50 / P95 / P99 / max。

背压测试：

- 高频 continuous intent；
- discrete action burst；
- multiple Frame input interleave；
- multiple Render update interleave；
- one Render flood must not starve other domains；
- Event burst；
- large Content fetch；
- Renderer long frame；
- Subsystem GC / CPU saturation。

## 15. 架构回归测试

必须长期保留以下“禁止回退”测试：

1. 创建第二个 Frame 不创建第二个 Process / Worker；
2. 创建第二个 Frame 不创建第二条 System Data Transport；
3. Frame suspend 不隐藏 Render；
4. Frame close 不销毁 Render；
5. Frame close 不清空 Render Store；
6. Render 可以在零 Frame 时创建和更新；
7. zero-frame Subsystem 可以保持 / 恢复 Data Connection；
8. Renderer 不根据 Stack order 计算 Render z-order；
9. Render recovery 不改变 Activation；
10. User Input Sequence 不充当 Render Revision；
11. Game call 不触发当前 MVP 的 Runtime lazy spawn；
12. Hostra 不承载 LoomRealm Main 或业务 Payload。