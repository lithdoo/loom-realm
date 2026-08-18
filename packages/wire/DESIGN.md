# `@loomrealm/wire` 设计草案

> 状态：Draft  
> 阶段：Package boundary / implementation planning  
> 目标：为 LoomRealm 各协议提供最小、统一、无业务 authority 的 JSON / JSON-RPC wire primitive。  
> 原则：先服务第一个真实消费者，再按实际互操作需求扩展；不预建通用协议框架。

---

## 1. 为什么存在这个包

LoomRealm 的多个协议都会共享一组底层 wire 事实，例如：

```text
JSON value model
JSON object / array shape
safe integer / finite number
closed object
JSON-RPC envelope
UTF-8 byte measurement
JSON depth / member count
```

如果这些规则分别由 `runtime-control`、`renderer-control`、`data`、`content` 等包各自实现，就可能逐渐产生不一致：

```text
同一个数字在不同协议中合法性不同
同一种未知字段在不同协议中处理不同
JSON-RPC Request / Response envelope 解释不同
相同 hard limit 使用不同 byte/depth 计算方式
```

因此 `@loomrealm/wire` 只收敛“跨协议必须一致、但不拥有 LoomRealm 领域语义”的 primitive。

它是 dependency graph 的最低层之一，不是 LoomRealm 协议总包，也不是 transport/RPC framework。

---

## 2. Authority Boundary

`@loomrealm/wire` 可以知道：

```text
JSON
JSON-RPC
number
integer
string
array
object
member
UTF-8
byte length
depth
closed shape
```

`@loomrealm/wire` 不得知道：

```text
Runtime
Subsystem
Frame
Activation
InputTarget
Renderer
DataAuthority
Render Domain
Game Package
Content identity
Session lifecycle
protocol-specific method name
protocol-specific error meaning
```

判断原则：

> 如果一个类型、函数或 error code 需要理解 LoomRealm domain noun 才能解释，它通常不属于 `wire`。

例如：

```text
VALID                         INVALID
safeInteger                   frameId
jsonRpcRequest                subsystem.hello
unknownMember                 staleActivation
utf8ByteLength                renderRevisionGap
jsonDepth                     runtimeFailed
```

---

## 3. 依赖方向

目标依赖关系：

```text
@loomrealm/wire
        ↑
        │
contract / capability packages
        ↑
        │
runtime / role packages
        ↑
        │
technical adapters
        ↑
        │
composition roots
```

第一批预期消费者：

```text
@loomrealm/game-package
@loomrealm/runtime-control
```

后续消费者可能包括：

```text
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
```

禁止反向依赖任何 role、adapter 或 product package。

---

## 4. 第一版目标能力

第一版只实现足够支撑第一个真实协议消费者的 primitive。

### 4.1 JSON value model

候选 public types：

```ts
type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonArray | JsonObject;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };
```

Runtime boundary 必须明确拒绝：

```text
undefined
bigint
symbol
function
NaN
Infinity
-Infinity
非 JSON 数据结构
```

是否接受任意 prototype object，必须由实现测试明确冻结；默认倾向只把普通 JSON-compatible object 视为 wire object。

### 4.2 Primitive assertions / predicates

候选能力：

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

这些 helper 只验证 wire-level fact，不验证字段业务含义。

### 4.3 Closed-object primitive

LoomRealm 正式协议通常要求 closed schema，因此需要一个极小的 object-shape primitive。

候选能力：

```ts
assertExactKeys(object, requiredKeys, optionalKeys?)
assertNoUnknownKeys(object, allowedKeys)
```

第一版不实现完整 JSON Schema，不引入通用 schema DSL。

### 4.4 JSON-RPC envelope

候选 public types：

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

候选 parser：

```ts
parseJsonRpcMessage(value): JsonRpcMessage
```

它只负责：

```text
jsonrpc === "2.0"
Request / Notification / Success / Error envelope 分类
id 的 wire-level 合法性
result 与 error 的互斥
closed envelope shape
JSON-compatible params/result/error.data
```

它不得知道任何 LoomRealm method：

```text
subsystem.hello
subsystem.status
frame.create
frame.activate
...
```

method 在 `wire` 中只是 opaque string。

---

## 5. 暂不实现

第一轮明确不建立：

