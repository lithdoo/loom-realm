# `@loomrealm/wire` 设计闭合稿

> 状态：Implementation Ready / Core Contract Frozen  
> 阶段：M1 Wire first implementation baseline  
> 最近复核：2026-08-20  
> 目标：为 LoomRealm 各协议提供最小、统一、无业务 authority 的 JSON / JSON-RPC representation 与 validation primitive，并把首批 public/error/resource/test contract 收口到可以直接实现、直接测试、直接被 Game Package / Runtime Control 消费的程度。  
> 冻结范围：本文 §§4–18 的首批 public contract、§§20–24 的第一实现基线与关闭条件。  
> 非冻结范围：generic schema/codec framework、RPC client/server/router、request-id allocator、protocol-specific limits/policy、member-counting 等；只有出现真实跨 package 重复需求后才进入新的 closure review。  
> 上层实施：[第一阶段交付计划](../../doc/30-implementation/phase-1-delivery-plan.md)  
> 分包规则：[独立分包与发布架构](../../doc/30-implementation/package-architecture.md)  
> Runtime Control Profile：[Main ⇄ Subsystem Runtime Control Application Profile v1](../../doc/15-contracts/runtime-control-profile-v1.md)

核心原则：

> **Wire 只拥有“一个值/文本/JSON-RPC envelope 在表示层上是否成立”的事实。它不建立 carrier、不拥有 Runtime/Frame/Data authority、不解释 method/error 的 LoomRealm 业务语义，也不把某个 Profile 的 hard limit 或 request-id policy 偷进 common primitive。**

---

## 1. Position

`@loomrealm/wire` 与 `@loomrealm/foundation` 是正交的两个最低层 capability：

```text
@loomrealm/foundation
    already-connected message carrier
    terminal / local close
    deterministic memory carrier
    no JSON/domain semantics

@loomrealm/wire
    JSON value model
    JSON text parse/stringify
    exact object shape
    UTF-8/depth measurement
    strict single-message JSON-RPC envelope
    no carrier/lifecycle/domain authority
```

依赖方向：

```text
foundation        wire
     \             /
      \           /
   contract / capability
            ↑
       role/runtime
            ↑
 adapter / launch integration
            ↑
     composition root
```

禁止把两者合并成 `common/utils`：

```text
transport lifetime != representation validation
```

---

## 2. Authority Boundary

Wire 可以知道：

```text
JSON primitive / array / object
finite number
safe integer
own property
closed object shape
JSON text syntax
UTF-8 encoded byte length
JSON nesting depth
JSON-RPC 2.0 envelope shape
JSON-RPC id representation
JSON-RPC params/result/error-object representation
```

Wire 不得知道：

```text
Runtime / Subsystem
Frame / Activation / InputTarget
Renderer / DataAuthority
Render Domain
Game Entry / subsystemKey semantics
Content identity
Platform module/path/URL
Node / Worker / MessagePort / WebSocket lifecycle
protocol-specific method direction/state machine
hello-first
request-id namespace reuse rules
deadline/retry/recovery
1 MiB / depth 64 or any other Profile hard limit
Frame error classification
```

判断规则：

> 如果一个 API 需要理解 LoomRealm domain noun、state machine、authority 或 deployment policy 才能解释，它不属于 Wire。

---

## 3. Dependency / Purity Boundary

首批实现 MUST：

```text
zero runtime dependencies
no dependency on @loomrealm/foundation
no filesystem / Fetch / network
no timers / randomness
no module loading
no carrier access
no platform detection
no mutation of validated input
no normalization / sanitization / cloning / freezing
```

允许依赖 ECMAScript 标准能力以及等价的标准 UTF-8 encoding primitive。

所有 validator / measurement primitive 都是 deterministic、synchronous、side-effect-free with respect to ordinary JSON-compatible inputs。

Wire MUST NOT主动调用 user getter / `toJSON()` 来决定一个对象是否有效；accessor-backed properties 本身不属于首批 JSON object model。

`Proxy` / exotic host object 不属于支持模型。实现不需要为任意 Proxy trap 提供稳定副作用或异常语义，但 MUST fail closed，不得把无法可靠检查的 exotic object 当作 `JsonObject`。

