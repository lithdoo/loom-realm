# M9 Implementation Qualification

> 状态：**Implemented / Qualified**
> 日期：2026-09-04
> 规范入口：仓库根目录 `M9_05_QUALIFICATION_CLOSURE.md`

M9 已关闭 Hostra/Desktop physical Data Broker slice：Main current authority 通过同步 full-view sink 驱动 bounded paired installation，Runner post-install delivery failure 只退休 Data pair，不回滚旧 current，也不改变 Runtime/Frame authority。

## Implemented Surface

```text
@loomrealm/platform-ports
    DataConnectionAuthorityEntry / View / Sink

@loomrealm/main
    optional dataConnections
    initial null + immutable exact full-view projection
    current Renderer token inert correlation

@loomrealm/game-launcher-hostra
    exact HostedRuntime → HostraRuntimeDataProvisioner handoff
    dedicated provision/prepared/commit/committed/revoke child IPC
    bounded Runner prepared/current-deliverable Data state

apps/desktop
    session-scoped DataConnectionBroker
    Map<S, 0..1 pending + 0..1 current>
    two-sided one-time loopback Data WebSocket relay
    token-scoped RendererDataBinding delivery cells
    finite role-undelivered and relay buffering
```

## Authority Evidence

- Main tests prove initial `replace(null)`, current-Renderer-only non-null publication, detached frozen snapshots, deterministic entries, exact `HostedRuntime` reference identity and terminal null.
- The accepted Renderer token remains one-shot authentication material; Main retains only the current value as inert correlation and includes it in live material duplicate defense.
- Sink projection runs in the existing serialized mutation lane and does not independently bump Renderer revision.
- Desktop replacement updates in-memory authority and makes stale pending/current material unusable before asynchronous socket/IPC cleanup.

## Provisioning and Installation Evidence

- Hostra tests prove optional hook compatibility, exact Runtime/provisioner handoff before launch resolution, child convergence on callback failure, bounded prepared/current-deliverable state and finite committed-undelivered buffering.
- Desktop harness proves exact T/R/S/G/P revalidation, one pending owner, explicit stale revoke, pre-install traffic rejection, sole-current cutover and whole-pair retirement.
- Runner `commit()` is invoked only after Broker logical install. Its failure retires the newly installed pair; the old pair is never resurrected.
- Relay paths carry opaque UTF-8 text without parsing Data application JSON. Buffer overflow retires/disposes instead of accumulating or migrating old traffic.

## Production Vertical

The M9 vertical uses production Main, Renderer Control peers/holder, Hostra Node Runner and Runtime Control WebSocket, dedicated provisioning IPC, Desktop two-sided Data WebSockets, M8 Bindings and real Renderer/Subsystem Data peers. Only physical Renderer hosting is deterministic.

The vertical proves fresh same-generation recovery after Data peer/transport retirement with unchanged Main `S/1/loomrealm.renderer-data/1` and unchanged Renderer revision.

## Claim Boundary

M9 qualifies the Hostra/Desktop physical Broker slice only. It does not claim M10 User Input publication baseline, M11 Render publication baseline, production generation replacement/exhaustion, BrowserWindow composition, PWA mapping or full cross-platform Connection-v1 equivalence.

## Reproduction

```powershell
npm run test:m9
npm run test:m8
npm run test:game-launcher-hostra
npm run test:packages
npm run docs:build
npm run docs:check-links
```

The frozen M9 plans and ADR 0028 remain the semantic source; this record adds implementation evidence only.