```text
Schema<T>
Codec<T>
Validator<T> framework
通用 validation DSL
RPC router
RPC dispatcher
RPC client/server
request ID allocator
request timeout
retry/replay
WebSocket
MessagePort
protocol negotiation
protocol version registry
Frame / Session / Runtime identifier
LoomRealm method registry
conformance framework
```

这些能力只有在出现真实、稳定的跨消费者需求后才重新评估归属。

---

## 6. Validation Error Model

第一版 error model 只需要支持：

```text
机器可分类
人类可定位
上层可包装
不带 domain semantics
```

候选：

```ts
class WireValidationError extends Error {
  readonly code: WireValidationErrorCode;
  readonly path: readonly (string | number)[];
}
```

候选 wire-level code：

```text
INVALID_TYPE
INVALID_JSON_VALUE
INVALID_NUMBER
INVALID_INTEGER
MISSING_MEMBER
UNKNOWN_MEMBER
INVALID_JSON_RPC
LIMIT_EXCEEDED
```

禁止出现：

```text
INVALID_FRAME_ID
UNKNOWN_RUNTIME
STALE_ACTIVATION
INVALID_RENDER_REVISION
```

上层协议包可以捕获 `WireValidationError`，再形成自己的 protocol error semantics。

---

## 7. Bounded Wire Primitive

以下能力不在第一 commit 中强制实现，但预留为真实协议 consumer 驱动的下一层 primitive：

```ts
utf8ByteLength(value: string): number
jsonDepth(value: JsonValue): number
jsonMemberCount(value: JsonValue): number
```

只有在正式协议或 conformance fixture 实际需要相同计算规则时才加入。

不得因为“未来可能有 hard limit”而提前设计统一 limit policy。

```text
wire 提供 measurement primitive
protocol package 定义自己的 limit
```

例如：

```text
wire: utf8ByteLength(method)
runtime-control: method/field-specific maximum
```

---

## 8. Public Surface 原则

第一版倾向只开放一个很小的 root export：

```text
@loomrealm/wire
```

内部可以按文件组织：

```text
src/json.ts
src/validation.ts
src/json-rpc.ts
src/error.ts
src/index.ts
```

在出现真实消费者需要独立 subpath 之前，不为了目录对称提前暴露：

```text
@loomrealm/wire/json
@loomrealm/wire/rpc
@loomrealm/wire/testing
```

public API 应小于内部实现。

---

## 9. 第一消费者：`Subsystem Control v1`

`wire` 的第一轮设计不以“自己完整”为结束，而以能自然支撑一个真实协议为验证。

首个建议 consumer：

```text
@loomrealm/runtime-control/control
    subsystem.hello
```

目标调用形态类似：

```ts
const message = parseJsonRpcMessage(raw);
const hello = parseSubsystemHello(message);
```

边界判断：

```text
parseJsonRpcMessage()       → wire
parseSubsystemHello()       → runtime-control/control
```

如果实现 `subsystem.hello` 时出现以下情况：

```text
runtime-control 重复实现纯 JSON / JSON-RPC primitive
```

则考虑下沉到 `wire`。

如果出现：

```text
wire 需要理解 key / bootstrapToken / protocolVersions / ready
```

则说明 `wire` 边界上浮过度，应把逻辑移回 `runtime-control`。

---

## 10. 实施阶段

### Stage 0 — Boundary draft

当前文档完成后关闭。

退出条件：

```text
职责边界清晰
第一消费者明确
非目标明确
不要求实现代码
```

### Stage 1 — Minimal package skeleton

创建：

```text
packages/wire/
├── package.json
├── tsconfig.json
├── README.md
├── DESIGN.md
├── src/
└── test/
```

退出条件：

```text
workspace build PASS
exports 显式
0 runtime dependencies，除非真实需求证明必要
Node/TypeScript baseline 与 monorepo 一致
```

### Stage 2 — JSON primitives

实现：

```text
JsonValue / JsonObject / JsonArray
finite number
safe integer
object/value assertions
closed-object primitive
WireValidationError
```

退出条件：

```text
boundary tests PASS
unknown member behavior frozen
number semantics frozen
JSON-compatible object semantics frozen
```

### Stage 3 — JSON-RPC envelope

实现：

```text
Request
Notification
Success Response
Error Response
parseJsonRpcMessage
```

退出条件：

```text
四类 envelope positive fixtures PASS
malformed/ambiguous envelope negative fixtures PASS
closed schema PASS
wire 不含 LoomRealm method/domain concept
```

