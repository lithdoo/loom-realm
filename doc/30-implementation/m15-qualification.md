# M15 Desktop Full E2E Qualification Record

## Status

**Requalification Pending for executable / qualification-input subject `a5e406827d0e3814dad3ac797c4b5f13015173a0`.** The previous `488f8713a23158e736153677ec68e449879a8a1d` evidence is historical: later landed Desktop Input/Viewport、Renderer/Data/Subsystem Content changes affect the M15 consumed lower layers, and PR #75 also changes M14 qualification inputs that are part of the canonical `npm run test:m15` aggregate through its leading `npm run test:m14`. The final such current input change is `a5e406827d0e3814dad3ac797c4b5f13015173a0`; later ledger-only commits do not create a newer M15 subject. PWA remains OUT OF SCOPE.

M14 is formally Closed for the same subject `a5e406827d0e3814dad3ac797c4b5f13015173a0` by [M14 run 37731662353](https://github.com/lithdoo/loom-realm/actions/runs/37731662353), satisfying M15's M14 prerequisite. Current-subject M15 delta evidence is [M12-M15 PR run 37732770302](https://github.com/lithdoo/loom-realm/actions/runs/37732770302): hosted Node 24 `test:m15:pr` PASS with frozen Hostra, including Desktop 15/15 and Hostra 16/16. That job is **not** the canonical `npm run test:m15` aggregate, so Formal M15 remains Requalification Pending.

The previous Closed decisions remain historical records for subjects `fd1df5872d4310e268857e700a067f4e0b9e75d1` and `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f`. Evidence recorded for `488f8713a23158e736153677ec68e449879a8a1d` is likewise previous-subject evidence only. Physical design, ADR 0034, and the frozen Hostra baseline are not reopened.

Current physical subject is defined by：

```text
ADR 0034
+ M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
+ LoomRealm implementation / qualification input a5e406827d0e3814dad3ac797c4b5f13015173a0
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

The current qualifying implementation / qualification-input subject is：

```text
a5e406827d0e3814dad3ac797c4b5f13015173a0
test(m14): assert propagated exact viewport
```

It is the current LoomRealm tree containing：

```text
frozen Hostra shell
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ LoomRealm RuntimeHosting Runner child
→ Hostra RPC Window lifecycle
→ Hostra-owned BrowserWindow
→ LoomRealm Control/Data/Content physical services
→ current Main/M10–M14 path
```

Subject audit：

- changes landed after the previous `488f8713...` subject affect Desktop Input/Viewport、Renderer/Data and Subsystem Content behavior consumed by M15；
- PR #75 changes M14 qualification inputs, and canonical `npm run test:m15` begins with `npm run test:m14`；
- commit `a5e406827d0e3814dad3ac797c4b5f13015173a0` changes `test/m14-boundary.test.mjs`, so it is the last current M15 qualification-input change；
- later documentation-only commits that only record/explain evidence do not create a new subject。

The Hostra identity is frozen above；any later behavior-affecting change to M15 physical path、Hostra baseline、harness/workflow or consumed lower-layer behavior creates a new qualification subject and requires requalification。Later ledger-only commits do not create a new implementation subject。

---

## 2. Required Current Evidence

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing milestone prerequisite | current `npm run test:m14` on the M14 qualification subject | **PASS — hosted Node 20/24 on `a5e406827d0e3814dad3ac797c4b5f13015173a0`, [run 37731662353](https://github.com/lithdoo/loom-realm/actions/runs/37731662353)** |
| Formal M14 prerequisite | `m14-qualification.md` status `Closed` | **PASS — M14 Closed on 2026-10-08** |
| Frozen M15 design | ADR 0034 + recomposition SSOT + frozen Hostra baseline | **PASS / PREIMPLEMENTATION CLOSED** |
| M15 boundary/build | no canonical LoomRealm Electron ownership | **PASS — current-subject-equivalent PR merge tree, hosted Node 24 [run 37732770302](https://github.com/lithdoo/loom-realm/actions/runs/37732770302), `test:m15:desktop` 15/15** |
| Real Hostra vertical | frozen Hostra → HOSTRA_SUBCMD LoomRealm → Hostra-owned Window | **PASS — current-subject-equivalent PR merge tree, hosted Node 24 [run 37732770302](https://github.com/lithdoo/loom-realm/actions/runs/37732770302); frozen Hostra owns the Window and reaches the M14 map** |
| Document bootstrap | acquire/document rendezvous + navigation-only route | **PENDING CURRENT-SUBJECT FULL EVIDENCE — previous-subject results remain historical; current delta is not the canonical aggregate** |
| Input/reload/reconnect | production Hostra Window path | **PENDING CURRENT-SUBJECT FULL EVIDENCE — previous-subject results remain historical; current delta is not the canonical aggregate** |
| Movement first-paint | 640/720/1080 ordinary P95 ≤50ms; refresh P95 ≤50/75/100 | **PARTIAL PASS — current hosted PR-mode 640×480 ordinary P95 26.6ms / refresh P95 44.5ms in [run 37732770302](https://github.com/lithdoo/loom-realm/actions/runs/37732770302); full canonical viewport matrix not rerun** |
| Termination/failure | signals/window/RPC/fatal/startup failure → one termination funnel | **PARTIAL PASS — current delta covers programmatic close、Hostra RPC terminal、openWindow failure、Runner fatal and representative startup failure; full canonical matrix awaits aggregate qualification** |
| Canonical aggregate | `npm run test:m15` | **PENDING — current hosted job ran `test:m15:pr`, not `npm run test:m15`** |
| Hosted qualification | dedicated M15 workflow, same subject | **PENDING — no dedicated current-subject full aggregate is recorded** |
| Formal M15 closure | all rows above PASS for one subject | **Requalification Pending** |

The current PR workflow checks out a merge tree that differs from `a5e4068...` only by the base integration and later M15-irrelevant ledger changes; its M15 delta therefore supplies current-subject behavior evidence, but it does not substitute for the unique canonical aggregate command.

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

### 5.1 Current hosted PR-delta movement measurement — 2026-10-08

Current-subject-equivalent hosted command：

```text
xvfb-run -a npm run test:m15:pr
```

Environment：Ubuntu 24.04、Node 24.21.0、frozen Hostra `d863beab3c59c3bd4f271514a228fa8fee0bf5b6`。

```text
viewport: 640x480
ordinary: n=20, P50=25.3ms, P95=26.6ms, max=33.9ms   PASS
refresh:  n=10, P50=41.8ms, P95=44.5ms, max=44.5ms   PASS
invalid samples: 0 / 51 attempts
camera-only hits: 20/20
zero tile-draw hits: 20/20
```

This is valid current-subject PR-delta evidence, but it is intentionally the reduced 640×480 PR gate. Formal M15 closure still requires the canonical aggregate/current full viewport evidence defined above.

### 5.2 Historical local movement measurement — 2026-09-16

Historical previous-subject local command：

```text
node --test --test-concurrency=1 --test-name-pattern="M15 128x8 ordinary and refresh" test/m15-hostra-product.test.mjs
```

Environment：Windows 10.0.19044、Node 22.12.0、Intel i5-11500、frozen Hostra `d863beab3c59c3bd4f271514a228fa8fee0bf5b6`。

```text
ordinary: n=300, P50=26.5ms, P95=42.9ms, max=61.0ms   PASS
refresh:  n=90,  P50=75.6ms, P95=96.3ms, max=129.7ms FAIL
round 1: attempts=161, invalid=1
round 2: attempts=164, invalid=1
round 3: attempts=164, invalid=1
```

All rounds remained below the frozen 5% invalid-sample cap. A separate real Map066 smoke also proved that one logical movement produces a physical screenshot pixel difference. This table is historical performance evidence only and must not be promoted to the current subject.

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

## 10. Historical Implementation Evidence — 2026-09-11

The then-current implementation subject completed the seven recomposition slices, the qualification cleanup, and the canonical aggregate locally. These results are retained as historical regression evidence and do not qualify the current subject `a5e406827d0e3814dad3ac797c4b5f13015173a0`：

```text
Windows
Node 24.19.0 / npm 10.9.2
frozen Hostra d863beab3c59c3bd4f271514a228fa8fee0bf5b6
npm run test:m15:desktop → PASS
npm run test:m15:hostra → PASS
historical local Node 22.12.0 npm run test:m15 → PASS
npm run docs:check-links → PASS
npm run docs:build → PASS
exact Essentials v21.1 local → PASS
```

The concrete nested termination budgets are now mechanically guarded as `Runner 100 ms < Main 250 ms < Hostra 1000 ms`。The document bootstrap route is GET-only, and qualification cleanup uses bounded SIGTERM wait followed by a bounded SIGKILL fallback。

Observed historical real-host evidence：

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

The frozen Hostra baseline uses catchable POSIX signals for its 1000 ms final-window grace path，while its own upstream signal test is skipped on Windows。Historical hosted Ubuntu qualification supplied the required `window.closed` / `host.shuttingDown` / SIGTERM ordering and terminal cleanup evidence。

The workflow checks out the exact frozen Hostra commit and sets `HOSTRA_SOURCE_DIR`；it does not install a moving Hostra version or patch Hostra runtime source。[M15 run 37449945940](https://github.com/lithdoo/loom-realm/actions/runs/37449945940) is previous-subject evidence for `488f8713a23158e736153677ec68e449879a8a1d` only。[M15 run 34998417264](https://github.com/lithdoo/loom-realm/actions/runs/34998417264) is historical evidence only for subject `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f`。The older [M15 run 34621764146](https://github.com/lithdoo/loom-realm/actions/runs/34621764146) likewise proves only `fd1df5872d4310e268857e700a067f4e0b9e75d1`；none may be promoted to the current subject.

---

## 11. Formal Closure Rule

M15 may be changed to **Closed** only when this record identifies one current LoomRealm implementation / qualification-input subject and records：

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
M15 Hostra implementation            complete / current hosted PR-delta PASS
M15 canonical aggregate              PENDING on current subject
formal M15 milestone                 Requalification Pending
```

No further architecture/design pass is authorized merely by the current requalification gap。Keep the correct current implementation and frozen latency gates；run the unique current-subject canonical aggregate before promoting M15 to Closed, and record a separate follow-up design before attempting backing canvas, dynamic retained margins, a new scheduler, or any other optimization outside the frozen refactor scope。
