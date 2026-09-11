# M15 Desktop Full E2E Qualification Record

## Status

**Hostra physical recomposition pending implementation / previous standalone Electron evidence retained as historical / formal M15 closure pending.**

Current physical subject is defined by：

```text
ADR 0034
+ M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
```

The previous direct-Electron implementation is not the current qualification subject。

Formal M15 closure requires：

```text
M14 formally Closed
+ exact pinned Hostra identity
+ Hostra-owned npm run test:m15 PASS in supported CI
+ Hostra-owned full Desktop E2E/lifecycle evidence PASS
→ M15 Closed
```

---

## 1. Current Qualification Subject

The next qualifying subject is the first landed tree containing：

```text
pinned Hostra shell
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ LoomRealm RuntimeHosting Runner child
→ Hostra RPC Window lifecycle
→ Hostra-owned BrowserWindow
→ LoomRealm Control/Data/Content physical services
→ existing Main/M10–M14 path
```

Record exact LoomRealm commit SHA + Hostra version/source identity after implementation lands。Any later behavior-affecting change to M15 physical path、Hostra pin、harness/workflow or consumed lower-layer behavior creates a new subject。

---

## 2. Required Current Evidence

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing milestone prerequisite | current `npm run test:m14` on same tree | **required** |
| Formal M14 prerequisite | `m14-qualification.md` status `Closed` | **PENDING** |
| M15 boundary/build | ADR 0034 + no canonical LoomRealm Electron ownership | **PENDING RECOMPOSITION** |
| Real Hostra vertical | pinned Hostra → HOSTRA_SUBCMD LoomRealm → Hostra-owned Window | **PENDING RECOMPOSITION** |
| Document bootstrap | acquire/document rendezvous + navigation-only route | **PENDING RECOMPOSITION** |
| Input/reload/reconnect | production Hostra Window path | **PENDING RECOMPOSITION** |
| Termination/failure | signals/window/RPC/fatal/startup failure → one termination funnel | **PENDING RECOMPOSITION** |
| Canonical aggregate | `npm run test:m15` | **PENDING RECOMPOSITION** |
| Hosted qualification | dedicated M15 workflow, same subject | **PENDING RECOMPOSITION** |
| Formal M15 closure | all rows above PASS for one subject | **PENDING** |

`getHostState/getAllWindows` may observe that a Window is Hostra-owned；they are not production authority/currentness mechanisms。

---

## 3. Required Boundary Evidence

Mechanically prove：

```text
Hostra shell is actual Electron/BrowserWindow owner
LoomRealm Desktop is actual HOSTRA_SUBCMD direct child
Runner is LoomRealm RuntimeHosting child
canonical Hostra path imports no Electron
canonical Hostra path does not create BrowserWindow or own app.quit
Hostra source/runtime is not patched for LoomRealm
Hostra RPC carries only host-control operations
Hostra types do not leak into platform-ports/Main/Renderer/game packages
Renderer Control uses LoomRealm loopback carrier
Data settlement remains separate from Data application
M9 Broker remains sole Data candidate/current owner
Content/M13/M14 logical paths remain unchanged
business code does not require Hostra ambient electronAPI
no second Runner kill authority
no generic Hostra/Window/Document/Connection/Recovery abstraction
```

Migration staging：before final replacement, isolated legacy direct-Electron source may remain as regression oracle。Repository-wide no-Electron ownership becomes mandatory only after the Hostra replacement vertical passes。

---

## 4. Document / Bootstrap Evidence

Must exercise both rendezvous orderings：

```text
acquire first → document later → converge
document first → acquire later → converge
```

And cancellation：

```text
aborted document does not consume later acquire
retired acquire does not bootstrap later document
product terminal clears pending acquire/document/current material
```

Trusted shell route must prove：

```text
top-level main-document navigation → may mint fresh Renderer lifetime
fetch(location.href)               → no lifecycle effect
XHR                                → no lifecycle effect
iframe/subframe                    → no lifecycle effect
resource request                   → no lifecycle effect
wrong route secret                 → no lifecycle effect
```

Qualification should assert the observable result, not a specific HTTP-header implementation。

---

## 5. Runtime / Gameplay Evidence

