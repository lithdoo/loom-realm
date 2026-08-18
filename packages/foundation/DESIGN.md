# `@loomrealm/foundation` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 目标：为 LoomRealm 多个独立 capability 提供少量、可复用、无领域 authority、无平台绑定的运行基础 primitive。  
> 原则：只抽取已经出现真实复用需求的机制；禁止把本包演化成 `common` / `utils` / `misc` 垃圾桶。

---

## 1. 为什么存在这个包

LoomRealm 后续会同时存在：

```text
runtime-control
renderer-control
data
main
subsystem
renderer
transport adapters
content capabilities
```

这些模块会重复遇到一些与 LoomRealm 业务领域无关、但又不属于 JSON/wire 表示层的问题，例如：

```text
已建立双向消息 carrier 的统一消费接口
一次性关闭与资源 ownership
AbortSignal / timeout 组合
Deferred / AsyncQueue 等少量 async primitive
可替换 Clock / timer
确定性测试中的 fake clock / memory carrier
```

如果每个 capability 自己实现一套，就容易出现：

```text
close 语义不一致
abort / timeout race 处理不同
测试需要真实时间导致 flaky
WebSocket / MessagePort 泄漏到上层协议实现
相同 async primitive 出现多份近似实现
```

因此 `@loomrealm/foundation` 的目标不是提供“所有方便工具”，而是收敛：

> **多个独立 package 确实重复需要、且不拥有 LoomRealm domain authority 或平台技术语义的基础运行机制。**

---

## 2. 与 `@loomrealm/wire` 的边界

二者必须保持不同职责：

```text
@loomrealm/wire
    数据在 wire 上长什么样
    JSON / JSON-RPC / closed schema / safe integer / UTF-8 / depth

@loomrealm/foundation
    运行代码如何安全地管理少量通用 async / lifecycle / messaging mechanism
```

允许：

```text
foundation.MessageCarrier<string>
wire.parseJsonRpcMessage(raw)
```

禁止：

```text
wire.send(...)
wire.close(...)
foundation.parseJsonRpcMessage(...)
```

`foundation` 不应成为 `wire` 的替代品；`wire` 也不应吸收 transport/lifecycle primitive。

---

## 3. Authority Boundary

### 3.1 本包可以拥有

仅允许无 LoomRealm 领域 authority 的 mechanism：

```text
async coordination
resource cleanup
abort / timeout composition
clock / timer abstraction
already-connected message carrier abstraction
small generic error/invariant helpers
portable testing primitives
```

### 3.2 本包不得拥有

任何 LoomRealm domain noun 一旦成为本包 API 的核心语义，应默认视为边界泄漏：

```text
Runtime
Frame
Activation
InputTarget
DataAuthority
Data generation semantics
Render Domain / revision
Content identity
Game Package path/descriptor
Subsystem lifecycle
Renderer authority
failure unwind
protocol version negotiation
```

也不得拥有平台技术实现：

```text
WebSocket
MessagePort
Worker
child_process
filesystem
HTTP
Service Worker
OPFS
```

这些应继续留在 technical adapter 或 composition root。

---

## 4. 准入规则

新增任何 foundation primitive 前，必须能明确回答：

```text
1. 是否已经存在至少两个独立 package 的真实消费者？
2. 是否完全不依赖 LoomRealm domain authority？
3. 是否完全不绑定 Desktop/PWA/Node/Browser 的具体技术？
4. 如果不抽取，多个 package 是否会重复实现同一机制？
5. public API 是否足够小，可在不了解 LoomRealm 产品架构时独立理解？
```

推荐判定：

```text
五项中前四项必须为 Yes；
第 5 项如果无法做到，默认不进入 foundation。
```

仅因为“以后可能会有用”“放这里比较方便”“多个文件都想 import”不足以成为准入理由。

---

## 5. 首批候选能力

以下只是候选，不表示 Stage 1 必须全部实现。

### 5.1 Messaging

最优先候选：已建立连接后的 message-oriented carrier。

目标形态：

```ts
export interface MessageCarrier {
  send(message: string): void | Promise<void>;
  messages(): AsyncIterable<string>;
  readonly closed: Promise<CarrierClosed>;
  close(): void | Promise<void>;
}
```

精确 TypeScript 签名在实现时冻结；当前只冻结抽象意图。

Carrier 只描述：