---

## 4. Exact Package Surface

首批 root export 冻结为：

```ts
export type JsonPrimitive = null | boolean | number | string;

export type JsonArray = readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type WirePathSegment = string | number;

export class WireValidationError extends TypeError {
  readonly path: readonly WirePathSegment[];
  constructor(message: string, path?: readonly WirePathSegment[]);
}

export class JsonTextSyntaxError extends SyntaxError {
  constructor(message?: string);
}

export function isJsonValue(value: unknown): value is JsonValue;
export function isJsonArray(value: unknown): value is JsonArray;
export function isJsonObject(value: unknown): value is JsonObject;

export function assertJsonValue(
  value: unknown,
): asserts value is JsonValue;

export function assertJsonArray(
  value: unknown,
): asserts value is JsonArray;

export function assertJsonObject(
  value: unknown,
): asserts value is JsonObject;

export function assertString(
  value: unknown,
): asserts value is string;

export function assertBoolean(
  value: unknown,
): asserts value is boolean;

export function assertFiniteNumber(
  value: unknown,
): asserts value is number;

export function assertSafeInteger(
  value: unknown,
): asserts value is number;

export function assertExactKeys(
  object: JsonObject,
  requiredKeys: readonly string[],
  optionalKeys?: readonly string[],
): void;

export function parseJsonText(raw: string): JsonValue;
export function stringifyJson(value: JsonValue): string;
export function utf8ByteLength(text: string): number;
export function jsonDepth(value: JsonValue): number;

export type JsonRpcId = string | number | null;
export type JsonRpcParams = JsonObject | JsonArray;

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: JsonRpcParams;
  readonly id: JsonRpcId;
}

export interface JsonRpcNotification {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: JsonRpcParams;
}

export interface JsonRpcSuccessResponse {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly result: JsonValue;
}

export interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: JsonValue;
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcId;
  readonly error: JsonRpcErrorObject;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

export function decodeJsonRpcMessage(value: JsonValue): JsonRpcMessage;
```

首批不建立：

```text
@loomrealm/wire/testing
@loomrealm/wire/internal
@loomrealm/wire/node
@loomrealm/wire/browser
```

也不同时暴露两套等价 helper。特别是只保留：

```text
assertExactKeys(...)
```

不再增加与其职责重叠的：

```text
assertNoUnknownKeys(...)
```

---

## 5. JSON Value Model

### 5.1 Primitive

合法：

```text
null
boolean
string
finite JavaScript number
```

数字：

```text
Number.isFinite(value) === true
```

因此拒绝：

```text
NaN
+Infinity
-Infinity
```

`-0` 是合法 finite number；Wire 不把它标准化成 `+0`。需要注意 `JSON.stringify(-0)` 的 ECMAScript 文本结果是 `"0"`；`stringifyJson` 不承诺 preserve JavaScript number identity 或 canonical textual identity。

### 5.2 Explicit rejection

不是 `JsonValue`：

```text
undefined
bigint
symbol
function
Date
Map
Set
RegExp
ArrayBuffer / TypedArray / DataView
Blob
MessagePort
class instance
cyclic graph
sparse array
array extra own application property
object accessor property
object symbol-keyed own property
object non-enumerable own application property
unsupported exotic/host object
```

`readonly` 只表示 TypeScript consumption discipline：

```text
readonly type != runtime Object.freeze
```

Wire validator 不冻结/复制输入。

---

## 6. JSON Object / Array Exact Semantics

### 6.1 JsonObject

首批 `JsonObject` MUST 是：

```text
non-null
not Array
prototype === Object.prototype OR null
all own application properties are string-keyed
all own application properties are enumerable data properties
every own property value is JsonValue
no accessor-backed own property
no symbol-keyed own property
```

普通 inherited `Object.prototype` property 不进入 JSON member set。

Generic JSON layer不会把 `"__proto__"`、`"constructor"` 等字符串赋予额外语义；它们只是普通 own JSON member name。上层 closed schema通常会因 unknown key 拒绝它们。实现做 own-key 判断时 MUST NOT使用 prototype-chain membership 代替 own-property semantics。

### 6.2 JsonArray

`JsonArray` MUST：