Startup：

```text
pinned Hostra ready
→ starts LoomRealm HOSTRA_SUBCMD
→ LoomRealm launch-profile PREPARE
→ Main/Runner ready
→ Hostra RPC openWindow
→ Hostra-owned page displays canonical M14 map
```

Input：

```text
trusted ArrowRight
→ same M10 path
→ (10,8) → (11,8)
→ second Right blocked
```

Reload：

```text
same Hostra windowId
→ fresh Renderer identity
→ unchanged Main/Runner/Subsystem generation/game state
→ fresh Control/Data/Content document material
→ current projection/input resumes
```

Data reconnect：

```text
same-generation physical Data loss
→ DataAuthority retained
→ existing Broker fresh pair/current
→ fresh Renderer acquire
→ presentation resumes
```

---

## 6. Termination / Failure Evidence

The same idempotent termination owner path must be observed for：

```text
user final-window close
programmatic closeWindow
SIGTERM / SIGINT
host.shuttingDown
Hostra RPC terminal
Main fatal
Runner fatal
representative startup partial failure
```

Required convergence：

```text
beginTermination
→ stop new document activity
→ abort runMain
→ Main/RuntimeHosting convergence
→ finally Control/Data/Content/document cleanup
→ LoomRealm child exits
```

Pinned Hostra's actual final-window shutdown behavior is part of the qualification subject。The suite must prove Hostra termination signals do not bypass LoomRealm cleanup and leave the RuntimeHosting Runner orphaned。

Observable terminal evidence：

```text
Runner PID absent
LoomRealm child absent
former loopback ports refuse connections
Hostra converges according to its normal model
```

If the owner chain cannot converge within pinned Hostra's real shutdown grace, M15 fails qualification and the physical boundary must be explicitly reopened；qualification must not hide this with a Desktop direct Runner kill shortcut。

---

## 7. Startup Failure Evidence

At least representative failures from these stages must leave no live resources：

```text
Hostra RPC / PREPARE
listener startup
runMain early reject
openWindow failure
Window/document bootstrap or Renderer convergence failure
```

`openWindow` RPC success alone is not product ready。

---

## 8. Historical Standalone Electron Evidence — 2026-09-11

The previous direct-Electron implementation remains useful only as migration/regression evidence。

Historical environment：

```text
Windows
Node 22.12.0
npm 10.9.0
Electron 44.3.0
```

Historical `npm run test:m15` proved：

```text
checked-in M14 fixture
real direct Electron BrowserWindow
trusted ArrowRight movement + blocking
synthetic keyboard/pointer rejection
reload projection
same-generation Data reconnect
post-bootstrap fetch/WebSocket replacement resistance
normal direct-Electron shutdown
Pointer/Gamepad producer behavior
```

It demonstrates the M10–M14 seams work in real Chromium/Electron, but does not prove Hostra shell ownership、HOSTRA_SUBCMD lifecycle、Hostra signal convergence or navigation-only bootstrap。

Historical exact-source Essentials evidence also remains compatibility evidence for M14/content, not final Hostra-owned M15 closure。

---

## 9. Canonical Gate

The unique closure command remains：

```text
npm run test:m15
```

Final composition：

```text
npm run test:m14
→ M15 boundary/build checks
→ pinned Hostra full E2E
→ document/bootstrap qualification
→ input/reload/reconnect
→ termination/failure/startup-cleanup evidence
```

The old direct-Electron gate may remain temporarily during migration, but after Hostra replacement qualification it must not remain the canonical M15 closure owner。

---

## 10. Formal Closure Rule

M15 may be changed to **Closed** only when this record identifies one current Hostra recomposition subject and records：

```text
M14 = formally Closed
+ ADR 0034 propagation complete
+ exact pinned Hostra identity
+ local/current npm run test:m15 = PASS
+ hosted npm run test:m15 = PASS
+ Hostra-owned E2E/lifecycle evidence = PASS
→ M15 Closed
```

Until then：

```text
M10–M14 logical/business contracts   frozen
historical standalone Electron M15   implemented + migration-qualified
M15 Hostra physical composition      implementation pending
formal M15 milestone                 pending
```
