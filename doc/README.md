# LoomRealm 设计文档

LoomRealm 文档按依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [正式契约目录](./15-contracts/README.md)
10. [Game Package v2](./15-contracts/game-package-v2.md)
11. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
13. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
14. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
15. [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
16. [只读 Content API v1](./15-contracts/content-api-v1.md)
17. [模块设计目录](./20-modules/README.md)
18. [实施计划目录](./30-implementation/README.md)

## 当前核心结论

```text
Game Package / Desktop Launcher        Frozen
Subsystem Control v1                   Frozen
Runtime Control Application Profile v1 Frozen
Frame / Call Protocol v1               Active / Normative / Frozen
```

### Runtime Control Application Profile v1

第一阶段同一 Main ⇄ Subsystem Control Connection组合：

```text
Subsystem Control Protocol v1
+
Frame / Call Protocol v1
```

Profile静态绑定 Frame v1，不新增 runtime handshake。`subsystem.hello.protocolVersions`只协商 Subsystem Control；hello成功前无 Frame operation；Runtime在该 Profile下 ready表示完整承担 Frame v1 Subsystem角色。

同一 sender的 Control + Frame Request共享 connection-lifetime one-shot positive-safe-integer ID namespace，避免不同协议域的迟到 Response互相误匹配。

### Frame / Call v1

```text
A  identity / lifecycle / Activation
B  exact seven RPC / closed schema / FrameOutcome
C  transaction / acceptance / ACK-before-publication
D  error / timeout / no-retry / cancellation boundary
E  Runtime failure lowest-root fixed-point unwind
F  JSON/ID/limits/deadline/transport/version/conformance
```

Batch A-F 都已 Frozen；Batch标签只用于设计溯源。

正常 call：

```text
Caller active
→ Call Acceptance Commit
→ call Success
→ Child initialize/activate
→ activate ACK
→ publish Child InputTarget
```

Return：

```text
Return Acceptance Commit
→ return Success
→ close ACK/pop
→ Caller resume(fresh Activation) ACK
→ publish Caller InputTarget
```

Error：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Runtime failure：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame root
→ whole suffix Top→Bottom
→ failed logical retire / healthy close
→ fixed-point expansion
→ accepted outcome or SUBSYSTEM_RUNTIME_FAILED
→ fresh final Caller resume or empty Stack
```

Completion profile：

```text
protocol loomrealm.frame-call / 1
no JSON-RPC Batch in Runtime Control Profile v1
Request ID positive safe integer / shared sender Connection lifetime no reuse
message <=1 MiB / JSON depth <=64 / business JsonValue <=512 KiB
Desktop actual WebSocket text bytes also hard-capped at 1 MiB
identity/failure field limits
sender-role Frame deadlines 1s..5min monotonic
Desktop WebSocket / PWA MessagePort same Frame application semantics
no frame.hello/version/capabilities or runtime downgrade
```

正式兼容要求见 [Conformance Profile](./15-contracts/frame-call-conformance-v1.md)。协议已经 Frozen，但 executable fixture/harness 是否完成属于实施状态，不能从协议状态反推。

## Runtime / Frame / Render 边界

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown Response ≠ stopped
Frame outcome ≠ Frame lifecycle
Frame lifecycle ≠ Render lifecycle
```

Renderer只使用 Main已 commit current Activation/InputTarget；normal/recovery gap都可 `InputTarget=null`。Runtime failure unwind不通过 Renderer reconnect/Data resync修复。Render完全由 Subsystem独立管理。

## 文档目录

### 00 · 产品总览
- [产品设计总览](./00-overview/product-vision.md)
- [文档分层与变更规则](./00-overview/document-governance.md)

### 10 · 系统架构
- [系统架构总览](./10-architecture/system-overview.md)
- [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
- [栈式运行系统](./10-architecture/stack-runtime-system.md)
- [运行承载系统](./10-architecture/runtime-hosting-system.md)
- [通信系统](./10-architecture/communication-system.md)
- [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
- [渲染系统](./10-architecture/rendering-system.md)
- [模块子系统模型](./10-architecture/subsystem-model.md)

### 15 · 正式契约
- [正式契约目录](./15-contracts/README.md)
- [Game Package v2](./15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
- [Subsystem Control Protocol v1](./15-contracts/subsystem-control-lifecycle-protocol.md)
- [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
- [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
- [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
- [只读 Content API v1](./15-contracts/content-api-v1.md)
- [旧 Frame 生命周期草案路径（Legacy）](./15-contracts/system-lifecycle-protocol.md)

### 20 · 模块设计
- [模块设计目录](./20-modules/README.md)
- [程序主系统](./20-modules/main-system/README.md)
- [Web Renderer](./20-modules/web-renderer/README.md)
- [`loom.map`](./20-modules/loom-map/README.md)
- [Hostra Desktop](./20-modules/desktop-host/README.md)
- [PWA Host](./20-modules/pwa-host/README.md)

### 30 · 实施计划
- [实施计划目录](./30-implementation/README.md)
- [仓库与分包方案](./30-implementation/repository-layout.md)
- [测试策略](./30-implementation/testing-strategy.md)
- [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)

## ADR

- [ADR 0008 · Desktop Node.js Launcher v1](./decisions/0008-desktop-nodejs-launcher-profile-v1.md)
- [ADR 0009 · Subsystem Control v1](./decisions/0009-freeze-subsystem-control-protocol-v1.md)
- [ADR 0010 · Frame / Call Batch A](./decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)
- [ADR 0011 · Frame / Call Batch B](./decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)
- [ADR 0012 · Frame / Call Batch C](./decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)
- [ADR 0013 · Frame / Call Batch D](./decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)
- [ADR 0014 · Frame / Call Batch E](./decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)
- [ADR 0015 · Frame / Call Batch F / v1 Completion](./decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)

当前有效结论以 `00-overview`、`10-architecture`、`15-contracts` 为准；ADR保存历史决策过程。

## 当前推进状态

```text
Game Package v2 / Launcher v1           Frozen
Subsystem Control v1                    Frozen
Runtime Control Application Profile v1  Frozen
Frame / Call Protocol v1                Frozen
Frame v1 executable conformance         Implementation tracking
Main ⇄ Renderer Control                 Next protocol target
Renderer ⇄ Subsystem Connection         Draft target
User Input / Render Update              Draft target
Render State                            Draft target
```

明确暂缓：PWA Launcher/Credential/Control Port Bootstrap Profile、第二 Launcher、sandbox/Publisher Trust、automatic Runtime restart/resume、Control heartbeat/same-attempt reconnect、lazy/idle recycle、多 Runtime per key、多主栈/Frame Graph、Frame migration、Activation reuse/persistent resume、caller-driven Frame cancellation、Frame operation replay/resync、transparent partial-Runtime recovery、Frame runtime version downgrade/capability negotiation。
