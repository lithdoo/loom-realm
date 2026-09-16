# Viewport State v1 / Renderer Data Profile v2 Qualification

> 层级：Implementation / Qualification Ledger  
> 状态：**Preimplementation / Docs Closure In Progress**  
> 日期：2026-09-16  
> Architecture：[Viewport Capability](../10-architecture/viewport-capability.md)  
> Decision：[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> Contracts：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)  
> Conformance：[Viewport State v1 Conformance](../15-contracts/viewport-state-conformance-v1.md) · [Renderer Data Profile v2 Conformance](../15-contracts/renderer-data-profile-conformance-v2.md)

本文是 Viewport/Profile v2 唯一 live qualification ledger。Architecture/contract描述 semantics；本文只记录 closure 状态、subject SHA、命令和证据，不反向定义协议。

---

## 1. Current Status

```text
Architecture decision        Accepted (ADR0036)
Architecture SSOT            Draft candidate complete
Viewport State v1 contract   Draft / Not Frozen
Profile v2 contract          Draft / Not Frozen
Conformance specs            Draft candidate complete
Executable implementation    Not started
Canonical Main /2 policy     Not implemented
Desktop physical source      Not implemented
Local qualification          Not run
Hosted qualification         Not run
Product qualification        Not run
```

Current executable product仍按现有代码语义运行；docs-only commits不得被表述为 viewport capability implemented。

---

## 2. Docs Freeze Gate

在 formal contract改为 Frozen for implementation 前必须记录 PASS：

- [ ] ADR0036 与 `viewport-capability.md` authority/lifetime一致；
- [ ] Viewport State v1 exact schema/direction/state/fresh-carrier/loss/failure闭合；
- [ ] Renderer Data Profile v2 composition/direction/common preflight/reader/writer/terminal闭合；
- [ ] v1明确保持 Frozen且 acceptance集合不变；
- [ ] canonical target subject profile policy固定为 `/2`，无隐式 negotiation/fallback；
- [ ] `SubsystemScope.viewport` exact API、initial null、subscribe immediate convergence、unsubscribe、callback containment闭合；
- [ ] retained `current` 明确不是 carrier/Renderer/paintability proof；
- [ ] Desktop/PWA physical source只影响 realization，不改变 CSS logical-pixel author semantics；
- [ ] cross-contract review无 Main/Input/Render authority反转。

Docs Freeze subject SHA：`PENDING`

---

## 3. Implementation Subject

首个改变 executable behavior的 commit建立新的 subject：

```text
subject SHA: PENDING
```

该 subject必须同时实现/锁定：

```text
@loomrealm/data profile /2 discriminator + Viewport child dispatch
Renderer trusted Viewport source seam
Subsystem retained viewport receiver + public scope.viewport
Main canonical DataAuthority dataProfile=/2 policy
Desktop physical source
v1 regression compatibility
```

不允许只实现 map consumer而没有完整 Core conformance。

---

## 4. Required Test Families

### Core local

```text
Viewport State v1 representation/currentness
Viewport subscribe/retention/callback failure
Profile v2 namespace/direction/common preflight
single reader / serialized writer
fresh carrier baseline
terminal first-wins
profile /1 regression
Main canonical /2 authority projection
Data broker exact (S,G,P) pairing
```

### Runtime behavior

```text
map-like Subsystem Frame active → child call/suspend → viewport changes
→ scope.viewport still converges while not InputTarget
```

### Desktop physical

```text
initial legal sample
resize burst latest-wins
same size suppression
zero/invalid ignored without state erase
blur/focus independent
hidden→visible resample convergence
DPR-only no semantic change
stop/teardown pending work inert
```

### Product integration

```text
Hostra current Renderer installs /2 carrier
all current Subsystems receive fresh viewport baseline
Data-only reconnect preserves author retained value and fresh wire baseline
Renderer reload/fresh generation converges to fresh physical baseline
```

---

## 5. Compatibility Matrix

必须归档：

| Sender/Receiver Profile | viewport.state | Expected |
|---|---|---|
| `/1` / `/1` | sent illegally | Data-fatal |
| `/2` / `/2` | legal exact | accepted |
| profile mismatch `(S,G,P)` | any traffic | carrier not installed/current |

不得测试或支持 same-generation `/1 ↔ /2` downgrade/upgrade。

---

## 6. Qualification Order

```text
Docs Freeze
→ Core implementation subject
→ local protocol/API tests
→ v1 regression
→ hosted Node qualification where applicable
→ M13 presentation regression
→ M14 map consumer integration
→ M15 Hostra product integration
```

Map dynamic viewport performance Freeze可以并行做 PR0 measurement，但 map dynamic implementation不得先于 Core contract Freeze + usable implementation subject。

---

## 7. Evidence Record

### Docs Freeze

```text
subject: PENDING
review notes: PENDING
```

### Local

```text
command: PENDING
result: PENDING
artifact/log: PENDING
```

### Hosted Node 20/24

```text
run: PENDING
result: PENDING
```

### M13 regression

```text
subject: PENDING
result: PENDING
```

### M14 consumer

```text
subject: PENDING
result: PENDING
```

### M15 Hostra product

```text
subject: PENDING
result: PENDING
```

---

## 8. Closure Rule

只有同一 executable subject上所需 evidence全部 PASS，才能把 ledger状态改为 Closed/Qualified，并回写 contract maturity。

Docs Freeze只表示 semantics足以实施，不表示 executable capability存在。任何 schema/currentness/profile-selection改变都建立新 docs/implementation subject并重跑对应矩阵。
