# Renderer Data Application Profile v1 Conformance

> 层级：正式契约 / Conformance  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> fixtureSetRevision：1  
> 适用 Profile：`loomrealm.renderer-data/1`  
> 依赖：[Renderer Data Profile v1](./renderer-data-profile-v1.md)、[Data Connection v1 Conformance](./renderer-subsystem-data-connection-conformance-v1.md)、[User Input v1 Conformance](./user-input-conformance-v1.md)、[Render Update v1 Conformance](./render-update-conformance-v1.md)、[ADR 0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)  
> 最近复核：2026-08-26

本文件固定 Data Application Profile v1 的组合层 qualification obligations。它不重复 child protocol 全部 fixture，而验证“Connection1 + Input1 + Render1 组合以后”必须保持的 shared carrier mechanics、routing、direction、terminal 与 fresh-carrier behavior。

---

## 1. Conformance Claims

一个实现宣称支持 `loomrealm.renderer-data/1`，至少必须分别证明：

```text
Profile Binder
    exact identity / version combination

Reader / Dispatcher
    one inbound reader + exact namespace routing

Writer
    one serialized outbound writer

Role Surface
    exact Subsystem/Renderer direction legality

Terminal Manager
    first-wins terminal + fail-closed carrier retirement

Fresh-carrier Composer
    Input/Render child baseline reset/republication

Platform Mapping
    WebSocket/MessagePort preserve same abstract trace
```

仅验证 Input 或 Render 任一 child，不构成完整 Profile conformance。

---

## 2. Abstract Harness

最小 harness：

```ts
interface InstrumentedCarrier {
  messagesCallCount: number;
  maxConcurrentSendCount: number;
  sent: readonly string[];
  closeCallCount: number;
}

interface Binding {
  subsystemKey: string;
  generation: number;
  dataProfile: "loomrealm.renderer-data/1";
}
```

Harness 必须能够观察：

```text
reader creation count
inbound dispatch target
outbound send order
concurrent carrier.send count
terminal fact
carrier close request
pending writer settlement
fresh-peer publication state
```

---

## 3. Required Case Groups

```text
profile-identity
application-unit
common-preflight
direction
reader-dispatcher
writer
child-fatal
terminal
fresh-carrier
ordering-independence
platform-equivalence
```

---

## 4. Profile Identity Cases

### `profile/exact-identity`

`dataProfile == "loomrealm.renderer-data/1"` 才能创建 current Profile peer。

### `profile/binds-exact-versions`

实现声明 v1 时固定支持：

```text
Connection 1
Input 1
Render 1
```

不得把同一 Profile identity 解释成其他 child version combination。

### `profile/unsupported-profile-rejected-before-read`

unsupported profile 必须在调用 `carrier.messages()` / `carrier.send()` 前拒绝 trusted integration setup。

### `profile/change-requires-fresh-generation`

同 generation 不允许 profile identity 替换；该规则由上游 DataAuthority/Connection conformance验证并在 Profile binding 中保持。

---

## 5. Application Unit Cases

### `unit/one-json-text-string`

每次 inbound/outbound application unit 都是一个 string，内容是 exactly one JSON object。

### `unit/no-structured-clone-object`

PWA mapping 不得把 object/ArrayBuffer/MessagePort 当作 application message value。

### `unit/no-jsonrpc-batch`

JSON array / JSON-RPC Batch 不属于本 Profile message surface。

### `unit/no-multiple-messages-per-unit`

不能把两条 JSON object 拼接在一条 carrier unit 中。

---

## 6. Common Preflight Cases

### `preflight/message-over-1mib-fatal`

actual UTF-8 bytes > 1,048,576：

```text
no child handler call
→ Profile terminal protocol-fatal
→ best-effort carrier close
```

### `preflight/depth-over-64-fatal`

JSON container depth > 64：同上。

### `preflight/malformed-json-fatal`

malformed JSON：同上。

### `preflight/wire-representation-invalid-fatal`

parse 后不满足 frozen Wire JSON representation：同上。

### `preflight/duplicate-member-follows-wire`