```text
Array.isArray(value) === true
length 范围内 0..length-1 每个 index 都存在
每个 element 都是 JsonValue
除 index 与内建 length 外没有额外 own application property
没有 own symbol application property
```

因此：

```js
const x = [];
x.length = 3;
```

不是 `JsonArray`。

原因：普通 `JSON.stringify()` 会把 sparse hole 静默投影成 `null`；Wire 不接受这种输入值与 serialized value 不一致的隐式转换。

### 6.3 Cycles vs shared references

循环必须拒绝：

```js
const x = {};
x.self = x;
```

但 non-cyclic shared reference 合法：

```js
const child = { x: 1 };
const root = { a: child, b: child };
```

Wire model 表示 JSON tree semantics，不要求每个 JavaScript object identity 全局唯一。

---

## 7. Primitive Validation Contract

`isJsonValue/isJsonArray/isJsonObject`：

```text
ordinary input → boolean
valid → true
invalid → false
no normalization
```

`assert*`：

```text
valid → returns normally
invalid → throws WireValidationError
```

`assertString` 只检查：

```text
typeof value === "string"
```

不检查：

```text
non-empty
length
method naming
identifier grammar
Unicode normalization
```

`assertBoolean` 只检查 boolean。

`assertFiniteNumber` 只检查 finite number。

`assertSafeInteger` 检查：

```text
Number.isSafeInteger(value) === true
```

它不检查：

```text
positive
non-zero
monotonic
namespace uniqueness
```

这些属于上层协议。

---

## 8. Closed-object Primitive

```ts
assertExactKeys(object, requiredKeys, optionalKeys?)
```

成功条件：

```text
object own enumerable JSON member key set
=
requiredKeys
∪ any subset of optionalKeys
```

并且每个 required key 都存在为 own member。

示例：

```ts
assertExactKeys(
  object,
  ["jsonrpc", "method", "id"],
  ["params"],
);
```

拒绝：

```text
missing required key
unknown extra key
inherited property pretending to satisfy required key
```

`requiredKeys/optionalKeys` 是 schema definition input，不是 untrusted wire payload。调用者 SHOULD传入无重复且互不冲突的 key list；首批 contract 不为错误 schema definition 建立单独稳定 error hierarchy。

Wire 不建立：

```text
Schema<T>
object schema builder
optional()/union()/literal() DSL
recursive codec graph
```

上层 protocol validator 使用这些小 primitive 直接写显式 schema。

---

## 9. Error Model

### 9.1 `WireValidationError`

表示：

```text
JavaScript value exists
but does not satisfy current Wire representation contract
```

稳定 public fact：

```ts
error instanceof WireValidationError
error.path
```

`path` 从 root 到失败位置：

```text
[]
["params"]
["error", "code"]
["items", 3, "name"]
```

规则：

```text
root mismatch → []
missing/unknown member → path terminates at that member name
array element mismatch → path includes numeric index
```

`path` 是错误发生时的 snapshot；调用者不得依赖后续修改输入会改变 path。

不冻结：

```text
exact Error.message wording
stack text
internal validation algorithm
```

### 9.2 `JsonTextSyntaxError`

表示：

```text
raw string 不是 ECMAScript JSON.parse 可接受的一个 JSON text
```

稳定 public fact：

```ts
error instanceof JsonTextSyntaxError
```

不冻结：

```text
native parser error wording
offset/line/column
engine-specific cause object
```

### 9.3 Syntax vs value-model failure

例如：

```text
"{"                 → JsonTextSyntaxError
"1e400"             → syntactically valid JSON number,
                       but parses to non-finite number
                       → WireValidationError
```

这一区分允许上层 JSON-RPC profile 将 syntax failure 与 envelope/schema failure 分层处理，而无需按 human-readable error message 分支。

---

## 10. JSON Text Contract

### 10.1 `parseJsonText`

```ts
parseJsonText(raw: string): JsonValue
```

流程语义：

```text
ECMAScript JSON.parse syntax
→ resulting value MUST satisfy Wire JsonValue model
→ return JsonValue
```

允许：

```text
top-level null
boolean
number
string
array
object
leading/trailing JSON whitespace
```

禁止自动做：

