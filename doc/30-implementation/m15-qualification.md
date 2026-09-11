# M15 Desktop Full E2E Qualification Record

## Status

**Physical recomposition in progress / previous standalone Electron evidence retained as historical / formal M15 closure pending.**

The previous M15 implementation successfully qualified a direct-Electron LoomRealm Desktop composition, but that physical subject is no longer canonical after the Hostra recomposition decision. Current physical implementation and closure requirements are owned by `M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md` and the updated M15/01–M15/05 documents。

Formal M15 closure now requires：

```text
M14 formally Closed
+ pinned Hostra identity recorded
+ Hostra-owned npm run test:m15 PASS in supported CI
+ Hostra-owned full Desktop E2E/lifecycle evidence PASS
→ M15 Closed
```

---

## 1. Current Qualification Subject

The next qualifying M15 subject is the first landed tree that contains the complete Hostra-owned recomposition：

```text
pinned Hostra
→ HOSTRA_SUBCMD LoomRealm Desktop plain Node process
→ Hostra RPC Window lifecycle
→ Hostra-owned BrowserWindow
→ LoomRealm Control/Data/Content physical services
→ existing Main/RuntimeHosting/Runner
→ existing M13 presentation
→ same M14 game
```

Record the exact commit SHA and pinned Hostra version/source identity after that implementation lands。Any later change to M15 physical behavior、Hostra pin、qualification harness/workflow or consumed M10–M14 behavior creates a new qualification subject。

The previous direct-Electron implementation is not the current qualification subject。

---

## 2. Required Current Evidence

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing milestone prerequisite | current `npm run test:m14` on same tree | **required** |
| Formal M14 prerequisite | `m14-qualification.md` status `Closed` | **PENDING** |
| M15 boundary/build | no direct LoomRealm Electron ownership + Hostra boundary checks | **PENDING RECOMPOSITION** |
| Real Hostra vertical | pinned Hostra → HOSTRA_SUBCMD LoomRealm → Hostra-owned Window | **PENDING RECOMPOSITION** |
| Input/reload/reconnect/lifecycle | production Hostra Window path | **PENDING RECOMPOSITION** |
| Canonical aggregate | `npm run test:m15` | **PENDING RECOMPOSITION** |
| Hosted qualification | dedicated M15 workflow, same qualification subject | **PENDING RECOMPOSITION** |
| Formal M15 closure | all rows above PASS for one subject | **PENDING** |

`getHostState/getAllWindows` may be used by qualification to observe that the Window is actually Hostra-owned；they are not production startup authority/currentness mechanisms。

---

## 3. Historical Standalone Electron Evidence — 2026-09-11

The following evidence remains useful as regression/migration evidence for LoomRealm internals, but **does not satisfy final Hostra-owned M15 closure**。

Historical environment：

```text
Windows
Node 22.12.0
npm 10.9.0
Electron 44.3.0
```

Historical `npm run test:m15` completed successfully in 167.7 seconds and exercised：

```text
checked-in deterministic M14 fixture
real direct Electron BrowserWindow
trusted ArrowRight movement + blocking
synthetic keyboard rejection
fresh-document reload projection
same-generation Data reconnect
post-bootstrap fetch/WebSocket replacement resistance
normal direct-Electron application shutdown
Pointer/Gamepad producer behavior
```

Observed historical lifecycle evidence included：

```text
Renderer replacement:
    distinct Renderer identities across reload

Data reconnect:
    physical pair retirement
    → fresh prepare / prepared / current
    → unchanged subsystem generation/data profile
    → presentation/input resume

Shutdown:
    BrowserWindow close
    → Main settled
    → Renderer Control closed
    → Data Broker closed
    → Content service closed
    → Runner PID absent
    → former Content loopback port refused connections
```

This evidence demonstrates that M10–M14 seams and the Desktop adapters worked in a real Chromium/Electron environment。It is a migration oracle only because LoomRealm itself owned Electron/BrowserWindow in that subject。

---

## 4. Historical Exact-source Evidence — 2026-09-11

