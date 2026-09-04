# M8 Implementation Qualification

> 状态：**Implemented / Qualified**
> 日期：2026-09-04
> 规范入口：仓库根目录 `M8_05_QUALIFICATION_CLOSURE.md`

M8 已关闭当前 Phase 1 可达的 DataAuthority 与 role-facing current Data peer slice。它不声明 M9 physical Broker、M10 Input、M11 Render 或 Hostra/PWA physical profile equivalence 已完成。

## Implemented Surface

```text
@loomrealm/main
    committed Runtime ready → S/1/loomrealm.renderer-data/1
    no independent Data authority state

@loomrealm/platform-ports
    RendererDataBinding
    SubsystemDataBinding / SubsystemDataBindingResult

@loomrealm/subsystem/host
    optional non-blocking acquire
    current peer / one pending attempt / host-lifetime acquisition stop
    identity-safe terminal recovery and bounded teardown

@loomrealm/renderer
    createRendererControlHolder(data?)
    per-subsystem current / pending / failed-desired reconciliation
    Control-peer + S/G/P failure identity
```

Both roles construct the real `@loomrealm/data` peers. The minimal handlers used at this milestone retain no Input or Render business state.

## Evidence

- Main tests prove ready projection, fixed generation/profile, ready-exit removal, deterministic order, Renderer Control propagation, and unchanged authority/revision across Data loss.
- Platform Ports boundary tests prove the exact public names/fields and the Foundation-only runtime dependency.
- Subsystem tests prove capability absence, non-blocking acquire, late-result close, same-generation fresh peer, host-lifetime rejection/construction-failure isolation, abort, and bounded graceful/fatal cleanup.
- Renderer tests prove exact construction seam, Snapshot reconciliation, stale-result close, same-generation reacquire, Control A→B cleanup, per-slot rejection isolation, and construction-failure isolation.
- The deterministic Main test vertical uses production Main, Renderer Control, Subsystem host, Renderer holder, real Data peers, and a fixture-owned `MemoryCarrier` pair. It proves initial installation and fresh same-generation recovery without a Main authority or revision change.
- Existing `@loomrealm/data` tests retain single-reader, serialized-writer, role direction, terminal-first-wins, no replay, and fresh-peer-state evidence.

## Dependency Closure

```text
platform-ports → foundation
data           → foundation + wire
main           → platform-ports + runtime-control + renderer-control + wire
subsystem      → platform-ports + runtime-control + data + wire
renderer       → renderer-control + platform-ports + data
```

No role depends on Main or a concrete Platform. No endpoint, ticket, Broker, transport adapter, generation allocator, retry scheduler, Store, InputManager, or RenderManager was introduced.

## Reproduction

```powershell
npm run test:m8
npm run test:packages
npm run docs:check-links
npm run docs:build
```

The checked-in package lock records the new Renderer and Subsystem workspace dependencies. Frozen protocol and contract documents remain unchanged.
