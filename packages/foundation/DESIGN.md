# `@loomrealm/foundation` 设计闭合稿

> 状态：Implemented Baseline / Core Contract Frozen<br>
> 阶段：M1 Stage A/B code-complete；cross-package qualification follows M3/M6/M8/M15<br>
> 最近复核：2026-08-20  
> 目标：为多个独立 capability 提供少量、无 LoomRealm authority、无平台绑定的运行 primitive，并把首批 `MessageCarrier` / terminal / deterministic memory testing contract 收口到可以直接实现、直接测试、直接被 Runtime Control 消费的程度。  
> 冻结范围：本文 §§4–18 的首批 public/testing contract、§§22–27 的第一实现基线与关闭条件。  
> 非冻结范围：未来 `Clock`、`Deferred`、`AsyncQueue`、cleanup aggregation、timeout helpers 等候选 primitive；只有出现真实跨 package 重复需求后才进入新的 closure review。  
> 上层实施：[第一阶段交付计划](../../doc/30-implementation/phase-1-delivery-plan.md)  
> 分包规则：[独立分包与发布架构](../../doc/30-implementation/package-architecture.md)

核心原则：

> **Foundation 只提供可脱离 LoomRealm domain 独立解释的运行机制。首批冻结能力只有 already-connected、message-oriented、duplex `MessageCarrier`（payload 固定为 `string`）及其确定性内存测试实现；它不解释 message、不建立连接、不决定任何 Runtime/Data failure semantics。**

---

## 1. Position

```text
@loomrealm/foundation
    generic runtime mechanisms

@loomrealm/wire
    JSON / JSON-RPC representation and validation
```

两者正交：

```text
foundation        wire
     \             /
      \           /
    protocol / capability
            ↑
          roles
```

Foundation 可以被 `runtime-control`、`renderer-control`、`data`、role host integration 与 transport adapter 共同依赖，但 MUST NOT 反向依赖这些上层包。

Foundation 不知道：

```text
Runtime
Subsystem
Frame
Activation
Renderer
DataAuthority
Render Domain
Game Package
Content
JSON / JSON-RPC method
Hostra / PWA
```

如果一个 public API 必须知道 LoomRealm domain noun 才能解释，它不属于 Foundation。

---

## 2. Freeze Scope

本次冻结只锁定：

```text
@loomrealm/foundation
    MessageCarrier
    CarrierClosed

@loomrealm/foundation/testing
    MemoryCarrierPair
    createMemoryCarrierPair
```

以及这些 observable semantics：

```text
duplex
message-oriented
opaque string
per-direction order
message-boundary preservation
single logical inbound reader
first-terminal-wins
closed vs lost terminal fact
queued-before-terminal drain
idempotent close
no half-close
no retry/replay/duplicate
send/close always async Promise API
```

本次明确 **不冻结 / 不实现**：

```text
Clock / FakeClock
Deferred<T>
AsyncQueue<T>
CloseOnce
cleanup aggregation
serialized executor
withTimeout
generic AbortSignal composition
backoff/retry
logging/configuration helpers
```

原因不是这些能力永远不需要，而是当前没有足够真实消费者证明它们应该成为共享 public contract。

---

## 3. Dependency / Authority Boundary

允许：

```text
already-connected string message carrier
terminal observation
local close request
small deterministic testing primitive
future proven generic lifecycle/async mechanisms
```

禁止：

```text
JSON parse/stringify
UTF-8 protocol size policy
JSON-RPC dispatch
request id
protocol deadline
Runtime/Frame failure classification
connection establishment
reconnect
WebSocket / MessagePort API
Worker / child_process
filesystem / HTTP
Platform detection
business identifiers
```

依赖方向：

```text
@loomrealm/foundation
      ↑               ↑
      │               │
transport-*      capability packages
      \               /
       \             /
        composition / role integration
```

禁止：

```text
foundation → wire
foundation → runtime-control
foundation → data
foundation → transport-websocket/messageport
foundation → apps/*
```

