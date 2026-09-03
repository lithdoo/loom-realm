# M7 / 01 — `@loomrealm/renderer-control` Package

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：01  
> 最近复核：2026-09-03  
> 正式协议：[Main ⇄ Renderer Control Protocol v1](doc/15-contracts/main-renderer-control-v1.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：实现 transport-independent、bounded、fail-closed 的具体 Renderer Control v1 mechanics；不得重新设计 authority、Platform ingress 或 generic RPC abstraction。

> **本包只拥有 connection-local protocol mechanics。Main 创建 authority/currentness；Renderer role保存已接受 authority；Platform只建立/交付 carrier。**

---

## 1. Frozen Position

```text
Main committed RendererAuthoritySnapshotV1
        ↓
renderer-control Main peer
        ↕ MessageCarrier<string>
renderer-control Renderer peer
        ↓
accepted immutable RendererAuthoritySnapshotV1
        ↓
@loomrealm/renderer
```

Application methods exactly：

```text
renderer.hello   Renderer → Main Request, id = 1
renderer.state   Main → Renderer Notification
```

Dependency order：

```text
M7_01
→ M7_02 Main authority integration
→ M7_03 Renderer role holder
→ M7_04 deterministic vertical
→ M7_05 qualification
```

---

## 2. Frozen Ownership

### Main owns

```text
sessionId
Runtime / Frame / Activation / InputTarget authority
AuthorityRevision
rendererControlToken issue/bind/invalidate/consume
current Renderer participant / replacement
Snapshot source
future DataAuthority policy
```

### `@loomrealm/renderer-control` owns

```text
JSON-RPC representation/profile mechanics
hello-first / one-shot state
version negotiation
closed schema / whole Snapshot validation
connection-local session/revision monotonicity
exact outbound preparation/preflight
hello Result before renderer.state ordering
0..1 in-flight + 0..1 pendingLatest publication
peer retirement / terminal classification
transport-independent typed outcomes
```

### Renderer role owns

```text
which peer is current
current accepted Snapshot | null
future Data/Input/Render composition
```

本包不得拥有 Main Registry/Stack、revision allocation、historical authority log、Renderer Store、Data Connection、Input/Render state、WebSocket/MessagePort establishment 或 Platform lifecycle。

---

## 3. Frozen Dependencies

Runtime dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/renderer
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/data
@loomrealm/subsystem
concrete Hostra/PWA
node:* / DOM / WebSocket / MessagePort / Worker
```

不抽取：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
MethodRegistry
RequestManager
Publisher/StateReplicator framework
```

---

## 4. Frozen Publish Surface

只发布 root：

```text
@loomrealm/renderer-control
```

必须 root-export：

```text
exact v1 wire/model types
Main-side concrete peer constructor/factory
Renderer-side concrete peer constructor/factory
side-effect-free exact outbound hello preparation/preflight
required typed terminal/error outcomes
```

精确函数名可在编码中选择，但**语义与调用方向不可变**。不得发布 `/main`、`/renderer`、`/schema`、`/testing`、transport-specific subpath。

---

## 5. Wire Model

精确表示 formal contract：

```text
RendererHelloParamsV1
RendererHelloResultV1
RendererStateParamsV1
RendererAuthoritySnapshotV1
RendererRuntimeStateV1
RendererFrameStateV1
RendererInputTargetV1
RendererDataAuthorityV1
```

Wire object closed schema；无 metadata/extensions/physical material。

---

## 6. Current-State Validation Only

Renderer peer暴露 Snapshot 前 whole-validate：

```text
sessionId/revision representation
Runtime key uniqueness
Frame key uniqueness + Runtime references
active/top/activation relations
InputTarget exact current relation
DataAuthority key/generation/profile representation
actual UTF-8 message/depth/member limits
```

Invalid → terminal/fail closed；不得 repair/drop/normalize。

以下 lifetime facts不由 receiver保存历史 Set：

```text
revoked activationId never regranted
frameId never illegally reused
Data generation never reused
```

这些由 Main/tests证明。

---

## 7. Renderer Peer State

只维护 connection-local：

```text
hello pending/current/terminal
accepted sessionId
last accepted revision
```

```text
new revision > last  → accept after whole validation
revision gap         → valid
new revision <= last → protocol terminal
```

Renderer role不再二次验证 revision/session。

---

## 8. Hello Mechanics

Renderer-originated Request只有一个：

```text
renderer.hello id = 1
```

因此不得创建 request-id allocator、pending request map、generic dispatcher/correlation framework。

Renderer-side handoff固定：

```text
send hello(id=1)
→ validate Result Snapshot R
→ return/resolve initial R to role
→ role atomically installs peer + R
→ only then role begins consuming later renderer.state
```

Later-state surface必须 lazy/explicit-start或等价保证，不允许在 initial install前 callback R+1。

---

## 9. Exact Outbound Preparation / Preflight

本包必须提供一个**无 I/O、无 Main mutation**的 exact outbound preparation capability，使 Main 能在其 serialized lane内验证 `renderer.hello` Success 的实际 JSON text application unit。

冻结语义：

```text
input:
    protocolVersion = 1
    request id = 1
    immutable Snapshot R

output:
    exact sendable compact JSON text
or:
    deterministic representation/preflight failure
```

它必须执行实际 send相同的：

```text
closed schema
safe integer/string/profile validation
JSON depth/member rules
actual UTF-8 <= 1 MiB
```

Main hello acceptance只在该 preparation成功后切 current Renderer。Prepared text随后必须原样发送，避免 preflight/send TOCTOU。

Later `renderer.state` outbound同样使用同一 formal profile预检；可由 peer内部准备，不要求 Main理解 JSON。

---

## 10. Main Peer Hello Gate

Main peer解析/验证 typed hello后调用 Main-owned single acceptance seam。

Main acceptance返回：

```text
accepted {snapshot R, preparedHelloText}
or typed rejection
```

Main peer自身不决定 token/currentness。

Success path：

```text
Main acceptance already committed candidate currentness
→ peer sends preparedHelloText
→ after local send acceptance only, drain later pending state
```

Hello send pending期间可接收 Main提交的 newer Snapshot到 `pendingLatest`，但不得先发送。

Hello send失败：candidate terminal；old current不复活。

---

## 11. Retirement / Replacement

Peer retirement语义固定：

```text
mark retired synchronously
reject/ignore future publication submissions
clear/settle pendingLatest
request carrier.close()
terminal first-wins
```

Replacement commit后 old peer不得**启动新的 send**。

已经开始的 `inFlight send` MAY settle或 physically arrive；本包不承诺取消 Foundation carrier send，也不得为此引入 cancelable writer/transport ACK。Late completion无 current-authority effect。

---

## 12. Bounded Publication

唯一需要的 publication state：

```text
inFlight: 0..1
pendingLatest: 0..1 replaceable Snapshot
```

```text
R in-flight
R+1 pending
R+2 submitted
→ pendingLatest = R+2
```

无 revision-sized queue/history/replay。

M7 package qualification只证明 structural boundedness；Hostra/PWA actual stalled-write finite policy后续 physical qualification。

---

## 13. Representation Failure

Wire limits不是 Main business limits。

Outbound Snapshot不可表示：

```text
no truncation/drop
no Main authority mutation
candidate/current Control terminalizes
```

Initial hello不可表示时，Main不会切 current Renderer；这由 M7_02 atomic acceptance保证。

不定义 Runtime count、Frame depth、DataAuthority count业务上限。

---

## 14. DataAuthority Boundary

协议继续表示：

```text
{subsystemKey, generation, dataProfile}
```

Package验证其 representation/current-Snapshot relations。

M7 Main vertical固定 `dataAuthorities=[]`；package tests可用非空 fixture验证 formal model。真实 Main Data policy M8实施。

---

## 15. Recommended Source Shape

```text
packages/renderer-control/
├─ src/
│  ├─ index.ts
│  ├─ model.ts
│  ├─ validation.ts
│  ├─ main-peer.ts
│  └─ renderer-peer.ts
└─ test/
```

这只是内部 layout；若代码更小可合并。不得为目录对称创建 Manager/Registry/EventBus。

---

## 16. Package Qualification

必须覆盖：

```text
hello first / one-shot / id=1
version/auth mapping
exact hello preparation/preflight
hello Result before later state
initial Snapshot handoff before later-state consumption
connection-local revision monotonicity
closed schema / current Snapshot relations
retirement blocks new sends + clears pending
already-inFlight retirement settles without authority resurrection
0..1 in-flight + 0..1 pendingLatest
unrepresentable outbound terminalization
oversize/depth/member rejection
terminal first-wins
carrier close during hello/publication
no retry/replay/history
non-empty DataAuthority fixture validation
```

---

## 17. Frozen Closure

M7/01 实施必须得到：

```text
exact v1 types
concrete asymmetric Main/Renderer peers
one-shot hello without generic request framework
side-effect-free exact outbound hello preparation
race-free hello ordering/handoff
retirement without fictitious send cancellation
bounded current-state validation/publication
representation failure isolation
root-only package surface
```

除 ADR 0027 Reopen Rule外，不允许在编码阶段重新设计上述语义。