```text
schema validation
JSON-RPC classification
hard byte/depth policy
normalization
canonicalization
reviver
```

首批不实现独立 duplicate-object-member detector。Duplicate member name 的 observable result遵循当前 ECMAScript `JSON.parse` 行为；producer MUST NOT依赖 duplicate-name semantics。若未来出现真实 third-party parser interoperability requirement，再单独评估 strict duplicate detection，而不是把 custom parser 预建进 M1。

### 10.2 `stringifyJson`

```ts
stringifyJson(value: JsonValue): string
```

MUST：

```text
runtime-validate actual value first
reject unsupported/cyclic/sparse/accessor/exotic value
then serialize using ECMAScript JSON serialization semantics
return exactly one JSON text string
```

因此不会利用普通 `JSON.stringify` 的这些 silent conversions：

```text
NaN / Infinity → null
array hole → null
unsupported object member → omitted
custom toJSON/getter → application-defined conversion
```

因为这些输入会在 serialization 前被 Wire validation 拒绝。

`stringifyJson` 明确不是：

```text
canonical JSON
stable signature format
stable hash byte representation
pretty printer
sorted-key serializer
```

消费者不得依赖 object key textual order 做 identity/security/business equality。

---

## 11. UTF-8 Measurement

```ts
utf8ByteLength(text: string): number
```

定义：

> 返回该 JavaScript string 按 WHATWG/standard UTF-8 encoding semantics 编码后的 byte length；等价实现可以使用标准 `TextEncoder`，但 public contract 不绑定具体 API。

必须按实际 encoded bytes，而不是：

```text
String.length
UTF-16 code unit count
character count
grapheme count
Node-only Buffer policy
```

典型测试至少包含：

```text
ASCII
CJK
emoji / astral code point
combining sequence
empty string
```

Wire 只返回 measurement，不拥有 hard policy：

```text
utf8ByteLength(raw) <= 1 MiB
```

是当前 Runtime Control Profile 的约束，不是 Wire 全局约束。

---

## 12. JSON Depth

```ts
jsonDepth(value: JsonValue): number
```

冻结定义：

> depth = 任意 root → leaf 路径上经过的 Array/Object container 最大数量。

因此：

```text
null                    → 0
1                       → 0
"x"                     → 0
[]                      → 1
{}                      → 1
[1]                     → 1
[[]]                    → 2
{"a": {}}               → 2
{"a": [{"b": 1}]}      → 3
```

`jsonDepth` 不拥有最大允许值。

当前 Runtime Control Profile 可以执行：

```text
jsonDepth(value) <= 64
```

但 `64` 不进入 Wire common contract。

Validation/depth implementation MUST对深输入 fail deterministically；不得把 JavaScript call-stack overflow 当作定义好的 validation outcome。实现 SHOULD使用显式 work stack / equivalent non-recursive traversal，而不是依赖 unbounded recursive descent。

首批不冻结 generic member/node count primitive。当前 formal consumers 尚未证明需要统一 member-counting contract。

---

## 13. JSON-RPC Scope

Wire 只提供：

```text
strict one-message JSON-RPC 2.0 envelope representation
```

不提供：

```text
connection reader
RPC router
method registry
request-id allocator
Response correlation
pending request table
timeout/deadline
retry/replay
notification fanout
state machine
protocol negotiation
```

`decodeJsonRpcMessage(value)` 的输入已经是一个 `JsonValue`。

它不做：

```text
JSON text parsing
UTF-8 size policy
depth policy
LoomRealm method params validation
method direction/state validation
```

故意不提供：

```text
parseJsonRpcText(raw)
```

因为真实 Profile 必须能在 parse 与 generic envelope decode 之间插入自己的 byte/depth policy，而不是被 convenience API 绕过。

---

## 14. JSON-RPC Exact Envelope

### 14.1 Common version

所有 envelope：

```text
jsonrpc MUST exist
jsonrpc === "2.0"
```

额外 unknown envelope member 一律拒绝。

### 14.2 Request

Exact keys：

```text
required:
    jsonrpc
    method
    id

optional:
    params
```

规则：

```text
method: string
id: JsonRpcId
params absent OR JsonObject OR JsonArray
```

