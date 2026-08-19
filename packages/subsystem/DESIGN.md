# `@loomrealm/subsystem` 设计草案

> 状态：Draft  
> 阶段：Package boundary / developer experience / implementation planning  
> 目标：为 LoomRealm 业务 Subsystem 提供稳定、平台无关、协议细节不可见的 author-facing SDK。  
> 核心原则：**业务作者表达生命周期反应与 capability 调用；SDK 负责把这些意图转换成正确的 LoomRealm 协议行为。**

---

## 1. 为什么存在这个包

LoomRealm 的业务 Subsystem（例如 `loom.map`、`loom.battle`、`loom.menu`）不应各自重复实现：

```text
Subsystem Control bootstrap
Runtime Control dispatcher
JSON-RPC request / response correlation
request ID allocator
Frame / Call wire schema
Activation 管理
mutation gate
deadline / timeout
Control / Frame protocol error mapping
Data Connection lifecycle
User Input gate
Render Update wire publication
Content transport/client binding
WebSocket / MessagePort 差异
```

这些属于协议与运行基础设施，而不是地图、战斗或菜单业务。

因此 `@loomrealm/subsystem` 是业务作者的默认入口：

```text
@loomrealm/map
@loomrealm/battle
@loomrealm/menu
        ↓
@loomrealm/subsystem
        ↓
@loomrealm/runtime-control
@loomrealm/data
@loomrealm/content
        ↓
@loomrealm/wire + @loomrealm/foundation
```

业务 Subsystem SHOULD NOT 直接依赖 `@loomrealm/runtime-control`、`@loomrealm/wire` 或平台 transport adapter。

---

## 2. 设计目标

业务作者应该只关心：

```text
Runtime 什么时候启动/关闭
什么时候收到一个 Frame
当前 Frame 的业务 input 是什么
什么时候有普通输入事件
调用另一个 Subsystem
结束当前 Frame 并返回结果
发布 Render State
读取 Content
```

理想业务代码：

```ts
import { defineSubsystem } from "@loomrealm/subsystem";

export default defineSubsystem({
  async initialize(runtime) {
    // 加载 Runtime 级共享状态
  },

  async frame(frame) {
    const result = await frame.call("loom.battle", {
      enemy: "pikachu"
    });

    await frame.return(result);
  },

  async shutdown() {
    // bounded cleanup
  }
});
```

业务代码中默认不出现：

```text
JSON-RPC
requestId
MessageCarrier
WebSocket
MessagePort
bootstrapToken
protocolVersions
subsystem.hello
subsystem.status
frame.initialize
frame.activate
frame.resume
activationId 的手工管理
```

---

## 3. 分层边界

```text
业务代码
loom.map / loom.battle / loom.menu
        │
        │ lifecycle hooks / events / capability calls
        ▼
@loomrealm/subsystem
        │
        │ typed protocol operations
        ▼
@loomrealm/runtime-control / @loomrealm/data / @loomrealm/content
        │
        ▼
@loomrealm/wire + @loomrealm/foundation
        │
        ▼
MessageCarrier
        │
        ├─ WebSocket adapter (Desktop)
        └─ MessagePort adapter (PWA)
```

`@loomrealm/subsystem` 可以理解协议，但 public author API 不暴露协议机械细节。

本包不得拥有 Main 的公共 authority：

```text
不得创建公共 frameId
不得创建公共 activationId
不得决定 Stack
不得决定 callerFrameId
不得决定 InputTarget
不得选择 Runtime failure unwind root
不得把旧 Activation 恢复为有效
```

这些仍由 Main 与正式协议决定。

---

## 4. 核心 public API 模型

第一阶段只冻结最小开发体验，不预先设计完整游戏框架。

### 4.1 `defineSubsystem`

候选：

```ts
export interface SubsystemDefinition {
  initialize?(runtime: SubsystemRuntime): void | Promise<void>;
  frame(frame: Frame): void | Promise<void>;
  shutdown?(event: ShutdownEvent): void | Promise<void>;
  failed?(error: RuntimeFailure): void | Promise<void>;
}

export function defineSubsystem(
  definition: SubsystemDefinition
): SubsystemDefinition;
```

精确签名在实现时冻结。

主生命周期优先使用 typed hook，而不是把 wire method 名机械映射成字符串 EventEmitter。

### 4.2 `SubsystemRuntime`

`SubsystemRuntime` 表示整个 Runtime Container 的 author-facing capability，而不是单个 Frame。

候选：

