# `@loomrealm/subsystem` 设计草案

> 状态：Draft  
> 阶段：Package boundary / author API / host integration / implementation planning  
> 最近复核：2026-08-20  
> 目标：为业务 Subsystem 提供稳定、平台无关、协议机械细节不可见的 author SDK，并定义 Host-owned Runner 消费的最小 host integration surface。  
> 上层架构：[Subsystem 模型](../../doc/10-architecture/subsystem-model.md)  
> 正式语义：[Runtime Control Profile v1](../../doc/15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md)

核心原则：

> **业务定义只表达业务；SDK 把正式协议映射成不可绕过的 capability/control-flow；Platform Runner 注入 role-local ports；Game/Platform launch config、physical carrier 与 capability lifetime都不进入 author surface。**

---

## 1. Package Position

```text
Platform LaunchPlan selects Definition Module
        ↓
Host-owned Node/Worker Runner
        ↓
@loomrealm/subsystem/host
        ↓
@loomrealm/subsystem author surface
        ↓
Business Definition
```

Game Package只声明 Subsystem logical key；哪个 executable module实现该 key由 current Platform Launch Manifest/Plan决定。

---

## 2. Public Surface Split

Author root：

```text
@loomrealm/subsystem
    defineSubsystem
    SubsystemDefinitionFactory
    SubsystemScope
    Frame / FrameOutcome / FrameFailure
    completed / cancelled / failed
    InputListener
    RenderDomain
    ContentClient
```

Trusted integration：

```text
@loomrealm/subsystem/host
    runSubsystem
    SubsystemPlatformPorts
    RuntimeControlBinding
    SubsystemDataBinding
    SubsystemLaunchContext
```

Business package MUST NOT import `/host`。

---

## 3. Definition Module ABI

任一 Platform-planned business module必须为 ESM `.mjs`，并：

```ts
import { defineSubsystem, completed } from "@loomrealm/subsystem";

export default defineSubsystem(scope => ({
  async initialize() {},
  async frame(frame) {
    return completed(null);
  },
  async shutdown() {},
}));
```

要求：

```text
default export = SubsystemDefinitionFactory
module load != Runtime start
module path != Runtime identity
module MUST NOT read game/hostra/pwa launch manifest
module MUST NOT probe Desktop/PWA to branch business semantics
module MUST NOT open Control/Data carrier
module MUST NOT read Host bootstrap globals for portable semantics
```

Hostra/PWA MAY选择不同 build artifact；两者必须实现同一 ABI与等价 author-visible semantics。

---

## 4. Layering

```text
Business Author API
    Frame / FrameOutcome / InputListener / RenderDomain / ContentClient

Capability Managers
    FrameRegistry / InputManager / RenderManager

Protocol Planes
    RuntimeControlPlane / DataPlane

Subsystem Platform Ports
    RuntimeControlBinding / SubsystemDataBinding / ContentClient

Foundation
    MessageCarrier<string>
```

保持：Protocol Plane != physical connection；Frame != Data != Interest != Render Domain lifetime。

---

## 5. MessageCarrier Boundary

Host surface可消费 already-established：

```ts
interface MessageCarrier {
  send(message: string): void | Promise<void>;
  messages(): AsyncIterable<string>;
  readonly closed: Promise<CarrierClosed>;
  close(): void | Promise<void>;
}
```

Carrier不表达 JSON/Runtime identity/connection establishment/reconnect policy。Current Runtime Control/Data Profile application unit为 UTF-8 JSON text string。

---

## 6. Subsystem-facing Platform Ports

Runtime Control one-shot：

```ts
interface RuntimeControlBinding {
  acquire(signal?: AbortSignal): Promise<MessageCarrier>;
}
```

同一 instance最多成功 acquire一次；Control loss → Runtime failure，无 same-attempt reconnect。

Data stream：

