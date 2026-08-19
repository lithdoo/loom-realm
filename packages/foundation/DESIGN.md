# `@loomrealm/foundation` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 最近复核：2026-08-19  
> 目标：为多个独立 capability 提供少量、无 LoomRealm authority、无平台绑定的运行 primitive。  
> 原则：只抽取真实跨 package 复用；禁止演化成 `common/utils`。

---

## 1. Position

```text
@loomrealm/foundation
    generic runtime mechanisms

@loomrealm/wire
    representation / JSON validation
```

两者正交：

```text
foundation     wire
     \         /
 protocol/capability
```

foundation 不解析 JSON/JSON-RPC，也不知道任何 LoomRealm method/domain noun。

---

## 2. Authority Boundary

允许：

```text
already-connected message carrier
resource close/ownership primitives
AbortSignal/timeout composition
small async queue/deferred primitives when proven necessary
Clock/testing primitives
```

禁止：

```text
Runtime / Frame / Activation / InputTarget
DataAuthority / generation / dataProfile
Render Domain / revision
Content/Game Package identity
protocol negotiation/dispatcher/RPC
WebSocket / MessagePort / Worker / child_process
filesystem / HTTP / Service Worker
```

---

## 3. Admission Rule

新增 primitive 前至少回答：

```text
1. 有两个独立 production package真实需要？
2. 无 LoomRealm domain authority？
3. 无 Desktop/PWA/Node/Browser concrete API？
4. 不抽会产生重复机制？
5. API可脱离 LoomRealm协议独立解释？
```

前四项必须 Yes；第五项做不到默认不进入 foundation。

---

## 4. MessageCarrier

首个真实 primitive：

```ts
export interface MessageCarrier {
  send(message: string): void | Promise<void>;
  messages(): AsyncIterable<string>;
  readonly closed: Promise<CarrierClosed>;
  close(): void | Promise<void>;
}
```

Carrier只表达：

```text
duplex
message-oriented
per-direction ordered
message boundary preserved
one logical inbound stream
terminal close/loss observable
```

Carrier不表达：

```text
JSON
UTF-8 byte semantics
JSON-RPC
connection identity
establishment/bootstrap
reconnect policy
send == peer ACK
close == domain success
carrier loss == Runtime failure
```

### Opaque string rule

`message: string` 对 foundation 是 **opaque string**。

当前 LoomRealm Runtime Control / Renderer Control / Renderer Data Profiles恰好都冻结：

```text
one carrier application unit
= one UTF-8 JSON text string
```

但这是上层 Profile policy，不是 foundation 对 string 的语义解释。

因此 foundation MUST NOT：

```text
JSON.parse message
measure protocol UTF-8 limit automatically
reject non-JSON string
route input.* / render.* / JSON-RPC methods
```

这些由 wire/profile/capability consumer负责。

---

## 5. Connection Establishment Is Out of Scope

foundation 不建立万能：

```text
connect/listen/accept
```

路径：

```text
Hostra Platform provisions WebSocket
→ transport-websocket adapts connected socket
→ MessageCarrier<string>

PWA Platform provisions/transfers MessagePort
→ transport-messageport adapts connected Port
→ MessageCarrier<string>
```

如果当前 Profile要求 JSON text，adapter使用：

```text
WebSocket text
MessagePort postMessage(string)
```

但“为什么必须 string JSON text”来自 Profile，而不是 MessageCarrier interface。

---

## 6. Single Reader Ownership

`messages()` 表示一个 logical inbound stream。

foundation 不规定 domain dispatcher，但 consumer必须有明确 reader ownership；例如：

```text
Runtime Control
    one RuntimeControlDispatcher reader

Renderer Data
    one Data dispatcher reader
```

不得由两个上层 manager竞争消费同一个 AsyncIterable。

这不是 foundation 的 protocol state，而是 carrier contract使 consumer能建立唯一 reader ownership。

---

## 7. Close Semantics

至少：

```text
close is idempotent or deterministically terminal
closed resolves exactly once with terminal fact
messages terminates after carrier terminal state
no adapter-created application retry/duplicate
```

不承诺：

```text
all prior sends were processed by peer
peer application accepted shutdown
Runtime/Data state implications
```

上层协议解释 terminal consequence。

---

## 8. Testing Primitive

第一批测试能力：

```text
MemoryCarrierPair
```

要求：

```text
deterministic message order/boundaries
deterministic close observation
fault injection for carrier loss
same interface as real adapters
```

测试不得反向定义 domain semantics。

---

## 9. Optional Future Primitives

只有真实重复需求出现后考虑：

```text
CloseOnce / cleanup aggregation
Deferred<T>
AsyncQueue<T>
serialized executor
Clock / FakeClock
withTimeout / AbortSignal helpers
```

foundation只提供机制。例如 timeout primitive只报告 time/abort，不决定 Frame ambiguity、Runtime failure、retry/unwind。

---

## 10. Explicit Non-goals

默认不进入：

```text
generic event bus
DI container
RPC framework
retry framework
serialization framework
logging/configuration facade
filesystem/HTTP helpers
platform detection
string/object convenience utils
business identifier types
```

需要 `utils.ts/misc.ts` 才好解释的代码默认不进入 foundation。

---

## 11. Dependency / Adapter Direction

```text
foundation
    ↑            ↑
    │ implements │ consumes
transport-*    capability packages
```

更准确：adapter与 capability都依赖最小 foundation contract；composition root负责把 adapter产物注入 role。

禁止：

```text
foundation → transport adapters
foundation → wire/domain packages
runtime-control/data → concrete WebSocket/MessagePort
```

---

## 12. Implementation Stages

### Stage 1

```text
MessageCarrier
CarrierClosed
MemoryCarrierPair
```

用 Runtime Control作为首个 consumer。

### Stage 2

实现 WebSocket adapter，证明 Memory/WebSocket相同 abstract Control trace。

### Stage 3

Renderer Control/Data成为第二独立 consumer，验证 carrier无需 domain特化。

### Stage 4

实现 MessagePort adapter，证明 current Profiles的 `postMessage(string)` mapping与 WebSocket application semantics等价。

只有经过至少两个独立 production consumers后，foundation package boundary才算被真实验证。

---

## 13. Final Invariants

1. foundation是小型运行 primitive包，不是 common/utils；
2. `MessageCarrier<string>` 的 string对 foundation完全 opaque；
3. JSON text语义属于上层 Profile/wire consumer；
4. foundation不负责 connection establishment/reconnect；
5. adapter把 already-provisioned physical transport转成 carrier；
6. carrier不拥有 Runtime/Data failure semantics；
7. one logical inbound stream允许上层建立唯一 reader ownership；
8. testing primitive deterministic且不反向定义 domain；
9. 新 primitive必须由真实跨 package需求拉动。