```ts
export interface SubsystemRuntime {
  readonly frames: ReadonlyFrameRegistry;

  readonly content: ContentClient;
  readonly render: RenderService;

  on(
    event: "shutdown",
    handler: (event: ShutdownEvent) => void | Promise<void>
  ): Unsubscribe;
}
```

第一阶段可以只实现 Runtime/Frame 所需最小部分；`content` / `render` 在对应 capability 落地后再接入。

---

## 5. `Frame` 是 capability object

业务作者不应调用：

```ts
runtime.call(frameId, activationId, target, input)
```

而应拿到一个已经绑定本地 Frame Context 的对象：

```ts
export interface Frame {
  readonly id: string;
  readonly input: JsonValue;

  call(
    subsystem: string,
    input: JsonValue
  ): Promise<FrameOutcome>;

  return(
    value: JsonValue
  ): Promise<never>;
}
```

精确泛型、`FrameOutcome` ergonomics 与 error surface 在实现阶段根据真实业务需求收敛。

### 5.1 为什么不公开 `activationId`

Activation 是协议 authority epoch，由 SDK 内部 Frame Context 持有。

业务代码不应：

```text
缓存旧 activationId
自行传递 activationId
跨 continuation 复用 activationId
构造 resume context
```

SDK 内部维护：

```text
Frame Context
    current Activation A1
        ↓ frame.call()
    A1 revoked / mutation gate held
        ↓ child return / frame.resume
    install fresh Activation A2
        ↓
    resolve frame.call() Promise
```

从而业务代码天然无法错误复用 revoked Activation。

---

## 6. `frame.call()` 的高层语义

业务：

```ts
const result = await frame.call("loom.battle", input);
```

底层可能经历：

```text
frame.call Request
→ Main accepts call
→ caller suspended
→ child Frame created
→ child initialize
→ child activate
→ child frame.return
→ child close
→ caller frame.resume with fresh Activation
→ SDK installs fresh local Activation
→ Promise resolves
```

业务作者只看到一个普通 async call。

因此普通 child-call resume SHOULD NOT 要求业务作者监听 `frame.resume` 事件。

`frame.resume` 是协议 continuation primitive，不是默认业务事件。

---

## 7. `frame.return()` 的高层语义

候选：

```ts
await frame.return(value);
```

成功 return 后当前普通业务 continuation 不应继续执行，因此返回类型可以考虑 `Promise<never>`。

SDK 必须在本地立即建立 terminal/mutation gate，避免业务在 return pending 后继续发送第二个普通 call/return 或继续分发 ordinary input。

业务作者不负责：

```text
frame.return RPC
Activation revoke
Main close
Caller resume
```

---

## 8. 生命周期映射原则

协议 method 不等于业务 hook。

不得机械设计：

```ts
runtime.on("frame.initialize", ...)
runtime.on("frame.activate", ...)
runtime.on("frame.resume", ...)
```

推荐映射：

```text
frame.initialize
    → SDK 建立 Frame Context
    → 调用 definition.frame(frame) 或 createFrame hook

frame.activate
    → SDK 安装 current Activation
    → ordinary input 可进入

frame.resume
    → SDK 验证 returned child + fresh Activation
    → 恢复挂起的 frame.call() continuation

frame.close
    → SDK terminalize Frame Context
    → cleanup
```

只有业务真正需要感知的稳定语义才进入 public hook/event surface。

---

## 9. Mutation Gate 由 SDK 统一拥有

`frame.call` / `frame.return` 是 commit-sensitive operation。

SDK 必须统一实现：

```text
pending call/return
→ hold mutation gate
→ stop ordinary input dispatch for that Frame
→ reject second call/return locally
→ wait terminal protocol result
```

业务作者不得手工实现 mutation gate。

在非法使用时，SDK 可以抛出本地 usage error，例如：

```text
FrameBusyError
FrameInactiveError
FrameClosedError
```

这些错误用于提示 SDK 使用错误，不替代协议 semantic error。

---

## 10. Input API

当 `@loomrealm/data` / User Input 能力接入后，业务作者应面对 Frame-scoped input，而不是裸 Data message。

候选：

```ts
frame.input.on("keyboard", event => {
  // game logic
});

frame.input.on("pointer", event => {
  // game logic
});
```

或：

```ts
for await (const event of frame.input.events()) {
  // game logic
}
```

SDK 内部负责适用的：

```text
current Data Connection
Frame exists
Frame locally active
Activation current
Channel interest
mutation gate
```

业务代码不重复这些 protocol gates。

具体 Input API 延后到 `@loomrealm/data` 实现时冻结。

---

## 11. Render API

