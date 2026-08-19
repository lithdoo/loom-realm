# `@loomrealm/wire` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 最近复核：2026-08-19  
> 目标：为 LoomRealm 各协议提供最小、统一、无业务 authority 的 JSON / JSON-RPC wire primitive。  
> 原则：先服务真实消费者；不预建通用 RPC/schema framework。

---

## 1. Position

`@loomrealm/wire` 只收敛跨协议共享的表示层事实：

```text
JSON value model
safe integer / finite number
closed object shape
JSON-RPC envelope
UTF-8 byte measurement
JSON depth/member counting
```

它是 dependency graph 最低层之一，不是 Transport、RPC framework 或 LoomRealm protocol总包。

---

## 2. Authority Boundary

可以知道：

```text
JSON
JSON-RPC
string/number/integer/boolean/null
array/object/member
UTF-8 byte length
depth
closed shape
```

不得知道：

```text
Runtime / Subsystem
Frame / Activation / InputTarget
Renderer / DataAuthority
Render Domain
Game Package
Content identity
Platform port
protocol-specific method/error semantics
```

如果一个 API 需要理解 LoomRealm domain noun 才能解释，就不属于 wire。

---

## 3. Dependency Direction

```text
wire        foundation
  \          /
 contract / capability
        ↑
 runtime / role
        ↑
 technical adapters
        ↑
 composition roots
```

`wire` 与 `foundation` 是正交低层：

```text
wire
    representation/validation primitives

foundation
    async/lifecycle/already-connected carrier mechanisms
```

wire MUST NOT依赖 role/adapter/product/foundation messaging semantics。

---

## 4. JSON Value Model

候选 public types：

```ts
type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };
```

Runtime boundary拒绝：

```text
undefined
bigint
symbol
function
NaN / Infinity / -Infinity
ArrayBuffer / Blob / MessagePort / Host object
非 JSON 数据结构
```

普通 wire object默认只接受 JSON-compatible plain object semantics。

---

## 5. Primitive Validation

候选：

```ts
isJsonValue(value)
isJsonObject(value)
assertJsonValue(value)
assertJsonObject(value)
assertString(value)
assertBoolean(value)
assertFiniteNumber(value)
assertSafeInteger(value)
```

这些只验证 wire-level fact，不验证字段业务含义。

---

## 6. Closed-object Primitive

正式协议通常是 closed schema，因此提供极小 primitive：

```ts
assertExactKeys(object, requiredKeys, optionalKeys?)
assertNoUnknownKeys(object, allowedKeys)
```

不建立完整 JSON Schema DSL。

---

## 7. JSON-RPC Envelope

候选：

```ts
type JsonRpcId = string | number;

interface JsonRpcRequest { ... }
interface JsonRpcNotification { ... }
interface JsonRpcSuccessResponse { ... }
interface JsonRpcErrorResponse { ... }

type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;
```

parser只负责：

```text
jsonrpc === "2.0"
Request/Notification/Success/Error envelope
id wire legality
result/error mutual exclusion
closed envelope
JSON-compatible params/result/error.data
```

method 只是 opaque string。

例如 wire层可以看到：

```text
"subsystem.hello"
"frame.initialize"
"renderer.hello"
```

但不得知道这些 method 的方向、状态机或字段业务语义。

---

## 8. JSON Text Boundary

当前 LoomRealm message-oriented profiles统一选择：

```text
one carrier application unit
= one UTF-8 JSON text string
```

`wire` 可以提供：

```ts
parseJsonText(raw: string): JsonValue
stringifyJson(value: JsonValue): string
utf8ByteLength(text: string): number
```

但：

```text
carrier.send/messages
WebSocket/MessagePort mapping
connection close/reconnect
```

属于 foundation/adapter/profile，不属于 wire。

统一 JSON text的意义是让 WebSocket 与 MessagePort共享完全相同 application value model；PWA Structured Clone不得形成第二套 wire type system。

---

## 9. Size / Depth Primitives

wire可以提供统一的：

```text
UTF-8 byte count
JSON nesting depth
array/object member count
safe integer check
```

具体 hard limit 数值由正式协议/Profile决定。

禁止把某个协议的 `1 MiB / 64 depth` 变成 wire package全局产品 policy，除非未来所有消费者确实统一冻结该规则。

---

## 10. Explicit Non-goals

当前不建立：

```text
Schema<T> framework
Codec<T> framework
generic validation DSL
RPC router/dispatcher
RPC client/server
request ID allocator
request timeout/retry/replay
MessageCarrier
WebSocket / MessagePort
protocol negotiation
Frame/Runtime/Data domain types
```

---

## 11. Testing

至少覆盖：

```text
JSON primitive acceptance/rejection
finite/safe integer boundaries
closed-object unknown-key rejection
JSON-RPC envelope classification
result/error exclusivity
UTF-8 byte measurement
JSON depth/member counting
JSON text parse/stringify roundtrip for allowed model
undefined/BigInt/NaN/Infinity rejection
opaque method strings including current LoomRealm names
```

不在 wire测试任何 Frame lifecycle、Control hello、Data generation等 domain rule。

---

## 12. Final Invariants

1. `wire` 只拥有表示/验证 primitive，无 LoomRealm authority；
2. method/error业务含义不进入本包；
3. JSON-RPC dispatcher/request ID/deadline不进入本包；
4. MessageCarrier/Transport不进入本包；
5. current message-oriented profiles统一用 UTF-8 JSON text string，但具体 mapping由各 Profile冻结；
6. limits primitive可共享，hard policy归协议；
7. 不建立预测性 schema/RPC framework。