### Stage 4 — First real consumer

创建最小 `@loomrealm/runtime-control`，只实现足够验证：

```text
Subsystem Control v1
subsystem.hello
```

退出条件：

```text
runtime-control 直接消费 @loomrealm/wire
hello parser 不复制 wire primitive
wire 不理解 hello domain semantics
```

### Stage 5 — Boundary review / v0.1 closure

对 Stage 4 暴露的实际摩擦做一次收敛。

允许：

```text
rename
减少 public API
补一个被两个以上 consumer 真正共享的 primitive
修正 error/path ergonomics
```

禁止：

```text
趁机实现 renderer/data/content 的预测性需求
建立 generic RPC framework
加入 transport abstraction
```

退出后可把当前设计状态从 `Draft` 调整为 `Implemented / Stabilizing`。

---

## 11. 测试策略

`wire` 测试应以小型、确定性的 boundary test 为主。

### Number

```text
0                         PASS
-1                        PASS
Number.MAX_SAFE_INTEGER   PASS
MAX_SAFE_INTEGER + 1      FAIL
1.5                       FAIL as safe integer
NaN                       FAIL
Infinity                  FAIL
```

### JSON value

```text
null/string/bool          PASS
nested object/array       PASS
undefined                 FAIL
bigint                    FAIL
function                  FAIL
```

### Closed object

```text
required only             PASS
required + optional       PASS
missing required          FAIL
unknown field             FAIL
```

### JSON-RPC

```text
Request                    PASS
Notification               PASS
Success Response           PASS
Error Response             PASS
wrong jsonrpc              FAIL
result + error             FAIL
invalid id                 FAIL
unknown envelope member    FAIL
```

第一轮不以 fuzz/property testing 为阻塞项；如后续发现 parser surface 足够稳定，可增加生成式测试。

---

## 12. Dependency / Runtime Policy

默认目标：

```text
Node.js >= 20
TypeScript
ESM
0 runtime dependencies
```

`0 runtime dependencies` 是当前偏好，不升级为永恒架构事实。

如果未来引入第三方依赖，必须回答：

```text
它解决的稳定能力是什么？
为什么标准库/小型本地 primitive 不足？
是否改变 wire observable semantics？
是否把 validation framework 的版本语义泄漏给上层？
```

第一版不引入 Zod/Ajv 等 schema framework。

---

## 13. Definition of Done

`@loomrealm/wire` 第一轮“优雅闭环”不是功能很多，而是边界经过真实 consumer 验证。

v0.1 closure 必须同时满足：

```text
1. package skeleton 存在且 workspace build/test 可执行
2. JSON primitive semantics 有 executable tests
3. JSON-RPC envelope 有 executable tests
4. closed-object 行为已冻结
5. error path/code 足够被上层消费
6. @loomrealm/runtime-control 的 subsystem.hello 已真实消费 wire
7. runtime-control 不复制通用 wire 规则
8. wire 中不存在 LoomRealm domain authority
9. wire 中不存在 transport / dispatcher / lifecycle
10. public surface 已做一次删减 review
```

满足这些条件后，第一轮停止扩展 `wire`，继续推进 Runtime Control vertical slice。

---

## 14. 后续新增能力的门槛

任何新 API 进入 `wire` 前至少满足一项：

```text
两个以上正式协议包需要相同 observable semantics
或
一个 Frozen/near-Frozen 协议明确要求统一 wire computation
```

并且必须同时满足：

```text
没有 LoomRealm domain authority
没有 transport ownership
可以被独立测试
可以被多个上层包复用
```

否则默认留在最近的上层 capability package。

---

## 15. 当前下一步

本草案落地后，不继续扩写设计。

下一步进入：

```text
Stage 1 — Minimal package skeleton
```

随后立即实现：

```text
Stage 2 — JSON primitives
Stage 3 — JSON-RPC envelope
```

完成后创建最小 `@loomrealm/runtime-control/control`，使用 `subsystem.hello` 验证 package boundary。

核心节奏：

```text
wire primitive
    ↓
真实 protocol consumer
    ↓
boundary review
    ↓
停止扩展 wire
    ↓
继续 Runtime vertical slice
```

这比先把 `wire` 设计成完整框架更符合 LoomRealm 当前“实现驱动细化”的开发阶段。