Foundation **零 runtime dependencies** 是首批实现目标。

---

## 4. Package Surface

冻结 package surface：

```text
@loomrealm/foundation
    MessageCarrier
    CarrierClosed

@loomrealm/foundation/testing
    MemoryCarrierPair
    createMemoryCarrierPair
```

根入口 MUST NOT re-export testing implementation。

当前不建立：

```text
@loomrealm/foundation/internal
@loomrealm/foundation/node
@loomrealm/foundation/browser
@loomrealm/foundation/websocket
@loomrealm/foundation/messageport
```

Platform/transport adapter 是 Foundation 的消费者，不是其 subpath。

---

## 5. Exact Public API

第一实现按照以下 TypeScript surface 落地：

```ts
export type CarrierClosed =
  | {
      readonly kind: "closed";
    }
  | {
      readonly kind: "lost";
      readonly cause?: unknown;
    };

export interface MessageCarrier {
  /**
   * Accept one opaque application message for outbound delivery.
   * Resolution is local carrier acceptance only; never peer ACK.
   */
  send(message: string): Promise<void>;

  /**
   * Exactly one logical inbound message stream.
   */
  messages(): AsyncIterable<string>;

  /**
   * Resolves exactly once with the immutable terminal fact.
   */
  readonly closed: Promise<CarrierClosed>;

  /**
   * Idempotently request orderly local termination.
   */
  close(): Promise<void>;
}
```

Testing surface：

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface MemoryCarrierPair {
  readonly left: MessageCarrier;
  readonly right: MessageCarrier;

  /**
   * Deterministically inject abrupt transport loss into both endpoints.
   * First terminal fact wins.
   */
  lose(cause?: unknown): void;
}

export function createMemoryCarrierPair(): MemoryCarrierPair;
```

首批 public surface 不增加 generic parameter：

```text
MessageCarrier<T>
```

因为当前真实消费者统一需要 `string` application unit；引入 generic 会弱化当前跨 WebSocket/MessagePort 的统一 value model，却没有第二种真实 payload 类型证明其必要性。

---

## 6. Why `Promise<void>` Only

旧草案使用：

```ts
void | Promise<void>
```

首批冻结统一为：

```ts
Promise<void>
```

理由：

```text
one invocation model
one error model
one backpressure hook
one test model
no sync/async branch in every consumer
```

即使底层 MessagePort `postMessage()` 本身同步，adapter 仍返回 `Promise<void>`。

重要：

```text
await carrier.send(message)
```

只表示：

> **该 message 已被本地 carrier/adapter 接受，且在本地 outbound ordering 中取得位置。**

它绝不表示：

```text
peer received
peer parsed
peer processed
peer committed
JSON-RPC Response exists
Frame mutation committed
```

所有 application ACK/commit 仍由上层 protocol 定义。

---

## 7. Opaque String Rule

Foundation 对 `message: string` 的唯一认识是：

```text
JavaScript string application value
```

它 MUST NOT：

```text
JSON.parse(message)
JSON.stringify(message)
measure protocol UTF-8 limit automatically
reject invalid JSON
normalize Unicode
trim whitespace
inspect method names
route messages
compress/decompress application payload
```

以下全部合法：

```text
""
"not json"
"\n"
"😀"
"{broken"
```

某个上层 Profile 如果要求“one UTF-8 JSON text string”，由该 Profile + `@loomrealm/wire` 强制，不由 Foundation 强制。

因此：

```text
Foundation string opacity
AND
LoomRealm JSON-text Profiles
```

并不矛盾。

---

## 8. Public Carrier State Model

Carrier 的 public state 只需要：

```text
OPEN
  │
  ├── orderly close observed/requested
  │        ↓
  │   TERMINAL {kind:"closed"}
  │
  └── abrupt loss / transport unusable
           ↓
      TERMINAL {kind:"lost", cause?}