source duplicate object member不得由 Profile 第二 tokenizer 单独拒绝；observable result遵循 frozen Wire / `JSON.parse` semantics，再验证 parsed object exact schema。

---

## 7. Direction Cases

### `direction/subsystem-allowed-surface`

Subsystem outbound exact kinds：

```text
input.interest
render.domains
render.snapshot
render.patch
render.event
```

### `direction/renderer-allowed-surface`

Renderer outbound exact kinds：

```text
input.state
input.event
input.reset
```

### `direction/subsystem-rejects-renderer-only-send`

Subsystem本地尝试发送 `input.state/event/reset`：invalid local operation，不得写 carrier；peer进入 local-fatal terminal。

### `direction/renderer-rejects-subsystem-only-send`

Renderer本地尝试发送 `input.interest` 或 `render.*`：同上。

### `direction/inbound-wrong-role-fatal`

从远端收到 well-formed known message 但方向对当前 role 不合法：protocol-fatal / retire Data。

---

## 8. Reader / Dispatcher Cases

### `reader/exactly-one-messages-reader`

一个 current Profile peer 生命周期内：

```text
carrier.messagesCallCount == 1
```

Input/Render handler不得各自建立 reader。

### `dispatch/input-interest-to-renderer-input-handler`

合法 `input.interest` 只到 Renderer-side User Input handler。

### `dispatch/input-ordinary-to-subsystem-input-handler`

合法 `input.state/event/reset` 只到 Subsystem-side User Input handler。

### `dispatch/render-to-renderer-render-handler`

四种 `render.*` 只到 Renderer Render handler。

### `dispatch/unknown-type-fatal`

unknown top-level `type` 不 drop/ignore：protocol-fatal。

### `dispatch/no-cross-child-fallback`

一个 `input.*` schema invalid 不得尝试按 `render.*` 解释，反之亦然。

---

## 9. Serialized Writer Cases

### `writer/max-one-concurrent-send`

即使 Input 与 Render caller 并发调用 outbound API：

```text
maxConcurrentSendCount == 1
```

### `writer/preserves-enqueue-order`

writer dequeue order 与 carrier accepted-send order一致。

### `writer/no-profile-retry`

`carrier.send()` failure/terminal 后不得自动 retry 同一 application unit。

### `writer/no-profile-duplicate`

Profile mechanics不得主动重复发送已 accepted unit。

### `writer/pending-settles-on-terminal`

terminal 时所有尚未 settled writer operation exactly once settlement；不得永久 pending。

### `writer/no-old-queue-migration`

old carrier terminal 时未 emitted queue 不得复制到 fresh carrier；上层根据 current desired state重新 materialize fresh baseline。

---

## 10. Child Protocol Fatal Boundary

### `child/static-input-invalid-fatal`

User Input exact schema/channel/payload/limit invalid：Profile terminal protocol-fatal。

### `child/static-render-invalid-fatal`

Render exact schema/representation/limit invalid：Profile terminal protocol-fatal。

### `child/stateful-render-fatal-propagates`

Renderer child mechanics显式报告 frozen Render authoritative continuity failure：Profile peer terminal，当前 Data retired。

### `child/well-formed-stale-input-not-profile-fatal`

User Input handler按 contract判断 stale activation/not-interested 并 drop，不得因此 terminal Profile。

### `child/well-formed-stale-render-event-not-profile-fatal`

合法但 stale/inapplicable Render Event drop-only，不 terminal。

---

## 11. Terminal Cases

### `terminal/carrier-closed`

carrier orderly close → terminal once → stop child operations。

### `terminal/carrier-lost`

carrier lost → terminal once → stop child operations。

### `terminal/protocol-fatal-closes-carrier`

本地检测 protocol-fatal → best-effort `carrier.close()` → terminal first-wins。

### `terminal/local-fatal-closes-carrier`

Profile implementation local invariant failure → local-fatal terminal；不得伪造成 remote child semantic error。

### `terminal/first-wins`

carrier loss 与 protocol fatal race：只保留第一个 immutable terminal fact；pending settlement不得重复。