The previous direct-Electron exact-source gate consumed the actual third-party source corpus without checking those bytes into the repository：

```text
command: npm run test:m15:essentials-local -- .local/m14-essentials/source.zip
source fingerprint: sha256:da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665
source identity: Maruno17/pokemon-essentials@ea7b5d56d2436591160983c4e641a2ceee2d875a
physical objects classified: 7,677 / 7,677
FSDB validation: PASS
selection: Map 47, spawn (35,21), character trainer_POKEMONTRAINER_Red
viewport: 640x480
non-black map pixels: PASS
real player sprite pixels: PASS
trusted ArrowRight changed the player direction frame: PASS
```

The product executes the frozen `@loomrealm-game/map` TypeScript business implementation。Essentials Ruby scripts are imported/classified source material and are not executed by the Node Runner。

This exact-source evidence remains relevant to M14/content compatibility, but final M15 product closure must re-establish the required visible/gameplay evidence through the Hostra-owned Window path。

---

## 5. Current Boundary Evidence Required

The new M15 subject must mechanically prove：

```text
Hostra is actual Electron/BrowserWindow owner
LoomRealm Desktop is actual HOSTRA_SUBCMD Node child
apps/desktop production source does not import Electron
apps/desktop does not create BrowserWindow or own app.quit
Hostra source/runtime is not patched for LoomRealm
Hostra RPC carries only Window/lifecycle operations
Hostra types do not leak into platform-ports/Main/Renderer/game packages
Renderer Control uses LoomRealm loopback physical carrier
Data settlement is separate from Data application
M9 Broker remains sole Data candidate/current owner
Content/M13/M14 logical paths remain unchanged
business code does not require Hostra ambient electronAPI
no generic Hostra/Window/Document/Connection/Recovery abstraction appears only for E2E
```

Capability separation does not require a generic transport/server framework；small concrete adapters/listeners are preferred。

---

## 6. Current Runtime Evidence Required

The Hostra-owned vertical must directly observe：

```text
startup:
    pinned Hostra ready
    → Hostra starts LoomRealm HOSTRA_SUBCMD
    → LoomRealm PREPARE/Main/Runner ready
    → Hostra RPC openWindow
    → Hostra-owned page displays canonical M14 map

input:
    trusted ArrowRight
    → same M10 path
    → (10,8) → (11,8)
    → second Right blocked

reload:
    same Hostra windowId
    → fresh Renderer identity
    → unchanged Main/Runner/Subsystem generation/game state
    → fresh Control/Data/Content document material
    → current projection/input resumes

reconnect:
    same-generation physical Data loss
    → DataAuthority retained
    → existing Broker fresh pair/current
    → fresh Renderer acquire
    → presentation resumes

shutdown/failure:
    user Hostra Window close
    programmatic closeWindow
    Main/Runner fatal
    Hostra RPC terminal/host shutdown
    → one LoomRealm cancellation owner chain
    → finally-like Control/Data/Content cleanup
    → no orphan Runner/LoomRealm child/listener/socket
```

Hostra CDP may be used for observation and Playwright input。CDP is test observation only, never LoomRealm production communication。

---

## 7. Canonical Gate

The unique closure command remains：

```text
npm run test:m15
```

Final composition must be：

```text
npm run test:m14
→ M15 boundary/build checks
→ pinned Hostra full E2E
→ input/reload/reconnect/lifecycle evidence
```

The old standalone Electron gate may remain temporarily during migration, but once the Hostra vertical is qualified it must no longer be the canonical M15 closure owner。

---

## 8. Formal Closure Rule

M15 may be changed to **Closed** only when this record identifies one current Hostra recomposition qualification subject and records：

```text
M14 = formally Closed
+ exact pinned Hostra identity
+ local/current npm run test:m15 = PASS
+ hosted npm run test:m15 = PASS
+ Hostra-owned E2E/lifecycle evidence = PASS
→ M15 Closed
```

Until then the precise state is：

```text
M10–M14 logical/business contracts   frozen
historical standalone Electron M15   implemented + locally qualified
M15 Hostra physical composition      recomposition pending
formal M15 milestone                 pending
```