```

没有 public：

```text
connecting
connected
reconnecting
halfClosed
retrying
```

这些如果存在，只能是外层 Platform/adapter establishment 或内部 implementation detail。

### First-terminal-wins

一旦某个 `CarrierClosed` 被选定：

```text
terminal fact immutable
closed resolves with exactly that value
later close/loss facts do not replace it
carrier never reopens
```

示例：

```text
loss wins first
→ {kind:"lost"}
→ later close() stays lost

close wins first
→ {kind:"closed"}
→ later physical error does not rewrite public terminal fact
```

Foundation 不解释哪一种 terminal fact 对 Runtime/Data 是“成功”还是“失败”。

---

## 9. `closed` Contract

```ts
readonly closed: Promise<CarrierClosed>
```

MUST：

```text
resolve exactly once
never reject for ordinary carrier lifecycle
resolve with immutable terminal fact
resolve no later than a send() rejection caused by terminal state
remain awaitable after terminal
```

`closed` 是 terminal reason 的唯一稳定 observation surface。

消费者 MUST NOT 依赖：

```text
Error.message
adapter-specific close code
WebSocket close event object
MessagePort implementation object
```

如果 transport adapter 需要保留底层 diagnostic，可放入：

```ts
{ kind: "lost", cause }
```

`cause` 只用于 local diagnostic/debugging，不是 application protocol，也不要求 serializable。

---

## 10. `send()` Contract

### 10.1 Open carrier

对 OPEN carrier：

```ts
await carrier.send(message)
```

MUST：

```text
preserve the exact string value
preserve one-message boundary
allocate this send a stable local outbound order position
never intentionally duplicate it
never internally retry after ambiguous transport outcome
```

### 10.2 Ordering

如果同一 carrier 上：

```text
send(A) invoked before send(B)
```

且两者都成功 resolve，则 peer inbound stream MUST NOT observe B before A。

实现可以内部串行化 outbound operations；consumer 不需要建立自己的 transport ordering layer。

### 10.3 Terminal carrier

一旦 terminal 已经选定：

```text
new send() MUST reject
MUST NOT enqueue a new outbound message
MUST NOT reopen/reconnect
```

具体 rejection `Error` class/message **不是冻结 API**；consumer 不应按错误字符串分支。

如果一个 open-state send 因底层 transport failure 无法继续：

```text
carrier terminal becomes lost
closed resolves
send rejects
```

`closed` MUST 在该 terminal-related rejection 被观察到时已经 resolve 或同一 turn 可确定 resolve；上层可以把 `closed` 当成 authoritative terminal fact。

### 10.4 No retry

Foundation / adapter MUST NOT 做：

```text
retry send
replay message after reconnect
sequence-based deduplication
application idempotency inference
```

这些机制如果未来存在，必须属于明确的上层 protocol，而不是 MessageCarrier。

---

## 11. `messages()` Contract

```ts
messages(): AsyncIterable<string>
```

代表：

> **该 carrier 唯一 logical inbound message stream。**

MUST：

```text
preserve received message boundaries
preserve per-direction order
yield exact string values
never yield adapter-created duplicate
terminate normally after terminal and queued-before-terminal drain
```

### Single-reader precondition

一个 carrier 在一个 lifetime 中 MUST 只有一个 logical consumer reader。

```text
one carrier
→ one dispatcher / one reader owner
```

例如：

```text
Runtime Control
    one RuntimeControlDispatcher

Renderer Data
    one Data dispatcher
