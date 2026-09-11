# M15 Desktop Full E2E Qualification Record

## Status

**Implementation complete / local frozen-Hostra qualification PASS / hosted qualification and formal M15 closure pending.**

Current physical subject is defined by：

```text
ADR 0034
+ M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
```

The previous direct-Electron implementation is not the current qualification subject。

Frozen external host baseline：

```text
package           hostra@1.0.1-beta.1
source repository lithdoo/hostra
source commit      d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron   44.1.1
shutdown grace     1000 ms
```

Formal M15 closure requires：

```text
M14 formally Closed
+ frozen Hostra baseline used exactly
+ Hostra-owned npm run test:m15 PASS in supported CI
+ Hostra-owned full Desktop E2E/lifecycle evidence PASS
→ M15 Closed
```

---

## 1. Frozen Qualification Subject

The next qualifying subject is the first landed LoomRealm tree containing：

```text
frozen Hostra shell
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ LoomRealm RuntimeHosting Runner child
→ Hostra RPC Window lifecycle
→ Hostra-owned BrowserWindow
→ LoomRealm Control/Data/Content physical services
→ existing Main/M10–M14 path
```

Record exact LoomRealm commit SHA after implementation lands。The Hostra identity is already frozen above；any later behavior-affecting change to M15 physical path、Hostra baseline、harness/workflow or consumed lower-layer behavior creates a new qualification subject and requires requalification。

---

## 2. Required Current Evidence

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing milestone prerequisite | current `npm run test:m14` on same tree | **required** |
| Formal M14 prerequisite | `m14-qualification.md` status `Closed` | **PENDING** |
| Frozen M15 design | ADR 0034 + recomposition SSOT + frozen Hostra baseline | **PASS / PREIMPLEMENTATION CLOSED** |
| M15 boundary/build | no canonical LoomRealm Electron ownership | **LOCAL PASS — 2026-09-11** |
| Real Hostra vertical | frozen Hostra → HOSTRA_SUBCMD LoomRealm → Hostra-owned Window | **LOCAL PASS — 2026-09-11** |
| Document bootstrap | acquire/document rendezvous + navigation-only route | **LOCAL PASS — 2026-09-11** |
| Input/reload/reconnect | production Hostra Window path | **LOCAL PASS — 2026-09-11** |
| Termination/failure | signals/window/RPC/fatal/startup failure → one termination funnel | **LOCAL PARTIAL / HOSTED POSIX REQUIRED** |
| Canonical aggregate | `npm run test:m15` | **LOCAL PASS — Windows / Node 22.12.0 / 2026-09-11** |
| Hosted qualification | dedicated M15 workflow, same subject | **PENDING IMPLEMENTATION** |
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
frozen Hostra package/source/Electron baseline is used
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
frozen Hostra ready
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

Data-only reconnect：

```text
same-generation physical Data loss
→ same Renderer Control participant remains current
→ DataAuthority retained
→ existing Broker fresh pair/current
→ fresh RendererDataBinding.acquire() resolves
→ only Data physical pair changes
→ same Renderer identity resumes current truth
```

Qualification MUST assert Renderer logical identity is unchanged during Data-only reconnect。This is intentionally different from reload, which creates a fresh Renderer identity。

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

Frozen Hostra final-window shutdown behavior is part of the qualification subject。The suite must prove Hostra termination signals do not bypass LoomRealm cleanup and leave the RuntimeHosting Runner orphaned。

Observable terminal evidence：

```text
Runner PID absent
LoomRealm child absent
former loopback ports refuse connections
Hostra converges according to its normal model
```

If the owner chain cannot converge within the frozen Hostra **1000 ms** shutdown grace, M15 fails qualification and the physical boundary must be explicitly reopened；qualification must not hide this with a Desktop direct Runner kill shortcut。

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
→ frozen Hostra full E2E
→ document/bootstrap qualification
→ input/reload/Data-only reconnect
→ termination/failure/startup-cleanup evidence
```

---

## 10. Current Implementation Evidence — 2026-09-11

The current uncommitted implementation tree completed the seven recomposition slices and passed the canonical aggregate locally：

```text
Windows
Node 22.12.0
npm 10.9.0
frozen Hostra d863beab3c59c3bd4f271514a228fa8fee0bf5b6
npm run test:m15 → PASS
```

Observed real-host evidence：

```text
Hostra host PID owns the CDP BrowserWindow
LoomRealm PID is Hostra subprocess.pid and direct child
Runner PID is LoomRealm direct child
M14 map visible
trusted ArrowRight move + blocked second move
fetch(location.href) and iframe produce no document lifetime
reload retains Hostra windowId and game state while replacing Renderer identity
Data-only physical loss retains Renderer identity and generation
input/presentation resume after Data replacement
Runner abrupt loss converges through Main and the product termination funnel
representative PREPARE failure leaves no Window or RPC listener
programmatic product close uses the same cleanup funnel
Hostra RPC terminal triggers product cleanup
openWindow failure preserves its cause and closes partial resources
former Content/listener port refuses connections after process exit
```

The frozen Hostra baseline uses catchable POSIX signals for its 1000 ms final-window grace path，while its own upstream signal test is skipped on Windows。Accordingly the local Windows run proves final-window Hostra/process convergence but cannot claim the complete signal-handler cleanup ordering。The hosted Ubuntu M15 workflow must prove the full `window.closed` / `host.shuttingDown` / SIGTERM ordering and all terminal cleanup events before this row becomes PASS。

The workflow now checks out the exact frozen Hostra commit and sets `HOSTRA_SOURCE_DIR`；it does not install a moving Hostra version or patch Hostra runtime source。Record the LoomRealm commit SHA here after the implementation lands；until hosted evidence targets that SHA, formal M15 remains pending。

---

## 11. Formal Closure Rule

M15 may be changed to **Closed** only when this record identifies one current LoomRealm implementation subject and records：

```text
M14 = formally Closed
+ ADR 0034 propagation complete
+ frozen Hostra baseline used exactly
+ local/current npm run test:m15 = PASS
+ hosted npm run test:m15 = PASS
+ Hostra-owned E2E/lifecycle evidence = PASS
→ M15 Closed
```

Current state：

```text
M10–M14 logical/business contracts   frozen
historical standalone Electron M15   implemented + migration-qualified
M15 Hostra physical design           Implementation Frozen / Preimplementation Closed
M15 Hostra implementation            complete + locally qualified
formal M15 milestone                 pending
```

No further architecture/design pass is required。Only evidence of a real contradiction with the frozen Hostra baseline or a frozen LoomRealm contract may reopen M15 physical design。