### `terminal/send-after-terminal`

terminal 后 outbound operation不得调用 `carrier.send()`。

### `terminal/no-runtime-frame-side-effect`

Data terminal harness不得直接提交 Runtime terminal / Frame unwind；只通知上层 Data binding terminal fact。

---

## 12. Fresh Carrier Composition Cases

### `fresh/input-empty-publication-baseline`

每个 fresh current carrier：

```text
remote Interest Registry = empty
retained Input State = empty
Event history = none
```

### `fresh/input-desired-interest-republished-by-role`

如果 Subsystem local Desired Interest仍存在，fresh peer启动后由 Subsystem InputManager重新 materialize full Registry；Profile不得 replay old wire bytes。

### `fresh/render-registry-first`

fresh current carrier上第一条 Render message必须是 current `render.domains`。

### `fresh/render-snapshot-before-patch-event`

每个 current Domain先 fresh Snapshot，再允许 Patch/Event。

### `fresh/same-generation-does-not-inherit-publication-cursor`

same-generation reconnect仍是 fresh carrier publication boundary。

### `fresh/no-business-lifetime-reset`

Profile fresh carrier本身不得强制重建 Frame/Activation/Desired Interest/business Render Domain。

---

## 13. Ordering Independence Cases

### `ordering/shared-writer-without-shared-revision`

Input 与 Render共享 writer ordering，但不得产生 shared revision/cross-child commit state。

### `ordering/input-barrier-preserved`

Input sender已确定的 State-before-Event/Reset barrier顺序经过 Profile writer后保持。

### `ordering/render-barrier-preserved`

Render sender已确定的 authoritative-before-Event barrier顺序经过 Profile writer后保持。

### `ordering/control-data-no-total-order`

Renderer Control 与 Data trace可交错；Profile不得要求 cross-plane ACK/revision join。

---

## 14. Platform Equivalence

### `platform/websocket-text`

Hostra WebSocket 使用 text application unit。

### `platform/messageport-string`

PWA MessagePort 使用 `postMessage(string)` application unit。

### `platform/same-abstract-profile-trace`

给定相同 logical child message trace，Hostra/PWA必须归一出相同：

```text
READ
PARSE
DISPATCH(input|render)
WRITE
TERMINAL
FRESH_CURRENT
```

Platform-private endpoint/ticket/Port/provisioning步骤可不同，但不能改变 Profile observable semantics。

---

## 15. Required Fixture Names

`fixtureSetRevision = 1` 至少包含：

```text
profile-exact-identity
profile-binds-connection1-input1-render1
profile-unsupported-before-read
unit-one-json-text-string
preflight-message-over-1mib-fatal
preflight-depth-over-64-fatal
preflight-duplicate-member-follows-wire
direction-subsystem-surface
direction-renderer-surface
direction-inbound-wrong-role-fatal
reader-exactly-one
router-input-interest
router-input-ordinary
router-render
router-unknown-type-fatal
writer-max-one-concurrent-send
writer-preserves-enqueue-order
writer-no-retry
writer-pending-settles-on-terminal
writer-old-unsent-not-migrated
child-stateful-render-fatal-propagates
child-stale-input-drop-not-fatal
terminal-first-wins
terminal-send-after-terminal
fresh-input-empty-baseline
fresh-input-republish-derived-not-replay
fresh-render-registry-snapshot-baseline
fresh-same-generation-no-publication-cursor
ordering-input-barrier-preserved
ordering-render-barrier-preserved
control-data-no-total-order
hostra-pwa-same-data-profile-trace
```

---

## 16. Freeze Boundary

以下变化需要 bump Profile version 或 fixtureSetRevision，并按兼容性重新评审：

```text
component version combination
application-unit value model
common 1 MiB/depth64 gate
role direction
single-reader rule
single-writer rule
routing semantics
terminal/fail-closed behavior
fresh-carrier composition
platform equivalence requirement
```

Executable harness 可以改进内部实现，但不能改变 fixture 的 observable accept/drop/retire/order outcome。