`method` 对 Wire 是 opaque exact string。Wire 不检查：

```text
non-empty
subsystem./frame. prefix
rpc. reserved method semantics
allowed direction
hello-first
```

### 14.3 Notification

Exact keys：

```text
required:
    jsonrpc
    method

optional:
    params
```

Notification 的定义是：

```text
id member absent
```

以下不是 Notification：

```json
{"jsonrpc":"2.0","method":"x","id":null}
```

它是一个带 `null` id 的 generic Request representation；当前 LoomRealm Profile 可进一步拒绝它。

### 14.4 Success Response

Exact keys：

```text
required:
    jsonrpc
    id
    result
```

`result` REQUIRED，即使业务意义是“无值”，也必须显式使用一个 `JsonValue`（通常 `null` 或 closed empty object，取决于上层 schema）。

不得同时出现 `error`。

### 14.5 Error Response

Exact keys：

```text
required:
    jsonrpc
    id
    error
```

Error object exact keys：

```text
required:
    code
    message

optional:
    data
```

规则：

```text
code: safe integer
message: string
data: absent OR JsonValue
```

Wire 不解释：

```text
-32700
-32600
-32602
LoomRealm domain error code
recoverable/fatal/commit semantics
```

不得同时出现 `result`。

---

## 15. JSON-RPC ID Boundary

Generic Wire representation：

```ts
type JsonRpcId = string | number | null;
```

其中 numeric id MUST是 safe integer：

```text
Number.isSafeInteger(id) === true
```

这样避免 fractional / unsafe numeric identifier 的跨实现精度歧义。

Wire 不进一步规定：

```text
positive
start at 1
monotonic
never reused
sender namespace
connection lifetime
```

例如 Runtime Control Profile v1 进一步冻结：

```text
positive safe integer 1..2^53-1
same sender + same Control Connection shared namespace
never reused during connection lifetime
never wrap
```

这是 Runtime Control authority，不得下沉到 Wire。

`null` 在 generic JSON-RPC representation 中保留；当前 LoomRealm Request producer不因此获得发送 null id 的许可，上层 Profile可以并且当前会进一步收窄。

---

## 16. Single-message vs Batch

JSON-RPC specification 存在 Batch 概念，但首批 Wire public surface 故意没有 Batch type/decoder。

```ts
decodeJsonRpcMessage(value)
```

只接受：

```text
one JsonObject representing one Request/Notification/Response
```

Array 输入：

```text
→ WireValidationError
```

这表示“不是 single-message decoder 的输入”，不是宣称 JSON-RPC 标准本身不存在 Batch。

当前 LoomRealm message-oriented Profiles进一步冻结：

```text
one carrier unit
= one UTF-8 JSON text string
= exactly one JSON-RPC message object
Batch forbidden
```

Batch policy 仍由 Profile拥有。

---

## 17. JSON-RPC Classification Algorithm

`decodeJsonRpcMessage` 的 observable classification 等价于：

```text
assert JsonObject
assert jsonrpc === "2.0"

if own "method" exists:
    if own "id" exists:
        validate exact Request
        return JsonRpcRequest
    else:
        validate exact Notification
        return JsonRpcNotification
else:
    require own "id"
    if own "result" exists AND !own "error":
        validate exact Success Response
        return JsonRpcSuccessResponse
    if own "error" exists AND !own "result":
        validate exact Error Response
        return JsonRpcErrorResponse
    otherwise:
        WireValidationError
```

因此明确拒绝：

```text
{}
method + result
method + error
response without id
result + error together
response with params
request with unknown key
error object with unknown key
params primitive
jsonrpc other than exact "2.0"
```

Decoder 不 mutate、normalize 或 clone input。返回值可以安全地被上层按 readonly representation 消费，但 Wire 不承诺返回一个新 object identity。

---

## 18. Resource / Policy Boundary

Wire 提供 measurement：

```text
utf8ByteLength
jsonDepth
safe-integer assertion
```

Wire 不提供当前首批全局 constant：

```text
MAX_MESSAGE_BYTES
MAX_JSON_DEPTH
MAX_REQUEST_ID
```

原因：这些数值属于具体 Profile/协议或 domain contract。

以 Runtime Control 为例：

