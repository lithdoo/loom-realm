# ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics

> 状态：Accepted  
> 日期：2026-08-21  
> 影响范围：Runtime Control Application Profile v1、Subsystem Control v1、Frame / Call v1 conformance、`@loomrealm/runtime-control`、M3 testing/package boundary  
> 延续：[ADR 0018](./0018-preimplementation-v1-closure.md) current-v1 preimplementation governance、[ADR 0015](./0015-freeze-frame-call-protocol-v1-batch-f.md) Frame semantic freeze  
> 不改变：Frame 七方法、Frame/Stack/Activation authority、FrameOutcome、commit points、failure unwind、business wire limits

## 背景

M1 Wire 与 M2 Game Package 已经形成 first implementation baseline。进入 M3 前，Runtime Control 草案仍存在若干实现者必须自行决定的 mechanics：

```text
candidate package subpaths
role: "main" | "subsystem" dynamic session API
optional hello/state enforcement
Request ID only "never reused"
deadline start/settlement unspecified
single reader vs blocking handler unspecified
Response-before-dependent-RPC lacks package-level causal primitive
terminal/pending/late-response settlement unspecified
outbound profile limit may require unsafe full stringify-before-measure
```

同时发现 Frozen Frame conformance 与已冻结 Wire 之间有一处事实冲突：Frame 文档要求 source-level duplicate JSON member rejection，但 Wire `parseJsonText` 明确使用 ECMAScript `JSON.parse` observable semantics，并没有 duplicate-member tokenizer/parser。

若不在 M3 前收口，实现只能：

```text
invent a second JSON parser inside Runtime Control
or
silently violate Frozen conformance text
```

两者都破坏单一事实源。

---

## 决策 1：本次仍使用 current-v1 preimplementation correction

LoomRealm 尚无已部署的 conformant Runtime Control v1 implementation，也没有第三方 compatibility obligation。

因此依据 ADR 0018：

```text
update current v1 directly
no Runtime Control v2
no legacy compatibility mode
no second JSON parser
all dependent Current docs/tests update together
```

本 ADR 是 M3 first implementation closure，不是未来任意 breaking change 的永久许可证。

---

## 决策 2：duplicate JSON source member 跟随 Wire

Current Runtime Control / Frame application text：

```text
raw UTF-8 JSON text
→ @loomrealm/wire.parseJsonText
→ parsed JsonValue
→ Runtime Control profile/schema validation
```

因此 source 中重复 member 的 observable result跟随 frozen Wire / ECMAScript `JSON.parse` semantics。

Runtime Control MUST NOT：

```text
add private tokenizer
add duplicate-member source parser
claim lexical duplicate detection after JSON.parse
```

这不放松 closed schema：parse 后得到的 object仍必须满足 exact params/result/error-data schema与所有 profile limits。

若未来 source-level duplicate rejection成为独立 security/interoperability requirement，必须先重新打开 Wire parser contract，并按正常 version/governance处理。

---

## 决策 3：Request ID 收紧为 strict monotonic

Same sender / same Control Connection：

```text
positive safe integer
strictly monotonically increasing
Control + Frame shared namespace
never reused
never wrap
```

两个 sender方向 namespace独立。

理由：仅要求“never reused”会迫使 receiver 保存 connection-lifetime all-seen Set；strict monotonic 允许 receiver用 O(1) `lastRemoteRequestId` 检测 replay/reuse/regression，并与推荐 monotonic allocator一致。

Current allocator baseline：

```text
1, 2, 3, ... Number.MAX_SAFE_INTEGER
```

耗尽不得 wrap/reuse。

这不把 Request ID 变成 operation identity/idempotency token。

---

## 决策 4：Package root-only + role-specific peers

首批只发布：

```text
@loomrealm/runtime-control
```

不发布 `/control` `/frame` `/profile` `/testing`。

Public construction使用：

```text
createMainRuntimeControlPeer(...)
connectSubsystemRuntimeControl(...)
```

而不是：

```text
createRuntimeControlSession({role:"main"|"subsystem"})
```

错误方向的方法在类型 surface上不存在。

Subsystem connect constructor自己完成 hello；hello Success 前不返回 usable peer。

---

## 决策 5：Hello mechanics 与 authentication authority 分开

Runtime Control owns：

```text
hello schema/version selection
hello-first/one-shot
profile gating
connection-local key binding
```

Main owns：