Render 应保持 declarative。

业务默认不直接构造：

```text
render.snapshot wire message
render.patch revision
baseRevision
Data carrier envelope
```

候选 author-facing 方向：

```ts
const world = runtime.render.domain("world", { zIndex: 0 });

world.set(nextTree);
world.event("shake", { strength: 2 });
```

SDK / Render capability 负责把 declarative desired state 转为 Render Update 协议。

精确 Render API 在 `@loomrealm/data` 与 Renderer implementation 开始落地后决定；本草案只冻结“业务不直接拼 wire patch”的原则。

---

## 12. Content API

Content 对业务作者表现为普通 logical client：

```ts
const map = await runtime.content.getJson("map/001");
const image = await runtime.content.getResource("graphics/foo.png");
```

业务 Subsystem 不应知道底层是：

```text
filesystem
HTTP
Service Worker
fsdb-http
```

Content API 的精确 surface 由 `@loomrealm/content` 定义，本包只提供 author-facing binding。

---

## 13. Bootstrap 与平台边界

业务 definition 不负责：

```text
建立 WebSocket
接收 MessagePort
解析 bootstrapToken
选择 protocolVersions
发送 subsystem.hello
发送 subsystem.status(ready)
```

建议 core startup 形态：

```ts
startSubsystem({
  definition,
  carrier,
  bootstrap,
});
```

其中 `carrier` / `bootstrap` 由 platform-specific composition/bootstrap glue 注入。

核心 `@loomrealm/subsystem` 不应：

```text
探测 Desktop/PWA
直接依赖 WebSocket
直接依赖 MessagePort
直接 spawn process/worker
```

未来如确有价值，可提供薄 subpath：

```text
@loomrealm/subsystem/node
@loomrealm/subsystem/worker
```

但不是第一阶段目标。

---

## 14. Runtime bootstrap 自动化

SDK 内部目标流程：

```text
obtain established carrier + bootstrap material
→ create Subsystem-side Runtime Control peer
→ subsystem.hello
→ identified
→ status(initializing) when applicable
→ run initialize hook
→ establish required local Runtime capability
→ status(ready)
→ accept Frame operations
```

如果 required initialization 失败：

```text
→ report failed through applicable protocol
→ stop new normal operations
→ bounded cleanup
→ terminate/close according to Host integration
```

业务作者不手写 Control bootstrap state machine。

---

## 15. Error boundary

### 15.1 Business error

业务自己的错误：

```text
MapLoadError
BattleRuleError
Content interpretation error
```

由业务决定处理或转为 Frame outcome。

### 15.2 SDK usage error

表示业务错误使用 author API：

```text
inactive Frame 上 call
pending mutation 时第二次 call
return 后继续普通操作
closed Frame 使用 input capability
```

SDK 应提供稳定、易诊断的本地 error。

### 15.3 Protocol / Runtime fatal

例如：

```text
Control carrier loss
Frame RPC timeout
invalid resume
protocol divergence
fatal Runtime Control error
```

SDK 应自动：

```text
stop normal input/action dispatch
terminalize affected local capability
enter Runtime failure path
surface high-level failure notification for observability/cleanup
```

普通业务代码不应通过解析 `FRAME_CONTROL_TIMEOUT` 等 wire code 来恢复协议状态。

---

## 16. 推荐内部结构

目标结构仅作边界参考，不要求一次建立全部文件：

```text
packages/subsystem/
├── DESIGN.md
├── package.json
├── src/
│   ├── definition/
│   │   └── define-subsystem.ts
│   ├── runtime/
│   │   ├── runtime.ts
│   │   └── lifecycle.ts
│   ├── frame/
│   │   ├── frame.ts
│   │   ├── context.ts
│   │   ├── call.ts
│   │   └── mutation-gate.ts
│   ├── input/
│   ├── render/
│   ├── content/
│   └── internal/
│       └── runtime-control-adapter.ts
└── test/
```

只有 `internal/` 与具体 capability binding 可以直接面对协议 package。

public exports 不应 re-export：

```text
RuntimeControlPeer
JsonRpcMessage
MessageCarrier
wire validators
activationId manipulation helper
```

---

## 17. 第一阶段实现范围

第一阶段刻意只实现 Runtime Control SDK vertical slice：

```text
defineSubsystem
SubsystemRuntime
Frame
Frame.call
Frame.return
bootstrap / ready / shutdown
Frame initialize / activate / resume / close internal mapping
mutation gate
```

暂不要求完整实现：

```text
User Input author API
Render author API
Content binding
Diagnostics / metrics
hot reload
platform convenience bootstrap
```