```text
Profile:
    max application message <= 1 MiB
    max JSON nesting depth <= 64
    positive request id <= 2^53-1

Wire:
    utf8ByteLength(raw)
    jsonDepth(value)
    assertSafeInteger(value)
```

这保证：

```text
shared mechanism
!= shared policy authority
```

首批删除 `member counting`：当前没有 formal consumer 给出共享 member/node hard policy，提前冻结会制造预测性 abstraction。

---

## 19. Current Proven Consumers

首批 public surface 只由当前已知 formal consumers 驱动。

### Game Package v1

需要：

```text
JsonValue
JsonObject
assertJsonValue / assertJsonObject
assertJsonArray as needed
assertString / finite/safe integer primitives as needed
assertExactKeys
parseJsonText when composition chooses to pass raw document text
```

Game Package仍拥有：

```text
formatVersion exact 1
Descriptor {key}
key uniqueness / case sensitivity
initial target declared
module/platform field rejection
```

这些不进入 Wire。

### Runtime Control

需要：

```text
utf8ByteLength
parseJsonText
jsonDepth
decodeJsonRpcMessage
assertExactKeys
primitive assertions
```

Runtime Control仍拥有：

```text
one carrier reader
hello-first
method schema/direction/state
shared sender request-id namespace
positive id / never reuse
finite deadlines
no retry
Frame failure semantics
```

### Renderer Control / Data

未来实现可复用同一：

```text
JsonValue
JSON text
exact keys
UTF-8/depth
single-message envelope/representation primitive when protocol requires
```

但不会因为“未来可能需要”提前扩张首批 surface。

准入规则：

> 一个新 Wire public primitive 在进入 Core Contract 前，至少需要一个当前 formal consumer，并且该能力不能由已有小 primitive 清晰表达；预测性复用不是准入理由。

---

## 20. Runtime Control Consumption Pipeline

当前 message-oriented Runtime Control 的标准分层消费链：

```text
@loomrealm/foundation MessageCarrier
        ↓ messages(): string
raw application unit
        ↓
Runtime Control Profile byte-limit gate
        ↓ uses utf8ByteLength(raw)
parseJsonText(raw)
        ↓
Runtime Control Profile depth-limit gate
        ↓ uses jsonDepth(value)
decodeJsonRpcMessage(value)
        ↓
connection-wide RuntimeControlDispatcher
        ↓
method-specific closed schema validator
        ↓
Subsystem Control / Frame state machine
```

责任对应：

```text
Foundation
    message boundary / order / terminal

Wire
    representation / syntax / generic envelope

Application Profile
    unit mapping / byte-depth hard policy / Batch policy

Protocol capability
    method schema / ids / direction / state / failure
```

禁止反向泄漏：

```text
Wire must not read MessageCarrier
Foundation must not parse JSON
Wire must not know frame.initialize
Runtime Control must not redefine generic JsonValue inconsistently
```

---

## 21. Package / Build Shape

第一实现物理布局：

```text
packages/wire/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── errors.ts
│   ├── json-value.ts
│   ├── validation.ts
│   ├── exact-keys.ts
│   ├── json-text.ts
│   ├── limits.ts
│   └── json-rpc.ts
└── test/
    ├── json-value.test.mjs
    ├── exact-keys.test.mjs
    ├── json-text.test.mjs
    ├── limits.test.mjs
    ├── json-rpc.test.mjs
    └── package-boundary.test.mjs
```

Package metadata baseline与 Foundation 保持同类工程纪律：

```text
name = @loomrealm/wire
version = 0.1.0-alpha.0
ESM
Node >= 20
sideEffects = false
root export only
zero runtime dependencies
TypeScript declaration output
browser-compatible source
```

首批 source MUST NOT import/use：

```text
node:*
Buffer as public/runtime requirement
@loomrealm/foundation
WebSocket
MessagePort
Worker
filesystem
Fetch
```

UTF-8 measurement可使用跨目标标准 `TextEncoder` 或 observable semantics 等价实现；package surface 不暴露 encoder object。

不建立 `/testing` export，因为当前所有 primitive 都是 deterministic pure value operations，不需要独立 fake implementation。

---

## 22. Automated Test Matrix

