# Main M5 Implementation Review

> 层级：实施复核  
> 状态：PASS / merge candidate  
> 最近复核：2026-08-28  

## Scope

Reviewed slice：`@loomrealm/main` M5 Runtime/Frame authority vertical + `@loomrealm/platform-ports` M5 real consumer qualification。Renderer/Data/Input/Render/Content/Hostra/PWA physical implementation不在本 closure。

## Findings closed during review

1. **Fact-source drift**：Main package DESIGN、Main module、Runtime Hosting/Bootstrap、Phase Plan、root README、contract catalog、package/repository/testing plans still described pre-M5 or old prepared-bag shapes. Updated to current `platform.prepareGame() → runMain({bootstrap,platform})` + M5 exact ports.
2. **Runtime failure cause was discarded**：`markRuntimeFailed(code,message)` only set a boolean. Runtime record now latches the first business-safe `MainRuntimeFailure`; later causes cannot overwrite it.
3. **Duplicate failed Runtime authority**：removed `failedRuntimeKeys`; unwind derives failed membership from Runtime records.
4. **Dead speculative state**：removed write-only Session phase and unused LaunchAttempt id/counter. M5 one Runtime record is the current attempt lifetime; no public/internal fake ID needed without restart/retry semantics.
5. **Closed Frame retention**：closed/popped Frames are removed from the live registry. Monotonic IDs still guarantee no reuse, avoiding unbounded live-registry growth in long Sessions.
6. **Termination observation bug**：a rejected `HostedRuntime.terminated` Promise was previously counted as “settled” and could suppress physical escalation. Graceful cleanup now requires successful resolution; rejection is not physical termination proof. Regression test added.

## Elegance decision

`main-session.ts` remains one stateful coordinator intentionally. The file is large because M5 authority is causally coupled, but all mutable Runtime/Frame/Stack/terminal state has one owner and one serialized mutation lane. Splitting by nouns into independent `RuntimeRegistry` / `FrameRegistry` / `FailureManager` objects would increase correlation and dual-owner risk without creating a new semantic boundary.

Accepted extraction rule：extract pure helpers/value validation/protocol adapters when independently useful；do not split mutable authority merely to reduce line count.

## Closure evidence

Review validation run `33156706689` passed on Node 20 and Node 24：

```text
Foundation/Wire/Platform Ports/Runtime Control/Subsystem dependency build   PASS
@loomrealm/main TypeScript build                                           PASS
Main integration tests                                                     10/10 PASS
npm pack --dry-run                                                         PASS
Markdown link validation                                                   PASS
VitePress docs build                                                       PASS
```

Integration uses fake physical Platform only and real：

```text
Main ↔ Runtime Control ↔ MemoryCarrier ↔ Subsystem Host ↔ Business Definition
```

The added termination-observation regression proves that `HostedRuntime.terminated` rejection is not accepted as physical termination evidence and therefore cannot suppress `requestTermination()` escalation.

## Verdict

```text
Main M5 semantic closure        PASS
Main public boundary            PASS
Platform Ports M5 consumer      PASS
Frame/Activation causal order   PASS
Failure/unwind ownership        PASS
Graceful/physical termination   PASS
M7+ scope containment           PASS
```

Next vertical：M6 Hostra Platform implementation。