```

并行创建两个 iterator 竞争同一 inbound stream 是 **consumer contract violation**。

首批 Foundation implementation **不要求**为这种错误定义稳定 exception type；实现 MAY 在开发期检测，也 MAY 只依赖 owner discipline。不要为了检测错误引入复杂 broadcast/event-bus abstraction。

---

## 12. Terminal vs Queued Inbound Ordering

终止观察与已接收 message queue 必须有明确关系。

规则：

> **在 terminal linearization point 之前已经被本地 carrier 接受的 inbound messages 仍属于该 inbound stream，并按原顺序 drain；之后 iterator 正常结束。**

因此允许：

```text
closed promise already resolved
AND
messages() still has previously accepted queued messages to yield
```

但禁止：

```text
terminal chosen
→ accept a brand-new inbound message
```

这个规则避免把“terminal signal”和“queue drain”错误等价。

上层 protocol MAY 在看到 terminal 后立即把自己的 Session/Runtime 标记失败并停止消费；那是上层 policy，不改变 Foundation 的 queue semantics。

---

## 13. `close()` Contract

```ts
close(): Promise<void>
```

表示：

> **请求该 duplex carrier orderly terminal，并等待本地 carrier 进入 terminal 状态。**

MUST：

```text
idempotent
safe when already terminal
never reopen
prevent new outbound sends after close linearizes
select {kind:"closed"} only if no previous terminal fact exists
resolve after local terminal fact is fixed
```

如果 carrier 已经 `{kind:"lost"}`：

```text
await close()
```

仍正常 resolve，并保持原 `{kind:"lost"}`。

`close()` 不承诺：

```text
peer application accepted shutdown
peer processed all prior messages
physical transport handshake fully completed remotely
domain operation succeeded
```

这些都需要上层 protocol/Platform 自己定义。

---

## 14. No Half-close

首批 `MessageCarrier` 是 **duplex lifetime**，不暴露：

```text
closeWrite()
closeRead()
shutdownOutbound()
half-open state
```

一旦 terminal：

```text
no new outbound message
no new inbound acceptance
queued-before-terminal may drain
```

WebSocket / MessagePort / in-memory adapter 都必须投影成同一 duplex terminal model。

未来如果真实消费者确实需要 half-close，应定义另一个 capability，而不是扩张当前 Frozen contract。

---

## 15. Close/Loss Does Not Mean Domain Outcome

Foundation 只报告 transport-local terminal fact：

```text
closed
lost
```

它 MUST NOT 推导：

```text
Runtime stopped
Runtime failed
Frame cancelled
Data generation revoked
Renderer disconnected semantically
business operation succeeded
```

例如：

```text
Runtime Control carrier lost
→ @loomrealm/runtime-control / Main interprets as Runtime failure

Renderer Data carrier lost
→ Data lifecycle may allow reconnect
```

同一 Foundation terminal fact可以被不同上层 contract解释成不同 domain consequence。

---

## 16. Concurrency / Linearization Rules

实现可以有内部异步状态，但 public behavior 必须可线性解释。

每个 endpoint 对以下 operations 建立单一 local order：

```text
send(...)
first close()
transport terminal observation
```

规则：

```text
1. first terminal operation wins;
2. send that linearizes before terminal may succeed;
3. send that linearizes after terminal must reject;
4. successful sends preserve their local linearization order at peer;
5. repeated close does not add a new state transition.
```

如果 `send(A)` 与 `close()` 在不同 async task 竞争，consumer 不应根据 wall-clock 猜测谁赢；结果由 implementation 的 deterministic local serialization 决定，并必须满足上述规则。

Foundation 不提供全局 scheduler，也不保证跨两个 carrier direction 的 total order。

只保证：

```text
left → right order
right → left order
```

各自独立。

---

## 17. Backpressure Boundary

首批 API 没有额外：

```text
bufferedAmount
capacity
onDrain
highWaterMark
```

`Promise<void>` 已经为 adapter 留出最小 local backpressure hook：

```text
send resolves when adapter accepts the message locally
```

Production adapter MUST 自己避免无界物理 buffering，但具体 threshold/config 不属于 Foundation common contract。

`MemoryCarrierPair` 是 test primitive，可以使用无界内存队列；它不构成 production buffering policy 的先例。

如果未来至少两个 production adapter 需要统一显式 backpressure API，再单独 closure review。

---

## 18. Connection Establishment Is Out of Scope

Foundation 不提供：

```text
connect()
listen()
accept()
reconnect()
```

实际路径：

```text
Hostra Platform provisions WebSocket
→ @loomrealm/transport-websocket adapts already-connected socket
→ MessageCarrier