```text
duplex
message-oriented
ordered
message boundary preserved
single logical inbound stream
explicit terminal close observation
```

Carrier 不保证：

```text
send success == peer received
send success == application ACK
close == domain success
carrier loss == Runtime failure
carrier loss == reconnect policy
```

上层 domain 根据自身协议解释 carrier termination。

#### 不统一连接建立

不建立类似：

```text
Transport.connect()
Transport.listen()
Transport.accept()
```

的跨平台万能接口。

Desktop WebSocket 与 PWA MessagePort 的建立方式本来就不同；foundation 只统一“连接已经建立以后如何消费”。

```text
WebSocket establishment
    → transport-websocket adapter
    → MessageCarrier

MessageChannel/Port establishment
    → transport-messageport adapter
    → MessageCarrier
```

### 5.2 Lifecycle

真实复用出现后可考虑：

```text
Disposable / AsyncDisposable compatible helpers
CloseOnce
cleanup aggregation
resource ownership helper
```

要求：

```text
close idempotent
ownership explicit
multiple cleanup failures preserved
no Runtime/Frame-specific policy
```

### 5.3 Abort / Timeout

可考虑基于标准 `AbortSignal` 的小型组合 primitive：

```text
withTimeout
raceAbort
throwIfAborted
abort-linked cleanup
```

foundation 只负责机制：

```text
time elapsed
operation aborted
```

不定义：

```text
Frame timeout 是否 ambiguous
Runtime 是否 failed
是否 retry
是否 unwind
```

这些都属于上层协议。

### 5.4 Async Primitive

只有真实重复出现后才加入：

```text
Deferred<T>
AsyncQueue<T>
AsyncSignal
serialized executor
```

禁止为了“未来可能有用”预建完整并发框架。

### 5.5 Clock / Timer

如果 Runtime/Supervisor/协议 timeout 测试开始依赖真实时间，可加入：

```ts
interface Clock {
  now(): number;
}
```

以及最小 timer/sleep abstraction。

主要价值是：

```text
production uses real clock
tests use fake clock
protocol behavior deterministic
no sleep-based flaky tests
```

### 5.6 Testing

当对应 production primitive 存在后，可提供：

```text
MemoryCarrierPair
FakeClock
fault-injectable carrier wrapper
assert eventually / assert no event helper（仅在真实需求出现时）
```

测试能力不得反向决定 production domain semantics。

---

## 6. 明确禁止成为通用工具箱

以下内容默认不进入 foundation：

```text
string formatting convenience
random array helpers
object merge helpers
filesystem path helper
HTTP helper
logging facade
configuration system
DI container
event bus
RPC framework
retry framework
serialization framework
platform detection
business identifier types
```

除非未来出现非常明确的跨 capability consumer 和独立稳定边界，否则这些应留在最接近的拥有者中。

一个简单规则：

> 如果文件名只能叫 `utils.ts`、`helpers.ts`、`misc.ts` 才能合理容纳它，优先不要放入 foundation。

---

## 7. 与 Transport Adapter 的关系

目标依赖关系：

```text
@loomrealm/foundation
        ↑
        │ implements interface
        │
@loomrealm/transport-websocket
@loomrealm/transport-messageport
        ↑
        │ provides carrier
        │
runtime-control / renderer-control / data consumers
```

更准确地说，domain package 消费 foundation 中的抽象；adapter 实现 foundation 中的抽象；composition root 决定具体 adapter。

禁止：

```text
foundation → transport-websocket
foundation → transport-messageport
runtime-control → WebSocket
runtime-control → MessagePort
```

---

## 8. Package 依赖

`@loomrealm/foundation` 应尽量位于 dependency graph 底部。

初始倾向：

```text
foundation
    → JavaScript/TypeScript standard platform primitives only
```

默认不依赖：

```text
@loomrealm/wire
runtime-control
renderer-control
data
main
subsystem
renderer
platform adapters
```

如果某个 helper 只有依赖 `wire` 才合理，应重新判断它究竟属于 foundation 还是 wire/contract consumer。

---

## 9. 建议目录

真正进入实现后再创建：

```text
packages/foundation/
├── package.json
├── tsconfig.json
├── README.md
├── DESIGN.md
├── src/
│   ├── messaging/
│   ├── lifecycle/
│   ├── async/
│   ├── time/
│   └── testing/
└── test/
```