### 22.1 JSON model

```text
json-null-accepted
json-boolean-accepted
json-string-accepted
finite-number-accepted
negative-zero-accepted
nan-rejected
positive-infinity-rejected
negative-infinity-rejected
undefined-bigint-symbol-function-rejected
```

### 22.2 Object / Array shape

```text
plain-object-accepted
null-prototype-object-accepted
class-instance-rejected
Date-Map-Set-rejected
accessor-property-rejected
symbol-own-property-rejected
non-enumerable-application-property-rejected
dense-array-accepted
sparse-array-rejected
array-extra-property-rejected
cycle-rejected
shared-child-non-cycle-accepted
```

### 22.3 Primitive / exact keys

```text
string-boolean-finite-safe-integer-boundaries
safe-integer-max-min
unsafe-integer-rejected
exact-required-keys
exact-optional-keys
missing-required-key-rejected
unknown-key-rejected
inherited-key-does-not-satisfy-required
```

### 22.4 JSON text

```text
parse-top-level-primitives
parse-object-array
parse-leading-trailing-whitespace
malformed-json-throws-json-text-syntax-error
valid-json-overflow-number-throws-wire-validation-error
stringify-valid-roundtrip-value-semantics
stringify-rejects-invalid-runtime-value-before-native-silent-conversion
stringify-is-not-canonical-order-contract
```

### 22.5 UTF-8 / depth

```text
utf8-ascii
utf8-cjk
utf8-emoji
utf8-combining-sequence
utf8-empty
depth-primitive-zero
depth-empty-container-one
depth-nested-array
depth-mixed-object-array
very-deep-input-fails-or-measures-without-js-call-stack-overflow
```

### 22.6 JSON-RPC

```text
request-with-id
request-with-null-id-generic-wire-accepted
notification-id-member-absent
notification-id-null-is-not-notification
params-object-accepted
params-array-accepted
params-primitive-rejected
success-response-result-required
error-response-exact-object
error-code-safe-integer
result-error-mutual-exclusion
response-id-required
jsonrpc-exact-2.0
unknown-envelope-key-rejected
unknown-error-key-rejected
opaque-method-string-accepted
array-batch-rejected-by-single-message-decoder
```

### 22.7 Error / package boundary

```text
validation-error-stable-class
validation-error-root-path
validation-error-nested-path
syntax-error-stable-class
human-message-not-used-for-test-branching
zero-runtime-dependencies
root-has-no-testing-export
source-has-no-domain-noun-import
source-has-no-foundation-import
source-has-no-node-platform-carrier-api
```

Wire tests MUST NOT测试：

```text
hello-first
Frame lifecycle
Data generation
Runtime failure
request timeout/retry
Platform transport behavior
```

这些属于消费者 contract tests。

---

## 23. Implementation Stages

### Stage A — Package skeleton

创建：

```text
package.json
tsconfig.json
src/index.ts
test/
```

关闭：

```text
build works
ESM exports work
zero runtime dependency
browser-neutral source baseline
```

### Stage B — JSON model / error / exact shape

实现：

```text
JsonValue types
WireValidationError
is/assert JSON primitives
plain object / dense array / cycle rules
assertExactKeys
```

关闭 §§5–9、§22.1–22.3。

### Stage C — JSON text / measurement

实现：

```text
JsonTextSyntaxError
parseJsonText
stringifyJson
utf8ByteLength
jsonDepth
```

关闭 §§10–12、§22.4–22.5。

### Stage D — JSON-RPC single-message envelope

实现：

```text
JsonRpc* types
decodeJsonRpcMessage
strict closed envelope
safe numeric ids/error code
```

关闭 §§13–17、§22.6。

### Stage E — Package qualification

关闭：

```text
npm package export tests
zero runtime dependency test
no domain/foundation/platform dependency test
all unit tests
build from clean install
```

### Stage F — Real consumer qualification

随上层里程碑执行，不用 Wire 内部 mock 冒充完成：

```text
M2 Game Package consumes JsonValue/exact-shape primitives
M3 Runtime Control consumes JSON text/depth/JSON-RPC primitives
later Renderer/Data consumers reuse without Wire authority growth
```