```text
logical key registry
Launch Attempt existence
bootstrapToken validity/consumption
duplicate successful connection authority
```

Runtime Control通过 injected Main callback请求 authentication decision；不存储/mint Launch Attempt credential。

---

## 决策 6：one reader 不等于 blocking handler loop

同一 carrier exactly one reader：

```text
reader
  ├── Response → pending correlation immediately
  └── Request/Notification → ordered role dispatch lane
```

Reader不得因为 await role handler而阻止后续 Response correlation。

Control/Frame仍共享 one connection dispatcher/pending table。

---

## 决策 7：one serialized writer + Response causal barrier

所有 outbound message通过 one serialized writer调用 `MessageCarrier.send()`。

Inbound Request handler可以返回：

```text
reply
+ optional afterResponse
```

Runtime Control固定：

```text
handler reply
→ encode/preflight
→ carrier.send(Response)
→ await local send acceptance/order
→ afterResponse
```

这实现 Frozen Frame：

```text
frame.call Response before Child initialize/activate
frame.return Response before close/resume
```

但 Main authority commit仍由 Main handler完成；Runtime Control只拥有 causal barrier。

---

## 决策 8：Finite deadline / first-settlement-wins

Frame deadline仍遵守 Frozen range：

```text
1000..300000 integer ms
sender-local
stable per Control Connection
relative elapsed-time source
```

M3使用 package-local injected `RuntimeControlScheduler`，不为单一消费者提前扩 Foundation Clock。

Outbound Request：

```text
preflight
→ allocate ID
→ pending insert
→ arm deadline
→ serialized send
→ await Response / timeout / terminal
```

Deadline覆盖 local send wait + remote Response wait，避免 send stall形成无界 operation。

Response correlation与 timeout callback：

```text
first pending settlement wins
```

Timeout后 ID永久 consumed；late Response只作 diagnostics；no retry/replay。

Control hello/shutdown deadlines与 Frame deadline是独立 policy；shutdown timeout不制造 `stopped`。

---

## 决策 9：Terminal first-wins

Connection terminal来源：

```text
carrier closed/lost
protocol fatal
request timeout
local fatal
```

固定：

```text
first-wins
immutable
pending Requests settle exactly once
deadlines cancelled/retired
no new normal send
close idempotent
no same-attempt reconnect
```

Runtime Control只报告 connection fact；Main/Supervisor根据 shutdown intent与 actual Runtime termination决定 failed/stopped。

---

## 决策 10：Profile resource limits 不上移到 Wire

Wire继续只拥有 generic JSON representation。

Runtime Control拥有：

```text
1 MiB actual UTF-8 message
JSON depth 64
Control token/version/error limits
Frozen Frame business/string/key/member/identity limits
unpaired-surrogate rejection
```

Outbound不能先生成潜在指数展开的大字符串再测 1 MiB；必须 bounded measure/preflight，确认 <= hard limit后再使用 Wire stringify。

这不是第二 JSON semantics，只是 domain/profile resource budget。

---

## 结果

```text
MessageCarrier
    ↓
Runtime Control bounded mechanics
    ├── one reader
    ├── one writer
    ├── strict-monotonic IDs
    ├── Control state
    ├── Frame mechanics
    ├── response barrier
    ├── deadlines
    └── terminal
    ↓
Main / Subsystem Host
```

M3 可以在不引入：

```text
generic RPC framework
schema DSL
second JSON parser
transport abstraction duplicate
Main/Subsystem authority leakage
```

的情况下直接实现。

---

## Compatibility / Freeze Boundary

本 ADR 不改变：

```text
Frame exact seven methods
Frame params/results/outcome semantic shape
Frame/Activation/Stack/InputTarget authority
call/return commit points
ACK-before-publication
post-commit no rollback
recoverable semantic codes
whole-suffix fixed-point unwind
Frame hard business limits
```

只收口首次实现 mechanics 与一个 Wire/Frame textual contradiction。

M3 first conformant baseline形成后，不再用 ADR 0018/0021绕过正常 protocol version/migration治理。

---

## Re-evaluation

需要重新评估：

```text
source-level duplicate member must become security boundary
third-party Runtime Control implementation requires new wire semantics
request IDs need distributed/multi-writer generation
multiple independent scheduler consumers justify Foundation Clock
reconnect/resume/checkpoint changes connection lifetime semantics
streaming/chunked application framing replaces one-message JSON text model
```
