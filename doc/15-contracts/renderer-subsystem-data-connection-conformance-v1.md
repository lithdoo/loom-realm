# Renderer ⇄ Subsystem Data Connection v1 Conformance Profile

> 层级：正式契约 / Conformance  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> fixtureSetRevision：1  
> 适用 Contract：`loomrealm.renderer-subsystem-connection / 1`  
> 依赖：[Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)、[ADR 0024](../decisions/0024-renderer-subsystem-data-connection-v1-semantic-closure.md)  
> 最近复核：2026-08-21

本 Profile 固定 Data Connection v1 的跨实现 observable qualification obligations。它不增加 Connection application messages，也不规定 Hostra/PWA 的具体 endpoint/ticket/Port wire format。

---

## 1. Conformance Claims

一个实现若宣称支持 Data Connection v1，至少需要分别证明：

```text
Authority Binder
    exact S/G/P + Session/Renderer/Runtime binding

Installer
    paired readiness + commit-time revalidation + single-current cutover

Lifecycle Manager
    current→retired + terminal retirement semantics

Recovery Manager
    same-generation fresh-current semantics

Platform Mapping
    concrete Hostra/PWA realization preserves abstract trace
```

不得只验证“WebSocket/MessagePort 能连通”就宣称 Connection conformance。

---

## 2. Abstract Test Model

测试模型至少暴露：

```ts
interface Authority {
  session: string;
  renderer: string;
  subsystemKey: string;
  generation: number;
  dataProfile: string;
  runtimeInstance: string;
}

interface Candidate {
  id: string;
  boundAuthority: Authority;
  rendererPrepared: boolean;
  subsystemPrepared: boolean;
}

type ConnectionState = "current" | "retired";
```

`runtimeInstance` 只用于 harness 区分 fresh Runtime，不是 Connection v1 application field。

Observable state：

```text
current slot occupant or none
candidate disposed/not-disposed
connection current/retired
child application exposure allowed/forbidden
retirement cause diagnostics (optional)
fresh-child-baseline signal
```

---

## 3. Core Trace Normalization

所有 Platform realization应能归一成：

```text
AUTHORITY(S,G,P)
CANDIDATE(id,S,G,P)
PREPARE_RENDERER(id)
PREPARE_SUBSYSTEM(id)
INSTALL(id)
CURRENT(id)
RETIRE(id, reason)
DROP_STALE(id)
```

Hostra/PWA 可以有额外 platform-internal steps，但不能改变这些 observable relations。

---

## 4. Required Case Groups

```text
authority
candidate
paired-install
commit-race
cardinality
cutover
lifecycle
reconnect
generation
parent-authority
traffic-boundary
failure-boundary
platform-equivalence
```

---

## 5. Authority Cases

### `authority/exact-current-authority-can-install`

Given current authority `S/G/P`，exact-bound paired candidate可在 commit-time revalidation通过后成为 current。

### `authority/no-authority-cannot-install`

无 DataAuthority时 candidate不得成为 current。

### `authority/wrong-subsystem-cannot-install`

bound subsystemKey mismatch → reject/dispose。

### `authority/wrong-generation-cannot-install`

stale/future generation mismatch → reject/dispose。

### `authority/wrong-profile-cannot-install`

profile mismatch → reject/dispose。

### `authority/wrong-renderer-cannot-install`

candidate bound to non-current Renderer participant → reject/dispose。

### `authority/wrong-session-cannot-install`

candidate bound to stale Session → reject/dispose。

### `authority/wrong-runtime-instance-cannot-install`

candidate bound to superseded Runtime instance under same subsystemKey → reject/dispose。

---

## 6. Candidate Boundary Cases

### `candidate/not-current-before-install`

prepared candidate在 installation commit 前不占 current slot。

### `candidate/no-child-send-before-install`

candidate Renderer endpoint不得发送 current child traffic。

### `candidate/no-child-accept-before-install`

candidate Subsystem endpoint收到的 child traffic不得作为 current authority处理。

### `candidate/failure-disposes-without-connection-state`

establishment失败直接 dispose；不得产生 phantom `retired` Connection instance requirement。

---

## 7. Paired Installation Cases

### `install/renderer-only-prepared-not-current`

Renderer endpoint prepared、Subsystem未 prepared → INSTALL forbidden。

### `install/subsystem-only-prepared-not-current`

Subsystem endpoint prepared、Renderer未 prepared → INSTALL forbidden。

### `install/both-prepared-same-binding-can-commit`

两端 prepared 且 exact same current binding → may commit。

### `install/pair-binding-mismatch-rejected`

Renderer/Subsystem endpoints绑定不同 S/G/P/candidate identity → reject。

### `install/no-application-exposure-before-paired-readiness`

wall-clock callback顺序可不同，但 child application exposure必须晚于 paired readiness。

---

## 8. Commit-time Authority Race Cases

### `race/authority-removed-during-establish`

start candidate → authority removed → physical establish succeeds → candidate rejected。

### `race/generation-replaced-during-establish`

start G1 candidate → authority G2 → G1 succeeds → reject G1。

### `race/profile-replaced-during-establish`

start G1/P1 → authority G2/P2 → old candidate rejected。

### `race/renderer-replaced-during-establish`

old Renderer candidate cannot install under new current Renderer participant。

### `race/runtime-replaced-during-establish`

old Runtime candidate不能绑定到 same-key fresh Runtime。

---

## 9. Cardinality / Concurrency Cases

### `cardinality/zero-or-one-current`

任意 trace 中一个 slot同时最多一个 current。

### `cardinality/concurrent-candidates-one-winner`

多个 exact candidates并发 prepare，最多一个 INSTALL成功；losers dispose。

### `cardinality/different-subsystems-independent-slots`

同一 Renderer可为不同 subsystemKey各有自己的 current slot。