这些在对应 capability 有真实实现后再接入。

---

## 18. 最小 executable closure

使用三个仅依赖 `@loomrealm/subsystem` 的测试业务：

```text
test.root
test.middle
test.leaf
```

业务代码只写：

```ts
// root
const result = await frame.call("test.middle", { value: 1 });
await frame.return(result);
```

```ts
// middle
const result = await frame.call("test.leaf", {
  value: frame.input.value + 1
});

await frame.return({
  value: result.value + 1
});
```

```ts
// leaf
await frame.return({
  value: frame.input.value + 1
});
```

底层必须自动完成：

```text
hello
→ ready
→ initial root Frame
→ root call middle
→ middle call leaf
→ leaf return
→ middle fresh resume
→ middle return
→ root fresh resume
→ root return
→ shutdown
```

业务代码中必须保持：

```text
0 JSON-RPC method names
0 request ID handling
0 manual activation ID handling
0 MessageCarrier operations
0 WebSocket / MessagePort branches
```

这是 v0.1 最重要的开发体验验收。

---

## 19. 测试策略

至少分三层：

### SDK unit

```text
Frame Context lifecycle
mutation gate
call continuation
return terminalization
usage errors
cleanup idempotence
```

### Runtime Control integration

使用 MemoryCarrier：

```text
hello → ready → shutdown
initial frame
nested call depth 3
fresh activation resume
call/return failure mapping
carrier loss
```

### Author-facing black-box

测试业务仅允许 import：

```text
@loomrealm/subsystem
```

不得 import：

```text
@loomrealm/runtime-control
@loomrealm/wire
@loomrealm/foundation
transport adapter
```

由此验证协议机械层没有泄漏到业务开发体验。

---

## 20. 推进阶段

### Stage 0 — Boundary Draft

完成本文：

```text
业务 SDK 定位
协议隔离边界
Frame capability model
最小开发体验
closure scenario
```

### Stage 1 — Minimal Skeleton

创建 workspace、exports、build/test baseline。

只建立实现当前 vertical slice 所需目录。

### Stage 2 — Runtime Bootstrap

基于 `@loomrealm/runtime-control` Subsystem role 跑通：

```text
hello
→ initialize
→ ready
→ shutdown
```

业务 definition 不直接接触 protocol peer。

### Stage 3 — Initial Frame

实现：

```text
frame.initialize
→ Frame Context
→ frame.activate
→ definition.frame(frame)
```

业务能够读取 `frame.input` 并正常 `frame.return()`。

### Stage 4 — Nested Call Continuation

实现：

```text
Frame.call()
→ mutation gate
→ protocol frame.call
→ local suspension
→ fresh frame.resume
→ resolve Promise
```

通过 root → middle → leaf depth-3 场景。

### Stage 5 — Failure / Cleanup

覆盖：

```text
call/return timeout
carrier loss
invalid resume
shutdown during live Frame
idempotent cleanup
no stale Activation reuse
```

### Stage 6 — SDK v0.1 Closure

只有同时满足以下条件才关闭第一阶段：

```text
业务只依赖 @loomrealm/subsystem
nested call/return/resume 正常工作
业务不管理 Activation
业务不操作 MessageCarrier
业务不处理 JSON-RPC
Runtime Control applicable conformance 通过
SDK misuse 与 protocol fatal 明确区分
```

之后才逐步接入 Input / Render / Content author API。

---

## 21. 明确非目标

第一阶段不做：

```text
通用游戏引擎框架
ECS
场景树
地图系统
战斗系统
Renderer implementation
Main Stack authority
WebSocket/MessagePort transport implementation
Content storage implementation
自动重连 / retry / checkpoint
跨 Runtime shared mutable memory
```

本包只提供“业务 Subsystem 如何安全、自然地参与 LoomRealm Runtime”的 SDK。

---

## 22. 边界健康检查

如果业务代码开始出现以下内容，说明 SDK abstraction 失败：

```text
if (message.method === "frame.resume")
requestId++
JSON.stringify(rpc)
activationId = ...
carrier.send(...)
new WebSocket(...)
port.postMessage(...)
```

如果 `@loomrealm/subsystem` 开始拥有以下内容，也说明 package boundary 失效：

```text
Main Stack
Renderer authority
Game Package topology authority
platform process spawning
filesystem / HTTP implementation
business-specific map/battle semantics
```

最终原则：

> **Subsystem author writes ordinary asynchronous business logic; LoomRealm protocol mechanics remain an SDK implementation detail.**
