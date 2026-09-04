# `@loomrealm/main`

> 状态：**M8 Implemented / Qualified + M9 Platform Authority Feed Frozen for Implementation**  
> 阶段：M9 Desktop DataConnectionBroker preimplementation closure  
> 最近复核：2026-09-04  
> 冻结决策：[ADR 0027](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md) · [ADR 0028](../../doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)

`@loomrealm/main` 是 platform-neutral Main application authority runtime。M8 已从 committed Runtime-ready state 纯派生 DataAuthority；M9 只把当前 Renderer + Runtime/DataAuthority physical-binding facts同步投影给 Platform，不新增第二 authority registry。

---

## 1. Public Surface Direction Through M9

`runMain()` still owns one Main Session lifetime；no public Session controller/service locator。

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

Optionality：

```text
rendererControl absent
→ Runtime/Frame Session valid; no physical Renderer attempt

dataConnections absent
→ Runtime/Frame/Renderer Control/M8 logical DataAuthority valid
→ no Platform Data installation authority feed
```

M6/headless composition needs no fake capability。

---

## 2. Runtime Dependencies

```text
@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire
```

Main MUST NOT depend on `@loomrealm/renderer`、Game Package、concrete Launcher、`apps/desktop`、Node/Worker/WebSocket/MessagePort or Data Broker implementation。

---

## 3. Runtime Bootstrap — Existing Semantics Preserved

```text
LogicalGameBootstrap
→ one required Runtime record per subsystemKey
→ fresh opaque runtime bootstrap material
→ RuntimeHosting.launch({subsystemKey,bootstrapToken})
→ HostedRuntime
→ Runtime Control acquire/auth/identified/ready
```

`HostedRuntime` remains physical fact/capability only。M9 reuses the exact object identity in the Data authority sink projection; it does not add a public Runtime instance ID or executable material。

---

## 4. Single Main Authority Owner

One `MainSessionRuntime` remains the single mutable owner of：

```text
Runtime records
Frame records / Stack / Activation
Session terminal
Renderer current participant/candidate
Renderer revision
M8 derived DataAuthority
M9 current Renderer correlation token
```

M9 current token is not a new authority system；it is a value retained only for the current accepted participant so Platform can correlate physical Data material。

No `DataAuthorityManager`、RendererAuthorityManager、PlatformProjectionBus、EventBus or ConnectionRegistry。

---

## 5. Frame / Failure Semantics Unchanged

Frozen Frame/Call ordering、ACK-before-publication、post-commit no rollback、ambiguous mutation Runtime failure、whole-suffix fixed-point unwind remain unchanged。

Renderer/Data physical failures cannot alter accepted Frame outcome or directly trigger unwind。

---

## 6. Renderer Session / Revision

Existing M7 initialization remains：

```text
fresh sessionId
rendererRevision = 1
currentRendererPeer = null
```

Renderer revision advances only when Renderer-visible committed payload changes。M9 sink replacement is physical bookkeeping/projection and never bumps revision by itself。

---

## 7. Renderer Projection / M8 DataAuthority

Pure Renderer Snapshot projection reads committed Runtime/Frame/InputTarget authority plus ready-derived：

```text
Runtime phase == ready
→ DataAuthority(S,1,"loomrealm.renderer-data/1")
```

Data carrier loss/replacement does not alter this logical tuple or Renderer revision。

M9 does not put HostedRuntime、Renderer token、ticket/endpoint/candidate/Broker state into Renderer Snapshot。

---

## 8. Renderer Token Consumption + M9 Correlation

M7 hello acceptance still authenticates one candidate token exactly once。

After acceptance M9 adds one private field conceptually：

```text
currentRendererControlToken: string | null
```

Semantics：

```text
hello acceptance consumes token as credential
→ token can never authenticate again
→ Main retains its value only while that peer is current
→ value may appear only in DataConnectionAuthorityView
```

The current retained token participates in `hasCurrentOpaqueMaterial()` live duplicate defense alongside Session/current candidate/Runtime tokens。

When current Renderer is replaced/terminal/session ends：drop the retained value。No retired token history set。