当前不要求建立空目录；只在有首个真实实现时创建对应文件。

public surface 应通过 package `exports` 明确限制，不允许消费者依赖内部相对路径。

---

## 10. 推进阶段

### Stage 0 — Boundary Draft

当前阶段。

关闭条件：

```text
foundation / wire / domain / platform adapter 边界明确
准入规则明确
Messaging abstraction 的目标语义明确
禁止项明确
```

### Stage 1 — First Real Consumer

不先“完成 foundation”。

优先推进 `runtime-control`，当其真实实现需要平台无关 carrier 时，再落地：

```text
MessageCarrier
CarrierClosed
```

同时建立最小测试。

关闭条件：

```text
runtime-control 不 import WebSocket/MessagePort
carrier 不知道 JSON-RPC method/domain semantics
send / close / terminal semantics 明确
```

### Stage 2 — Memory Carrier Qualification

加入测试专用 in-memory pair，用它运行第一个真实 Control flow：

```text
subsystem.hello
→ response
→ status
```

关闭条件：

```text
协议测试无需真实 socket
message ordering/boundary tests PASS
close observation deterministic
fault injection 能覆盖 transport loss
```

### Stage 3 — WebSocket Adapter Validation

实现 `transport-websocket`，把真实 WebSocket 映射到相同 `MessageCarrier`。

关闭条件：

```text
同一 runtime-control test flow
MemoryCarrier PASS
WebSocketCarrier PASS
runtime-control 无平台条件分支
```

### Stage 4 — Second Independent Consumer Review

当 `renderer-control` 或 `data` 成为第二个真实消费者时，做第一次 foundation package existence review。

确认：

```text
抽象确实跨两个独立 capability 复用
没有为 Runtime Control 特化
没有开始吸收协议 dispatcher/RPC client
```

如果第二消费者证明这个抽象只是 Runtime Control 私有机制，应允许把它移回 runtime-control，而不是为了 package 存在而保留。

### Stage 5 — Foundation v0.1 Closure

只有经过至少两个真实 capability 消费后，才把 `@loomrealm/foundation` 视为独立 package boundary 已验证。

关闭条件：

```text
至少两个独立 production capability consumers
至少一个真实 technical adapter implementation
至少一个 deterministic test implementation
0 LoomRealm domain authority
0 platform-specific public API
0 generic utils dumping
public exports minimal
package can be explained without阅读 LoomRealm protocol documents
```

达到后停止主动扩展；新的 primitive 继续逐项经过准入规则。

---

## 11. 第一轮实现建议

第一轮不要同时实现所有候选工具。

推荐：

```text
1. MessageCarrier
2. CarrierClosed
3. MemoryCarrierPair（testing）
```

只有在 Runtime Control 实现实际出现需求时再考虑：

```text
Deferred<T>
CloseOnce
withTimeout / AbortSignal helper
FakeClock
```

这保证 foundation 是由 vertical slice 拉出来，而不是为了目录完整度预建。

---

## 12. 闭环定义

`@loomrealm/foundation` 的成功标准不是“工具很多”，而是：

```text
上层协议不关心 WebSocket / MessagePort
adapter 不获得 domain authority
相同跨包 mechanism 不再重复实现
测试可以使用 deterministic foundation primitive
foundation 自身仍然非常小
```

一个健康的闭环应表现为：

```text
Runtime Control
    │
    │ consumes
    ▼
MessageCarrier
    ▲                ▲
    │                │
MemoryCarrier    WebSocketCarrier
(test)           (Desktop adapter)
```

随后第二个独立 capability 复用同一接口：

```text
Renderer Control / Data
    │
    └──── consumes same MessageCarrier
```

如果做到这里仍无需修改 carrier 的 domain-neutral 语义，则 package boundary 得到验证。

---

## 13. 当前结论

`@loomrealm/foundation` 当前只冻结以下设计意图：

```text
它是小型运行基础 primitive 包
它不是 utils/common 大包
它不拥有 LoomRealm authority
它不绑定平台技术
它不替代 wire
它只接受真实跨 package 复用
MessageCarrier 是最优先的首个候选能力
```

下一步不是继续扩写 foundation 能力清单，而是进入 Runtime Control vertical slice，用第一个真实消费者决定哪些 primitive 值得真正落地。
