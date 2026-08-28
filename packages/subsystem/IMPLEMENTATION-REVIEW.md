# `@loomrealm/subsystem` M4 Implementation Review

> Review date: 2026-08-28  
> Scope: M4 Runtime/Frame Core + Host Runtime Control qualification  
> Verdict: **PASS — semantic/architecture closure**  
> Merge gate: every required PR check on the final head MUST complete successfully.  
> This review does **not** claim M8/M10/M11/M12 capability completion.

## Review standard

The implementation is accepted only when it is simultaneously **simple, elegant, and closed**.

```text
Formal Contract
↓
Implementation
↓
Executable tests
↓
Real role consumer
↓
Milestone claim
```

A later layer cannot be claimed when an earlier layer is missing.

## 1. Simple

### One problem, one owner

```text
@loomrealm/runtime-control
    JSON-RPC/profile mechanics
    request deadlines
    connection terminal fact

@loomrealm/platform-ports
    DeadlineScheduler
    RuntimeControlBinding

@loomrealm/subsystem/host
    Subsystem role orchestration
    RuntimeControlTerminal -> RuntimeFailure mapping
    first terminal cause
    bounded terminal cleanup

FrameRuntime
    local Frame state/capability
    mutation gate
    call/resume/return control flow

@loomrealm/subsystem author root
    business-safe API only
```

The Runtime Control terminal taxonomy has exactly one Subsystem-side mapper: `SubsystemHost`. `FrameRuntime` quarantines fatal continuations but does not manufacture a competing terminal code from timeout/terminal/fatal semantic outcomes.

### No speculative capability surface

M4 intentionally does not publish or implement:

```text
DataPlane / SubsystemDataBinding
InputListener / InputManager
RenderDomain / RenderManager
ContentClient
reconnect / retry / replay
service locator / generic RPC bus
Hostra/PWA transport adapters
```

Those capabilities remain owned by the same role package but land only at M8/M10/M11/M12.

### Small public boundary

Current author root is limited to Definition/Frame/Outcome and business-safe local errors. Trusted runtime integration is isolated under `@loomrealm/subsystem/host`; author code does not receive Runtime Control, Platform Ports, MessageCarrier, bootstrap token mechanics, or physical transport APIs.

## 2. Elegant

### Protocol semantics are mapped, not reinvented

The package consumes the real typed `SubsystemRuntimeControlPeer`. It does not duplicate Runtime Control codec, request correlation, request deadline, terminal, or carrier mechanics.

### Commit evidence controls business continuation

```text
frame.initialize ACK
    -> local context exists; handler not started

frame.activate Response acceptance
    -> install Activation
    -> start handler exactly once

frame.call Success
    -> old Activation remains revoked
    -> business continuation stays suspended

frame.resume Response acceptance
    -> install fresh Activation
    -> resolve frame.call with child FrameOutcome

recoverable target rejection
    -> restore current pre-commit Activation
    -> reject FrameCallRejectedError

fatal / timeout / terminal / ambiguity
    -> never settle back into old business continuation
```

This preserves the Frozen Frame/Call commit model instead of translating it into ordinary Promise success/failure semantics that could accidentally roll authority back.

### Observable terminal facts do not depend on races

Carrier loss, request timeout, protocol-fatal and local-fatal are first committed by Runtime Control. Subsystem Host maps that immutable terminal fact once. A pending `frame.call` or `frame.return` cannot win a microtask race and overwrite the same terminal event with a different RuntimeFailure code.

### Terminal handling is bounded

`terminalCleanupDeadlineMs` is role-local policy. `shutdown()` / `failed()` / peer close are best-effort bounded cleanup; hook or cleanup failures are secondary diagnostics and never replace the first terminal cause.

## 3. Closed

### Formal contracts

M4 is grounded in the existing Runtime Control Profile v1, Subsystem Control v1, Frozen Frame/Call v1, and frozen M4 Platform Ports contracts. No new wire protocol is introduced by this package.

### Implementation

The package now has an executable npm package with:

```text
@loomrealm/subsystem
@loomrealm/subsystem/host
FrameRuntime
runSubsystem
Runtime/Frame local errors
Outcome validation/helpers
```

### Executable evidence

Tests cover at least:

```text
author helper validation
root vs /host boundary
initialize does not start handler
activate starts handler once
author scope and Frame signals
accepted child call -> fresh resume -> FrameOutcome
recoverable call rejection
fatal Control loss never re-enters business continuation
request timeout uses Host-owned terminal classification
administrative suspend aborts/discards late result
uncaught business exception -> sanitized failed outcome
exactly-one normal return path
bounded failed/shutdown hooks
single RuntimeControlBinding acquisition
```

The package workflow builds direct source-workspace dependencies, runs the Subsystem test suite on Node 20 and Node 24, and verifies `npm pack --dry-run`.

### Real consumers

M4 supplies the first real Subsystem-side consumer of both:

```text
@loomrealm/platform-ports RuntimeControlBinding / DeadlineScheduler
@loomrealm/runtime-control SubsystemRuntimeControlPeer
```

This is real role integration, not a mock package boundary invented solely for tests.

### Allowed milestone claim

After the final PR head is green and merged, the repository may state:

```text
Platform Ports M4 contract real consumer qualified
Subsystem Runtime/Frame Core Implemented
Subsystem Host Runtime Control consumer qualified
```

It must still not state:

```text
@loomrealm/subsystem full package implemented
Subsystem Data/Input/Render/Content complete
M8/M10/M11/M12 closed
```

## Final review

No M4 blocker remains in the package architecture or implementation design. The remaining merge condition is mechanical evidence only: the final PR head must pass its required CI checks. Once that is true, M4 is considered **simple, elegant, and vertically closed within its declared Runtime/Frame slice**.