PWA Platform provisions/transfers MessagePort
→ @loomrealm/transport-messageport adapts already-provisioned port
→ MessageCarrier
```

因此 Foundation 无需知道：

```text
URL
port number
MessagePort transfer
credential/token
Origin
WebSocket protocol negotiation
Worker bootstrap
```

建立连接与 identity binding 是 Platform/Profile 的职责。

---

## 19. Deterministic `MemoryCarrierPair`

`@loomrealm/foundation/testing` 的第一批能力：

```ts
const pair = createMemoryCarrierPair();

pair.left;
pair.right;
pair.lose(cause?);
```

目标不是模拟 WebSocket internals，而是提供与 Frozen `MessageCarrier` observable contract 一致的最小 deterministic duplex pair。

### 19.1 Pair creation

创建后：

```text
left OPEN
right OPEN
queues empty
closed promises pending
```

无随机 scheduling、无网络延迟模拟、无 background timer。

### 19.2 Send

```text
await left.send("A")
```

Memory implementation MUST：

```text
accept A exactly once into right inbound queue
preserve exact value
resolve send after local deterministic enqueue
```

反向独立同理。

### 19.3 Order

```text
await left.send("A")
await left.send("B")
```

right reader：

```text
A
B
```

不得 reorder/duplicate。

### 19.4 Orderly close

任一 endpoint 首次成功 `close()`：

```text
both endpoints become terminal {kind:"closed"}
no new sends accepted in either direction
already queued messages drain
both inbound streams then end
```

Memory pair 不模拟 half-close/close handshake delay。

### 19.5 Injected loss

```ts
pair.lose(cause);
```

如果 pair 仍 OPEN：

```text
left  → {kind:"lost", cause}
right → {kind:"lost", cause}
no new sends accepted
already queued messages drain
streams then end
```

如果某 terminal fact 已经先发生：

```text
lose() does not overwrite it
```

即 first-terminal-wins。

### 19.6 Loss cause identity

Memory pair MAY把传入的同一个 `cause` reference 暴露给两端，用于 deterministic assertion；production adapter 不要求两端共享同一 cause identity。

---

## 20. What Memory Carrier Must Not Simulate

首批测试 primitive 不添加：

```text
latency
packet fragmentation
bandwidth
random drop rate
reordering
automatic retry
WebSocket close code
MessagePort transfer semantics
network partition healing
```

原因：`MessageCarrier` 是 message abstraction，不是网络 simulator。

如果 Runtime Control fault tests需要“某个 send 已 commit/未 commit/ambiguous”的更高层控制，应由 `runtime-control/testing` 在 protocol layer构造，而不是让 Foundation 理解 Frame semantics。

---

## 21. Production Adapter Contract

任何 production adapter 声称实现 `MessageCarrier`，至少必须证明：

```text
already-provisioned physical transport only
string application unit only
message boundary preserved
per-direction ordering preserved
terminal observation mapped to closed/lost
close idempotent
no half-close leakage
no retry/replay/duplicate
no JSON/domain parsing
no reconnect inside same carrier
```

### WebSocket

典型 mapping：

```text
WebSocket text frame/message
→ exact JavaScript string
```

Binary frame是否允许/拒绝由 transport adapter/Profile约束；Foundation 不增加 binary payload type。

### MessagePort

当前 Profile mapping：

```text
postMessage(string)
→ exact JavaScript string
```

Structured Clone只用于 Platform bootstrap/Port transfer，不允许把 arbitrary structured object 变成第二套 `MessageCarrier` payload model。

---

## 22. Admission Rule for Future Primitives

新增 Foundation primitive 必须同时满足：

```text
1. 至少两个独立 production package 有真实重复需求；
2. API 无 LoomRealm domain authority；
3. API 无 Desktop/PWA/Node/Browser concrete dependency；
4. 不抽取会产生真实重复机制或不一致行为；
5. API 可以脱离 LoomRealm 文档独立解释；
6. 有明确 ownership/lifetime/error semantics；
7. 能给出 deterministic tests；
8. 不可用现有标准语言 primitive 简洁替代。
```

前七项必须 Yes；第八项如果 No，默认不新增 abstraction。

禁止以：

```text
以后可能有用
减少 import 行数
统一风格
看起来像 common helper
```

作为 Foundation admission 理由。

---

## 23. Explicit Non-goals

首批明确不进入：

```text
generic event bus
observer framework
DI container
service locator
RPC framework
retry framework
serialization/codec framework
schema DSL
logging facade
configuration facade
filesystem helpers
HTTP helpers
platform detection
string/object convenience utils
business identifier types
mutex/task scheduler framework
resource graph framework
```

需要 `utils.ts` / `misc.ts` / `helpers.ts` 才能解释其用途的候选代码默认不进入 Foundation。

---

## 24. Proposed Source Layout

第一实现目标：

```text
packages/foundation/
├── package.json
├── tsconfig.json
├── DESIGN.md
├── src/
│   ├── index.ts
│   ├── message-carrier.ts
│   └── testing/
│       ├── index.ts
│       └── memory-carrier-pair.ts
└── test/
    ├── message-carrier.contract.test.mjs
    └── memory-carrier-pair.test.mjs