```ts
interface SubsystemDataConnection {
  readonly generation: number;
  readonly dataProfile: string;
  readonly carrier: MessageCarrier;
}

interface SubsystemDataBinding {
  connections(signal?: AbortSignal): AsyncIterable<SubsystemDataConnection>;
}
```

SDK不创建 endpoint/ticket/Port，也不 mint generation/profile。

`ContentClient`为 platform-neutral logical client。

---

## 7. Launch Context / `runSubsystem`

```ts
interface SubsystemLaunchContext {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly number[];
}

interface SubsystemPlatformPorts {
  readonly runtimeControl: RuntimeControlBinding;
  readonly data: SubsystemDataBinding;
  readonly content: ContentClient;
}

function runSubsystem(options: {
  readonly definition: SubsystemDefinitionFactory;
  readonly platform: SubsystemPlatformPorts;
  readonly launch: SubsystemLaunchContext;
}): Promise<void>;
```

Launch Context MUST NOT包含：

```text
Game/Platform Launch Manifest
module physical/logical path
Node/Worker Runner entry
controlEndpoint / MessagePort
Data endpoint/ticket
```

这些已被 Platform adapter吸收到 Runner/bindings。

---

## 8. Runtime Startup

```text
Runner imports exact Platform-planned module
→ validates Definition Module ABI
→ create per-instance managers/scope
→ definition factory(scope)
→ acquire Runtime Control carrier
→ RuntimeControlPlane
→ subsystem.hello
→ identified
→ definition.initialize()
→ establish required local Runtime Control capabilities
→ subsystem.status(ready)
→ accept Frames
```

`ready != Data Connection exists != Renderer exists != Input/Render baseline`。

---

## 9. Per-instance Scope

不建立万能 service locator/module-global current Runtime。

```ts
interface SubsystemScope {
  readonly createInputListener: (...) => InputListener;
  readonly createRenderDomain: (...) => RenderDomain;
  readonly content: ContentClient;
  readonly signal: AbortSignal;
}
```

`signal`在 graceful shutdown intent或 Runtime-fatal transition时 abort。

---

## 10. FrameOutcome

正式 Frame v1 outcome直接成为 author result：

```ts
type FrameOutcome<T extends JsonValue = JsonValue> =
  | { readonly type: "completed"; readonly value: T }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };
```

提供 `completed(value)` / `cancelled()` / `failed(error)`，不增加第二套 outcome model。

---

## 11. Frame Capability

```ts
interface Frame<TParams extends JsonValue = JsonValue> {
  readonly id: string;
  readonly params: TParams;
  readonly signal: AbortSignal;

  call<TResult extends JsonValue = JsonValue>(
    subsystem: string,
    params: JsonValue
  ): Promise<FrameOutcome<TResult>>;
}
```

Author不见 activationId。`params`对应 initialize业务输入；User Input是独立能力。

---

## 12. Initialize / Activate

`frame.initialize`只建立 local context、store params、create branded Frame；不得启动 business handler。

首次 successful `frame.activate`安装 fresh Activation后启动 handler exactly once。

业务语义 validation在 active handler中通过 `failed(...)`表达，而不是滥用 initialize rejection。

---

## 13. `frame.call()` Semantics

Accepted call：

```text
Main commits caller suspension/revokes old Activation
→ child lifecycle
→ child terminal outcome
→ child close
→ caller fresh resume
→ SDK installs fresh Activation
→ frame.call resolves FrameOutcome
```

Child `completed/cancelled/failed`都是正常 Promise resolution。

明确 pre-commit rejection（target-not-found/unavailable）可映射 typed `FrameCallRejectedError`；确认 old Activation仍 current后释放 mutation gate，业务可 catch继续。

Runtime-fatal/ambiguous：

```text
Control loss
timeout with ambiguous commit
divergence/fatal protocol error
Runtime terminal failure
```

MUST NOT作为普通 rejection重新进入 suspended business continuation。SDK保持 mutation gate closed、abort signals、quarantine task；old Activation绝不恢复。

