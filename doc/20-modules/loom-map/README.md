# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Phase 1 地图 Subsystem business module；作为 `@loomrealm/subsystem` 的普通 platform-neutral Definition Module consumer  
> 依赖：[Subsystem 模型](../../10-architecture/subsystem-model.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

核心原则：

> **`loom.map` 只实现地图业务；同一个 `.mjs` Subsystem Definition Module 由 Hostra Node Runner 与 PWA Worker Runner加载，不含任何平台/协议机械分支。**

---

## 1. Module Shape

```text
loom.map
├── default SubsystemDefinitionFactory export
├── Runtime-level business state
├── Frame handlers / coordinators
├── Catalog / Repositories
├── World state
├── Input consumers
├── Render projectors
└── Pokémon Essentials compatibility compiler
```

不实现：

```text
Control/Data carrier
JSON-RPC dispatcher/request id
Activation bookkeeping
mutation gate
timeout/failure ambiguity
Platform provisioning
Interest wire publication
Render wire publication
WebSocket/MessagePort
Process/Worker bootstrap
```

---

## 2. Definition Module ABI

```ts
import {
  defineSubsystem,
  completed,
  cancelled,
  failed,
} from "@loomrealm/subsystem";

export default defineSubsystem(({
  createInputListener,
  createRenderDomain,
  content,
  signal,
}) => ({
  async initialize() {
    // load map-level shared business state
  },

  async frame(frame) {
    // business logic
    return completed(null);
  },

  async shutdown() {
    // bounded business cleanup
  },
}));
```

Default export就是 Game Package `descriptor.module` 所声明 Definition Module 的 ABI。

Definition Module加载本身不启动 Runtime，也不读取 Platform bootstrap。

---

## 3. Frame Params / Outcome

业务参数：

```text
frame.params
```

不是 User Input。

Frame handler必须显式返回：

```text
completed(value)
cancelled()
failed(error)
```

而不是依赖“普通 JS resolve/reject自动猜 terminal meaning”。

例如：

```ts
async frame(frame) {
  const battle = await frame.call("loom.battle", {
    enemy: "pikachu",
  });

  switch (battle.type) {
    case "completed":
      applyBattleResult(battle.value);
      return completed(null);

    case "cancelled":
      return cancelled();

    case "failed":
      return failed(battle.error);
  }
}
```

Child `cancelled/failed` 是业务 Outcome，`frame.call()` 正常 resolve它们。

---

## 4. Call Error Boundary

业务 MAY捕获的 call rejection只代表明确 **pre-commit** 可恢复失败，例如目标不存在/当前不可用：

```ts
try {
  const outcome = await frame.call(...);
} catch (error) {
  // only typed recoverable call rejection
  // current Frame/Activation still valid
}
```

Runtime-fatal/ambiguous：

```text
Control loss
Frame request timeout/loss with unknown commit
divergence/protocol fatal
```

不会作为普通 catchable rejection重新进入 map continuation。

因此地图业务永远不会在“旧 Activation是否已撤销未知”的情况下继续修改 world state。

---

## 5. Business Exception

地图 Frame handler普通未捕获异常，在 Runtime/Frame authority仍明确健康时由 SDK sanitize为：

```text
FrameOutcome.failed
```

协议 corruption/Control ambiguity则是 Runtime failure。

所以业务可以把“地图脚本失败”和“Runtime控制面已经不可证明”视为两个不同 failure domain。

---

## 6. Input Consumer

```ts
const input = createInputListener({
  frame,
  channels: [
    "keyboard.event",
    "pointer.state",
    "x.map.interact.event",
  ],
});
```

SDK内部：

```text
Frame owner validation
Interest[F] aggregation/publication
current Activation receive gate
mutation gate
current Data carrier/profile
fresh carrier republish
stale/in-flight input drop
```

业务不接触 `frameId + activationId` wire gate。

---

## 7. Input Across Call/Resume

```text
F/A1 active
Interest[F] registered
→ accepted child call
→ F suspended / A1 revoked
→ listener + Interest[F] remain
→ child completes
→ F resumes fresh A2
→ same listener/config can become effective
```

旧 A1 Input State/Event绝不迁移到 A2。

fresh Data carrier：

```text
remote Interest Registry empty
SDK republishes current local desired registry
```

业务不重新 subscribe。

---

## 8. Custom Map Input

可使用：

```text
x.map.interact.event
x.map.pointer-tile.state
```

仍满足：

```text
Main InputTarget
× Interest[F]
× Producer
× current matching Data
```

DOM/OS/device mapping属于 Renderer/Platform implementation。

---

## 9. Render Domains

```ts
const world = createRenderDomain({ name: "world", zIndex: 0 });
const hud = createRenderDomain({ name: "hud", zIndex: 100 });

world.set(buildWorldState());
hud.set(buildHudState());
```

SDK mint protocol `domainId`；业务 `name`不是 protocol lifecycle identity。

业务只表达：

```text
desired authoritative tree
transient presentation event
explicit Domain close
```

SDK负责 Registry/Snapshot/Patch/Event、revision、fresh-carrier baseline。

---

## 10. Frame / Render / Data Independence

```text
Frame close != Domain destroy
Frame suspend != Domain hide
Activation change != Domain lifecycle
Runtime ready != Data current
Data retire != authoritative Domain destroy
```

如果 world/hud应与某业务 scope同生共死，由 map显式 close，不由 Frame protocol猜测。

---

## 11. Content

地图只使用 logical ContentClient读取：

```text
maps
tilesets
characters
autotiles
metadata/resources
```

不知道底层是 Desktop HTTP/filesystem还是 PWA Fetch/SW/OPFS。

Compatibility compiler只负责来源格式→map logical data，不改变 Content/Platform boundary。

---

## 12. Cancellation / Signals

`scope.signal` 用于 Runtime-level task；`frame.signal` 用于 Frame-scoped task。

normal child-call suspension不会 abort `frame.signal`；administrative suspend/close/Runtime terminal会 abort。

业务 SHOULD用 signal取消 timer/async work，但 correctness不依赖业务及时响应；SDK会阻止 terminal Frame上的 late return/mutation进入 wire。

---

## 13. Platform Independence

依赖：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

不直接依赖：

```text
@loomrealm/subsystem/host
runtime-control/data internals
transport-websocket/messageport
launcher/Runner package
Hostra/Worker APIs
```

同一 module：

```text
apps/desktop Runner ─┐
                     ├→ descriptor.module
apps/pwa Runner ─────┘
```

---

## 14. Tests

至少：

```text
definition-module-default-export
frame-params
completed/cancelled/failed-outcomes
nested-call-completed-continuation
nested-call-cancelled-business-path
nested-call-failed-business-path
recoverable-call-rejection-can-be-handled
runtime-fatal-does-not-reenter-map-continuation
business-exception-becomes-frame-failed

input-listener-survives-child-call-resume
fresh-activation-no-old-input-state
new-frame-waits-own-interest
custom-channel-frame-scope
fresh-data-reconnect-hidden-from-business

zero-frame-render-domain
multi-domain-map-render
frame-close-does-not-destroy-unrelated-domain
render-reconnect-hidden-from-business
content-results-platform-independent
same-definition-trace-hostra-pwa
```

协议 conformance由 capability packages负责，不在 map复制。

---

## 15. Forbidden Old Models

```text
map implements Control/Frame JSON-RPC
map opens WebSocket/MessagePort
map sees Platform provisioning
runtime.input/runtime.render service locator
Frame.input used for business params
Runtime-global Input Interest
frame.call returns raw child value without Outcome
catchable Runtime-fatal continuation
Activation reuse
Frame close = Render destroy
Data reconnect = Frame recovery
platform-specific business branches
```

---

## 16. Final Goal

> **`loom.map` 证明一个真正普通的业务 Subsystem：只依赖统一 author SDK，同一个 Definition Module 在 Hostra Desktop 与 PWA 上得到相同业务语义，而所有 Frame authority、Data reconnect、Platform provisioning 和 wire mechanics 都留在正确的下层。**