### `cardinality/frame-domain-count-does-not-create-connections`

Frame/Input/Render Domain数量变化不改变 per-Subsystem cardinality。

---

## 10. Cutover Cases

### `cutover/proactive-same-generation-replacement`

old current A + prepared B same S/G/P → serialized cutover → A retired, B sole current。

### `cutover/no-overlap`

任何 snapshot不得观察 A current && B current。

### `cutover/gap-allowed`

`A current → none → B current` 合法。

### `cutover/old-never-current-again`

A retired后不能重新 install/current。

---

## 11. Lifecycle / Retirement Cases

每种原因均验证：

```text
current → retired
retired terminal
child traffic stops/trust ends
```

Required causes：

```text
physical close
read failure
write failure
authority removal
generation/profile replacement
Renderer Control loss
Renderer replacement
Session replacement
Runtime replacement
same-generation supersede
child Data-fatal violation
Platform Data-slot shutdown
```

### `lifecycle/no-half-current-on-read-loss`

read terminal → whole Connection retired。

### `lifecycle/no-half-current-on-write-loss`

write terminal → whole Connection retired。

### `lifecycle/first-terminal-cause-does-not-change-recovery`

不同 first diagnostic cause不改变 protocol recovery semantics。

---

## 12. Same-generation Recovery Cases

### `reconnect/same-generation-after-loss`

A retired by loss；authority still S/G/P；fresh B可安装 current，不需 fresh generation。

### `reconnect/no-resume-token`

fresh B不依赖 Connection application resume token。

### `reconnect/no-control-revision-required`

same authority reconnect不要求额外 Renderer Control revision mutation。

### `reconnect/fresh-child-publication-boundary`

B current后触发 fresh child publication boundary，而不是恢复 A publication cursor。

---

## 13. Generation Cases

### `generation/strictly-increasing-replacement`

new authority generation MUST > historical previous value。

### `generation/gap-allowed`

例如 `4 → 900` 合法。

### `generation/reuse-rejected`

retired/old generation不得再次成为 fresh authority epoch。

### `generation/profile-change-fresh-generation`

P change必须配 fresh greater G。

### `generation/runtime-instance-replacement-fresh-generation`

same subsystemKey fresh Runtime instance的 future authority必须使用 historical-max 之上的 generation。

### `generation/max-safe-no-wrap`

`Number.MAX_SAFE_INTEGER` 后不得 1/reuse/wrap。

---

## 14. Parent Authority Cases

### `parent/control-loss-retires-all`

Renderer Control loss使该 participant所有 current/pending Data material失效。

### `parent/renderer-replacement-retires-old`

new Renderer participant不继承旧 participant Data connections。

### `parent/session-replacement-retires-old`

fresh Session是新的 authority universe。

### `parent/authority-removal-invalidates-pending`

不仅 current，pending candidates/provisioning material也必须失效。

---

## 15. Traffic Boundary Cases

### `traffic/old-emitted-not-replayed`

A send boundary已接受消息；A loss/B fresh → 不在 B replay。

### `traffic/old-unsent-not-migrated`

A retirement时 pending unsent消息不得原样迁移到 B。

### `traffic/late-retired-inbound-dropped`

A retired后收到 late A message → stale drop；不得进入 B state machine。

### `traffic/late-retired-does-not-retire-new-current`

stale A traffic本身不得导致 B retire。

### `traffic/fresh-input-baseline`

Profile 1 映射下 fresh current触发 User Input fresh publication baseline。

### `traffic/fresh-render-baseline`

Profile 1 映射下 fresh current触发 Render Update fresh publication baseline。

---

## 16. Failure-domain Cases

以下事件 MUST NOT直接产生 Runtime terminal或 Frame unwind：

```text
candidate establishment failure
authority-race candidate rejection
current Data loss
same-generation reconnect failure
unsupported profile
child Data-fatal carrier retirement
```

对应 cases：

```text
failure/candidate-failure-not-runtime-failure
failure/data-loss-not-runtime-failure
failure/data-loss-not-frame-unwind
failure/reconnect-failure-not-runtime-failure
failure/child-data-fatal-not-frame-commit-signal
```

---

## 17. Platform-equivalence Cases

Hostra 与 PWA 必须产生相同 abstract trace results：

```text
platform/current-authority-install
platform/authority-race-reject
platform/concurrent-candidate-one-winner
platform/same-generation-reconnect
platform/generation-replacement
platform/control-loss-retire
platform/late-old-traffic-drop
```

允许 physical details不同；不得把 WebSocket/MessagePort差异变成不同 Connection semantics。

---

## 18. No-message Assertions

Conformance harness MUST证明 Connection v1 本身不期待或产生：

```text
data.hello
data.ready
data.accept
data.resume
data.ping
data.close
```

任何依赖这些消息才能形成 current的实现不 conform v1。

---

## 19. Fixture Manifest

Executable materialization若落地，manifest至少包含：

```json
{
  "fixtureFormatVersion": 1,
  "contract": "loomrealm.renderer-subsystem-connection",
  "contractVersion": 1,
  "fixtureSetRevision": 1
}
```

case ID 必须稳定；更改 expected observable result需要新的 Contract version或明确的新 conformance revision且不得违反 Frozen compatibility boundary。

---

## 20. Qualification Gate

一个 Platform/Data implementation只有同时满足以下条件才可声明 Data Connection v1 qualified：

```text
all required abstract cases pass
single-current invariant holds under concurrency/races
paired install is proven before child exposure
commit-time authority revalidation is proven
retired terminal/no-half-current is proven
same-generation reconnect resets child publication boundary
old traffic migration/replay is absent
Hostra/PWA mapping preserves same abstract results where applicable
```

本 Conformance Profile证明协议；它不授权实现改变协议。