只有 Stage A–E 完成后，Wire 可从：

```text
Implementation Ready
```

更新为：

```text
Implemented Baseline
```

Stage F 是 cross-package qualification，不阻止首批 package implementation baseline，但会验证 Frozen surface 是否真实服务消费者。

---

## 24. Closure Criteria

开始实现前，本文已经关闭以下设计问题：

```text
public type/function/error names exact
JsonObject exact plain-object semantics
JsonArray dense/no-extra-property semantics
cycle reject/shared-reference allow
finite/safe-number boundary
closed-object one primitive
syntax error vs value validation error
stable error class/path, unstable human message
JSON.parse/stringify boundary
no canonical JSON promise
UTF-8 measurement semantics
depth root/container definition
no member-count primitive
strict single-message JSON-RPC envelope
notification = id absent
numeric JSON-RPC id = safe integer
Runtime Control positive/namespace id policy stays upstream
error code representation vs domain semantics separated
Batch not modeled by Wire
no combined parseJsonRpcText convenience bypass
zero runtime dependency / no foundation dependency
exact automated test matrix
real consumer qualification path
```

实现阶段不得再次自行决定上述 public semantics；如果代码发现本文存在真实不可实现/互相矛盾之处，应先回到 closure review，而不是在 implementation 中静默改 contract。

Implementation Ready 的关闭定义：

```text
an implementer chooses algorithms and file-private helpers
but does not choose public behavior
```

---

## 25. Explicit Non-goals / Re-evaluation Triggers

首批明确不建立：

```text
Schema<T> / Codec<T>
generic validation DSL
JSON Schema engine
canonical JSON
streaming JSON parser
duplicate-key custom parser
member/node counting API
RPC router/dispatcher
RPC client/server
method registry
request-id allocator
pending request correlation
timeout/retry/replay
MessageCarrier integration
WebSocket / MessagePort adapter
protocol negotiation
LoomRealm domain types/errors
Profile hard-limit constants
```

只在出现真实需求时重评，例如：

```text
two or more capability packages duplicate the same non-trivial primitive
third-party non-JS implementation requires stricter parse interoperability
streaming payloads require pre-parse structural limit enforcement
multiple Profiles freeze an identical reusable member/node-count policy
canonical bytes become a real signature/hash interoperability contract
```

重评必须说明：

```text
current consumers
why existing primitive composition is insufficient
new authority boundary
compatibility/version consequence
conformance tests
```

---

## 26. Final Invariants

1. Wire 只拥有 representation / validation fact，不拥有 LoomRealm domain authority；
2. Foundation 与 Wire 正交：Foundation 不解析 JSON，Wire 不读 carrier；
3. `JsonValue` 只接受 finite、可无歧义投影到 JSON tree 的 ordinary JS value；
4. plain object、dense array、cycle/shared-reference 行为精确定义；
5. validator 不 normalize/clone/freeze/sanitize input；
6. closed schema只提供 `assertExactKeys` 小 primitive，不建立 schema DSL；
7. JSON text syntax failure与 parsed-value validation failure使用稳定不同 error class；
8. human-readable Error.message 不是稳定 API；
9. `stringifyJson` 先验证再序列化，不利用 native silent conversion；
10. canonical JSON/key order/signature bytes不属于首批 contract；
11. UTF-8/depth由 Wire measurement，hard limit由具体 Profile拥有；
12. 首批没有 member/node counting；
13. JSON-RPC decoder只处理一个 strict closed message envelope；
14. Notification 由 `id` member absent 定义；`id:null` 不是 Notification；
15. generic numeric JSON-RPC id/error code使用 safe integer，positive/namespace/lifetime policy留在上层；
16. method/error code 业务含义不进入 Wire；
17. Batch不进入首批 public surface；当前 LoomRealm Profiles自行禁止 Batch；
18. Wire 不提供 router/client/server/request-id/deadline/retry；
19. package 零 runtime dependency，且不依赖 Foundation/domain/platform package；
20. 每个首批 public primitive都有当前 formal consumer或直接支撑另一个已证明 primitive；
21. 自动化测试逐条证明 public contract，而不是测试内部实现；
22. 实现者只选择算法，不再替项目决定 public semantics。
