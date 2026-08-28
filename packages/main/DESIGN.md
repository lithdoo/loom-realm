# `@loomrealm/main`

> 状态：**M5 Implemented Baseline / Runtime Control Consumer Qualified / M7+ Evolving**  
> 阶段：M5 Main logical bootstrap + Runtime/Frame authority vertical  
> 最近复核：2026-08-28  

`@loomrealm/main` 是 platform-neutral Main application authority runtime。M5 已实现 `LogicalGameBootstrap → required Runtime bootstrap/ready → initial Frame → nested call/return → Runtime failure unwind → Session terminal` 的完整纵向切片。

M5 closure **不**表示最终 Main role 已全部实现；Renderer Control、DataAuthority/DataConnectionBroker 等 capability 仍按 M7+ milestone 增长。

---

## 1. Public Surface

当前 root export：

```text
runMain
MainRuntimeFatalError

LogicalGameBootstrap
MainPlatform
MainPolicy
RunMainOptions
MainSessionResult
MainFrameOutcome / MainFrameFailure
MainRuntimeFailure
```

没有 class/service-locator lifecycle API；一个 `runMain()` 拥有一个 Main Session lifetime。

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly bootstrapTokens: BootstrapTokenGenerator;
  readonly runtimeHosting: RuntimeHosting;
}

interface RunMainOptions {
  readonly bootstrap: LogicalGameBootstrap;
  readonly platform: MainPlatform;
  readonly policy: MainPolicy;
  readonly signal?: AbortSignal;
}
```

`MainPlatform` 只是 Main 当前需要的 narrow structural capability view，不是 universal LoomRealm Platform interface。Concrete `HostraPlatform` / `PwaPlatform` 可以 structural-satisfy 它。

---

## 2. Runtime Dependencies

```text
@loomrealm/main
    ├── @loomrealm/platform-ports
    ├── @loomrealm/runtime-control
    └── @loomrealm/wire
```

测试使用 `@loomrealm/foundation` MemoryCarrier 与真实 `@loomrealm/subsystem/host`，但它们不是 Main runtime dependency。

禁止：

```text
@loomrealm/game-package
@loomrealm/game-launcher-hostra / pwa
concrete Hostra/PWA types
Node/Worker/WebSocket/MessagePort
Renderer/Data/Content M7+ capability
```

---

## 3. Logical Bootstrap / Runtime Establishment

```text
LogicalGameBootstrap
→ defensive logical key/initial validation
→ one required Runtime record per declared subsystemKey
→ BootstrapTokenGenerator.generate()
→ Main validates/registers fresh token material
→ RuntimeHosting.launch({subsystemKey, bootstrapToken})
→ HostedRuntime.runtimeControl.acquire()
→ createMainRuntimeControlPeer()
→ Main authenticate/consume hello token
→ identified
→ subsystem.status(ready)
```

Phase 1 all declared Runtime are eager + required。Main 不读取 Game Entry、PlatformLaunchPlan 或 executable material。

`BootstrapTokenGenerator` 只提供 environment-backed high-entropy material；Launch Attempt/currentness、token registration/binding/consumption authority 始终属于 Main。

M5 不发布无消费价值的 LaunchAttempt ID；当前一个 Runtime record 本身就是该 subsystem 的唯一 current Launch Attempt lifetime。新 attempt/restart 仍禁止。

---

## 4. Authority Model

Main M5 mutable authority 由一个 `MainSessionRuntime` coordinator 单点拥有：

```text
Runtime records
Frame records
Stack
current Activation per active Frame
Session terminal
```

这不是“所有 noun 一个 manager”的 registry architecture。M5 刻意保持一个 mutable authority owner，并只抽离纯 helper/deadline/clone mechanics，避免 Runtime/Frame/Unwind 多 owner 竞态。

InputTarget 不保存第二份 mutable registry，而由：

```text
Stack top + active Frame + current Activation
```

即时派生。Failed-Runtime membership 同样由 Runtime record 的 first-wins failure fact 派生，不维护第二份 failed-key set。

Frame/Activation ID session-unique、monotonic、never reused。Closed Frame 从 live registry 退休；ID uniqueness 由 monotonic allocator 保证，不靠永久保留历史对象。

---

## 5. Frame / Call Transactions

Main 使用真实 `MainRuntimeControlPeer`，并保持 Frozen Frame v1 causal barriers。

```text
Initial
initialize Success
→ activate(fresh A) Success
→ publish active authority