---

## 14. Handler Completion / Business Exception

Handler返回 FrameOutcome后，SDK先 terminalize local mutation surface，再发送 protocol `frame.return(outcome)`；author不直接调用 wire return。

ordinary uncaught business exception在 authority明确健康时 sanitize为 `failed({code:"UNHANDLED_BUSINESS_EXCEPTION",...})`。

Protocol ambiguity/SDK invariant corruption/Control loss → Runtime failure，不能降级成 Frame failed。

---

## 15. Administrative Suspend / Mutation Gate

Administrative suspend成功后 revoke local Activation、close ordinary mutation/input gate、abort `frame.signal`，late handler result必须 discard。

Child-call suspension不是 administrative suspend，也不 abort `frame.signal`。

pending call/return/suspend/close/Runtime terminal都会关闭 commit-sensitive mutation gate。

---

## 16. Input Manager

InputListener是 Frame-bound capability。SDK维护 local desired `InterestRegistry = Map<frameId, Set<channel>>`，聚合多个 listener contribution。

Receive gate至少要求：current Data、local Frame active、current Activation、channel in Interest、mutation gate open。

fresh Activation可复用 Interest config但不复用 old State/Event；fresh Data remote registry/state empty，SDK重新发布 full desired registry。

---

## 17. Render Manager

RenderDomain由 SDK mint protocol domainId；business name不是 lifecycle identity。

Domain独立于 Frame/Data carrier：

```text
Frame close != Domain destroy
Frame suspend != Domain hide
Data retire != authoritative Domain destroy
```

fresh Data carrier重新发布 Domain Registry + fresh Snapshots，再继续 Patch/Event。

---

## 18. DataPlane

唯一 current Data carrier由一个 DataPlane reader消费并 demux `input.*` / `render.*`。Input/Render不得竞争读取 raw carrier。

same S/G/P sequential reconnect可重建 wire child state，但不重建 business capability objects。

---

## 19. Runtime Terminal

first terminal cause：graceful Main shutdown或 Runtime failure。

SDK先 abort scoped signals，再执行 bounded `shutdown()` OR `failed(error)` terminal hook；同一 instance不重复两个 hooks。

Runtime terminal后不自行恢复 old Activation/Frame stack。

---

## 20. Platform Launch Isolation

业务 author surface不得获得：

```text
game.json raw config
launch.hostra.json
launch.pwa.json
Hostra/PWA module path
resolved filesystem path/URL
Runner entry
Platform credential/policy
```

如果业务需要跨平台配置，应使用 Game Entry `initial.input`、Frame params、Readonly Content或 Subsystem-owned business data。

---

## 21. Tests

至少：

```text
definition-module-default-export
platform-selected-module-does-not-affect-author-surface
initialize-not-start-handler
activate-starts-once
FrameOutcome mapping
recoverable call rejection preserves Activation
runtime-fatal no continuation reentry
business exception vs Runtime failure
administrative suspend late result discard
Input Interest/reconnect
Render Domain/reconnect
one DataPlane reader
Game/Platform launch config unavailable to business
Hostra/PWA artifact-specific runs produce equivalent author-visible trace
```

---

## 22. Final Invariants

1. Game Package key与 executable module选择分离；
2. Definition Module由 Platform LaunchPlan选择，但业务 ABI统一；
3. author root不暴露 Platform/launch/carrier mechanics；
4. host surface是 trusted Runner integration；
5. Control one-shot，Data可 sequential reconnect；
6. initialize只建 Context，activate后才启动 handler；
7. FrameOutcome与 protocol三态一一对应；
8. Runtime-fatal绝不重新进入 business continuation；
9. business exception与 protocol corruption分域；
10. Input Interest Frame-scoped；
11. Render Domain独立于 Frame/Data carrier；
12. fresh Data child state重新 baseline；
13. one DataPlane统一 demux；
14. Hostra/PWA artifact可不同，但 author-level semantics必须等价。