```

推荐 exports：

```text
src/index.ts
    CarrierClosed
    MessageCarrier

src/testing/index.ts
    MemoryCarrierPair
    createMemoryCarrierPair
```

不要从 root export testing symbol。

内部实现文件 MAY调整；public subpath与 observable contract 属于冻结范围。

---

## 25. Package Manifest Baseline

第一实现可直接采用：

```json
{
  "name": "@loomrealm/foundation",
  "version": "0.1.0-alpha.0",
  "type": "module",
  "description": "Platform-neutral runtime primitives for LoomRealm capability packages.",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "import": "./dist/testing/index.js"
    }
  },
  "files": [
    "dist",
    "DESIGN.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && node --test test/*.test.mjs"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  },
  "engines": {
    "node": ">=20"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

运行时 dependencies：

```text
none
```

Package 可在 browser/PWA bundle 中使用；`engines.node` 只声明当前 monorepo build/test baseline，不授权 source import Node API。

---

## 26. TypeScript Baseline

建议：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

Source MUST NOT import：

```text
node:*
DOM-only APIs
WebSocket
MessagePort
Worker
```

因此 core compile 不需要 `@types/node` 或 DOM types。

测试使用 `.mjs` + `node:test` 直接消费 `dist`，与 `@loomrealm/fsdb-http` 当前 monorepo test style一致。

NodeNext source 内部 relative import 使用 `.js` output extension，例如：

```ts
export * from "./message-carrier.js";
```

---

## 27. Recommended Memory Implementation Shape

以下是实现建议，不冻结 internal class/file names，但足够让实现者直接开始：

```text
MemoryEndpointState
    terminal: CarrierClosed | null
    inboundQueue: string[]
    waitingNextResolvers
    closed deferred
    peer endpoint
```

关键 algorithm：

### `send(message)`

```text
serialize against local terminal transition
if local terminal → reject
if peer terminal → terminal local according to pair state / reject
append exact message to peer inboundQueue
wake one peer waiter
resolve
```

### `messages()` iterator `next()`

```text
if inboundQueue not empty → shift/yield
else if terminal → done:true
else wait until message or terminal
```

### `close()`

```text
if terminal → resolve
else atomically select orderly terminal for pair
resolve both closed promises
wake pending iterators
resolve
```

### `lose(cause)`

```text
if terminal already selected → no-op
else atomically select lost terminal for pair
resolve both closed promises
wake pending iterators
```

Implementation SHOULD keep pair terminal transition atomic within the same synchronous JS turn;不要引入 timer/microtask race 来模拟网络。

---

## 28. Required Test Matrix

第一实现至少覆盖以下 observable tests。

### 28.1 Payload opacity

```text
empty string round-trip
plain non-JSON round-trip
JSON-looking string exact round-trip
whitespace exact round-trip
Unicode/emoji exact round-trip
no normalization
```

### 28.2 Directionality / ordering

```text
left→right single message
right→left single message
left→right A/B/C exact order
right→left X/Y/Z exact order
both directions active independently
no duplicate
```

### 28.3 Send semantics

```text
send returns Promise
resolved send accepted exactly once
send after orderly terminal rejects
send after lost terminal rejects
terminal-related rejection does not create message
```

Tests MUST NOT assert that send resolution means peer consumed message。

### 28.4 Close semantics

```text
left.close terminates pair orderly
right.close terminates pair orderly
repeated close is idempotent
close after close resolves
close after loss resolves and preserves lost
closed resolves exactly once
both endpoints observe terminal
```

### 28.5 Loss semantics

```text
lose() terminates both as lost
loss cause preserved for deterministic memory assertions
second lose cannot replace first terminal fact
loss after orderly close cannot rewrite closed
orderly close after loss cannot rewrite lost
```

### 28.6 Queue drain

```text
send A/B then close → receiver yields A/B then done
send A/B then lose → receiver yields A/B then done
terminal with empty queue → next returns done
no new inbound accepted after terminal
```

### 28.7 Iterator behavior

```text
one logical reader receives every accepted inbound message
iterator terminates normally on orderly close
iterator terminates normally on loss
iterator does not throw transport terminal as application message error
```

Multiple-reader misuse不是首批 stable behavior test。

### 28.8 No hidden domain semantics

```text
invalid JSON is not rejected
method-like strings are not interpreted
lost does not produce Runtime-specific error type
close does not produce Frame/Data outcome
```

---

## 29. Consumer Qualification

### Consumer 1 — Runtime Control

第一真实 consumer：

```text
@loomrealm/runtime-control
    one RuntimeControlSession
    one inbound dispatcher
    opaque string carrier
```

必须证明：

```text
MemoryCarrierPair runs Control/Frame protocol tests
carrier terminal can be observed without Foundation knowing Runtime semantics
runtime-control alone decides timeout/loss → Runtime-fatal behavior
```

### Consumer 2 — Renderer Control / Data

第二独立 consumer：

```text
@loomrealm/renderer-control
or
@loomrealm/data
```

必须证明：

```text
same MessageCarrier contract
same string payload model
different domain lifecycle interpretation
no Foundation specialization required
```

### Adapter qualification

随后：

```text
Memory carrier
WebSocket adapter
MessagePort adapter
```

应能通过同一组 carrier-level ordering/terminal contract assertions，并由上层 protocol trace验证 application equivalence。

---

## 30. Implementation Stages

实现状态（2026-08-20）：Stage A/B 已由本包源码与 §28 自动化测试关闭；Stage C–E 是随上层里程碑执行的真实消费者/生产 adapter qualification，不以本包内部 mock 提前冒充完成。

### Stage A — Package skeleton

创建：

```text
package.json
tsconfig.json
src/index.ts
src/message-carrier.ts
src/testing/index.ts
src/testing/memory-carrier-pair.ts
test/*
```

关闭条件：

```text
npm run build -w @loomrealm/foundation
```

成功，零 runtime dependency，source 不出现 Node/DOM/Platform API。

### Stage B — Memory carrier contract

实现 Frozen API + §28 tests。

关闭条件：

```text
npm test -w @loomrealm/foundation
```

全部通过。

### Stage C — Runtime Control adoption

让 `@loomrealm/runtime-control` 只通过 Foundation carrier运行 deterministic Control/Frame tests。

关闭条件：

```text
no duplicate carrier abstraction
one reader ownership explicit
terminal consequence entirely above Foundation
```

### Stage D — First production adapter

Hostra WebSocket adapter实现 `MessageCarrier`。

关闭：

```text
same carrier contract tests
same Runtime Control abstract trace
no adapter retry/reconnect
```

### Stage E — Second independent consumer + MessagePort

Renderer/Data + PWA MessagePort证明 Foundation 无需 domain/platform expansion。

这一步完成后，Foundation package boundary获得真实 cross-consumer qualification。

---

## 31. Review Checklist Before Coding

实现者开始前只需要确认：

```text
[ ] public API 与 §5 完全一致
[ ] send/close 都是 Promise<void>
[ ] CarrierClosed 只有 closed/lost 两个 variant
[ ] first-terminal-wins
[ ] no half-close
[ ] queued-before-terminal drains
[ ] one logical reader owner
[ ] string opaque
[ ] no connection establishment
[ ] no retry/reconnect
[ ] MemoryCarrierPair deterministic
[ ] testing export独立于 root
[ ] zero runtime dependencies
[ ] source无 Node/DOM/Platform API
```

如果实现需要突破其中任一项，应先修改/重新 review DESIGN，而不是在 source 中静默创造第二套 contract。

---

## 32. Package Closing Conditions

`@loomrealm/foundation` 首批实现可认为完成，当以下全部成立：

```text
1. §5 Frozen public/testing API已实现；
2. §28 observable test matrix全部通过；
3. zero runtime dependencies；
4. source platform-neutral；
5. MemoryCarrierPair无 timer/random scheduling；
6. terminal first-wins / drain semantics有明确测试；
7. no retry/reconnect/JSON/domain behavior；
8. Runtime Control可作为首个 consumer完整使用；
9. 没有为了未来需求提前加入 Clock/Queue/Deferred；
10. package root不泄漏 testing implementation。
```

达到这些条件即可进入 M1 的 Foundation implementation-qualified 状态。

“至少两个 independent production consumers”用于**验证 package boundary 的长期合理性**，不阻塞第一个 implementation commit；第二消费者在 Renderer Control/Data阶段完成 qualification。

---

## 33. Change Policy After This Closure

本文首批 core contract 已标记 Frozen for first implementation。

在真实 external compatibility boundary形成前，若实现发现 contract 存在根本错误，仍可按仓库 preimplementation governance 显式修正 current contract；但不得在 source 中偷偷偏离本文。

正常 additive evolution：

```text
new proven primitive
→ admission rule
→ design section
→ deterministic tests
→ implementation
```

任何改变以下语义都属于 core closure re-review：

```text
payload type
send/close Promise model
terminal variants
ordering
first-terminal-wins
queue drain
single logical reader
half-close policy
retry/reconnect policy
```

---

## 34. Final Invariants

1. **Foundation is small runtime mechanism, never `common/utils`.**  
2. **`MessageCarrier` carries opaque JavaScript strings only.**  
3. **`send()` and `close()` always use `Promise<void>`.**  
4. **Send resolution is local acceptance, never peer/application ACK.**  
5. **Message boundaries and per-direction order are preserved.**  
6. **Each carrier has one logical inbound reader owner.**  
7. **Carrier terminal fact is exactly `closed` or `lost`.**  
8. **First terminal fact wins and is immutable.**  
9. **Queued-before-terminal messages drain before iterator completion.**  
10. **No half-close is exposed.**  
11. **Foundation never establishes/reconnects a connection.**  
12. **Foundation/adapter never retries/replays/duplicates application messages.**  
13. **Carrier terminal fact has no built-in Runtime/Data business meaning.**  
14. **MemoryCarrierPair is deterministic and test-only.**  
15. **Production backpressure policy stays adapter-local until real common demand appears.**  
16. **Future primitives enter only through proven multi-consumer demand.**  
17. **Zero runtime dependencies and no Platform API remain first-class constraints.**