Call
validate F/A/current top/target ready
→ revoke caller A + suspend caller + allocate/push child
→ frame.call Response send accepted
→ child initialize
→ child activate(fresh Achild) Success
→ publish child active authority

Return
accept immutable child outcome + revoke Achild + closing
→ frame.return Response send accepted
→ close child
→ pop/retire child
→ resume caller with fresh A' Success
→ publish caller active authority
```

Known precommit target missing/unavailable 是 recoverable semantic rejection；caller Activation 保持 current。Timeout/terminal/nonrecoverable divergence 进入 Runtime failure，绝不猜 commit、retry/replay 或重新使用旧 Activation。

---

## 6. Runtime Failure / Fixed-point Unwind

每个 Runtime record 保存一个 **first-wins immutable business-safe `MainRuntimeFailure` fact**。后续 Control terminal、physical termination 或 Frame ambiguous outcome 不覆盖 primary cause。

Frame business-facing unwind 不泄漏 transport/protocol diagnostics；如果 failed Runtime 的 doomed root 尚无 accepted business outcome，则合成为：

```text
failed { code: "SUBSYSTEM_RUNTIME_FAILED" }
```

Unwind：

```text
find lowest live Frame whose Runtime has failure
→ whole suffix doomed
→ revoke current Activation
→ healthy-runtime contexts close Top→Bottom
→ close failure may expand failed Runtime set
→ recompute until fixed point
→ preserve accepted outcome
→ fresh-resume surviving healthy direct Caller
→ or produce root outcome
```

Normal call/return、Control/physical failure callbacks与 unwind 共享一个 serialized mutation lane。

---

## 7. Session Terminal / Cleanup

Public terminal semantics：

```text
root business outcome
    → resolve {kind:"root-outcome", outcome}

external AbortSignal
    → resolve {kind:"shutdown"}

bootstrap/Main invariant fatal
    → reject MainRuntimeFatalError
```

Graceful terminal cleanup：

```text
Main latches Session terminal
→ subsystem.shutdown
→ if shutdown Success: bounded wait HostedRuntime.terminated
→ if no successful physical termination observation: requestTermination()
→ bounded wait again
```

`shutdown Success != terminated`；`requestTermination Success != terminated`；`HostedRuntime.terminated` **resolution** is the physical fact。Promise rejection/observation failure不是 termination proof。

Already-failed Runtime 不重新走 graceful shutdown；failure path 可直接 request physical termination。Cleanup failure 不替换已经 committed 的 Session terminal。

---

## 8. Executable Evidence

M5 tests 使用 fake Platform 只替代 physical hosting，真实运行：

```text
@loomrealm/main
↕
@loomrealm/runtime-control
↕
Foundation MemoryCarrier
↕
@loomrealm/subsystem/host
↕
real Subsystem Definition
```

覆盖：

```text
public package boundary
cross-Subsystem nested Frame
same-Subsystem recursion / no reentrant deadlock
recoverable undeclared target
child Runtime failure whole-suffix unwind + fresh Caller resume
root Runtime loss + stale continuation non-reentry
duplicate bootstrap token fail-closed
external abort graceful shutdown
root-outcome graceful shutdown
termination observation rejection is not physical termination proof
```

Node 20 / Node 24 build、tests、`npm pack --dry-run` 是 M5 merge gate。

---

## 9. M5 Closure / Non-goals

M5 允许声明：

```text
@loomrealm/main M5 Runtime/Frame Authority Implemented Baseline
Main Runtime Control real consumer qualified
Platform Ports M5 Main slice real consumer qualified
LogicalGameBootstrap → Runtime/Frame → Session terminal vertical closed
```

M5 不允许声明：

```text
@loomrealm/main full package implemented
Renderer Control implemented
DataAuthority/DataConnectionBroker implemented
Input/Render/Content integration complete
Hostra/PWA physical Runtime implementation complete
```

下一真实 consumer/vertical gate 是 M6 Hostra Platform vertical。