---

## 9. M9 Physical Authority Projection

When `platform.dataConnections` exists, Main projects from existing state only。

```text
no current Renderer
→ null

current Renderer T
→ {
     rendererControlToken: T,
     entries: every current ready-derived DataAuthority
              + exact RuntimeRecord.hosted object
   }
```

Entry rules：

```text
unique per subsystemKey
exact S/G/P from Main authority
exact current HostedRuntime object
only current ready authority entries
stable deterministic order
```

No independent mutable Data connection authority state is added。

---

## 10. Sink Call Discipline

`DataConnectionAuthoritySink.replace()` frozen contract is synchronous、non-blocking、non-throwing。

Main establishes：

```text
Session startup → replace(null)
```

Then inside the existing serialized mutation lane, before the lane completes：

```text
Renderer accepted/replaced
Runtime ready/non-ready/failure changes DataAuthority
current Renderer terminal
Session terminal
```

→ recompute and replace the entire current physical authority view/null。

No network/IPC await inside Main mutation；the sink owns only immediate in-memory authority invalidation and schedules physical cleanup itself。

A provider throwing from `replace` is a non-conforming Platform implementation; M9 qualification rejects it rather than inventing Runtime/Frame recovery/error hierarchy。

---

## 11. Renderer Acceptance Ordering Through M9

M7 current-switch transaction remains：

```text
validate candidate + exact token
prepare exact hello Result/Snapshot
consume token
candidate becomes only currentRendererPeer
old peer loses current status
```

M9 extends the same Main mutation completion with：

```text
retain accepted token as inert current correlation
replace full DataConnectionAuthorityView for the new current Renderer
```

Old Renderer Data material becomes stale immediately through sink replacement。Old Renderer Control physical close may converge later as already allowed by M7。

No second currentness protocol。

---

## 12. Current Renderer Terminal / Session Terminal

Current Renderer terminal with no replacement：

```text
clear currentRendererPeer
clear currentRendererControlToken
replace(null)
```

Session terminal：

```text
latch terminal
replace(null)
stop/retire Renderer attempts/current
abort Session physical work
```

Sink null replacement occurs before asynchronous Data/Renderer physical cleanup and does not delay Main Session result。

---

## 13. Runtime / DataAuthority Changes

Existing mutations already call one serialized observation point。M9 extends that point：

```text
commit Main state
→ project/publish Renderer-visible Snapshot if payload changed
→ project current Platform Data authority view from same committed state
→ replace sink if physical view changed/currentness changed
```

No new transaction manager is introduced。Implementation may use a pure helper/cache to avoid redundant identical sink replacement, but no shadow authority registry。

A ready Runtime entry requires `record.hosted !== null`; exact object identity is passed to Platform。

---

## 14. M9 Qualification

Main tests MUST prove：

```text
MainPlatform.dataConnections validation/optionality
absent sink leaves all M1–M8 behavior unchanged
initial null sent when sink present
non-null view only when current Renderer exists
accepted token retained inertly after authentication consumption
retained live token blocks duplicate opaque-material reuse
replacement T1→T2 updates sink in same serialized current switch
current Renderer terminal sends null
ready/non-ready DataAuthority transitions update full view
exact HostedRuntime object is projected
entries exact/unique/deterministic
sink replacement alone does not bump rendererRevision
Session terminal sends null before async cleanup
no Broker/endpoint/ticket/candidate state in Main
```

M8 authority tests remain green unchanged。

---

## 15. Freeze Statement

M5 Runtime/Frame、M7 Renderer Control、M8 logical DataAuthority are implemented baselines。M9 adds only the frozen physical authority projection above。

Implementation MUST NOT redesign：

```text
MainPlatform M9 exact optional sink
DataConnectionAuthorityView exact identity fields
one-shot Renderer authentication semantics
current token inert-retention boundary
HostedRuntime object identity correlation
sink full-replacement/non-throwing call discipline
Renderer revision isolation
single serialized Main mutation ownership
```

M7 semantics reopen under ADR 0027；M9 projection semantics reopen under ADR 0028 only。
