# M15 Desktop Full E2E Qualification Record

## Status

**Implementation complete / locally qualified / hosted qualification pending.**

M15 product composition is implemented against the frozen M15/01–M15/05 design. Formal closure is not claimed here: it requires a repeatable hosted Node 24 `npm run test:m15` PASS and formal M14 closure (whose own workflow separately qualifies Node 20 and Node 24).

## Qualification subject

The qualification subject is the commit that first contains the complete M15 implementation, canonical checked-in Hostra installation, boundary gate, Electron E2E and dedicated workflow. Record its commit hash after the implementation lands; any later change to these inputs creates a new subject.

## Required evidence

| Gate | Evidence | Status |
| --- | --- | --- |
| Existing milestone prerequisite | `npm run test:m14` on the same tree | **PASS locally** |
| M15 boundary and producer input | `npm run test:m15:desktop` | **PASS locally (8/8)** |
| Real Electron vertical | `npm run test:m15:electron` | **PASS locally (2/2)** |
| Canonical aggregate | `npm run test:m15` | **PASS locally** |
| Exact Essentials v21.1 Electron source | `npm run test:m15:essentials-local -- <source>` | **PASS locally** |
| Hosted Node 24 | dedicated M15 workflow, same subject | **PENDING** |
| Formal M14 prerequisite | `m14-qualification.md` status `Closed` | **PENDING** |
| Formal M15 closure | all rows above PASS for one subject | **PENDING** |

## Local evidence — 2026-09-11

Environment:

```text
Windows
Node 22.12.0
npm 10.9.0
Electron 44.3.0
```

`npm run test:m15` completed successfully in 167.7 seconds. Because that aggregate begins with the unchanged `npm run test:m14`, the result covers the complete historical M10–M14 qualification chain, package regression/build/pack checks, real Chromium M14 projection, M15 boundary/input evidence and the real Electron lifecycle vertical on one working tree.

The Electron vertical observed the canonical map, trusted ArrowRight movement and blocking, rejection of synthetic keyboard input, fresh-document reload projection, same-generation Data reconnect after deterministic physical socket loss, resistance to post-bootstrap `fetch`/`WebSocket` replacement and normal application shutdown. The producer test additionally covers synthetic Pointer rejection, chorded pointer transitions, standard Gamepad threshold transitions, fresh local Gamepad identity and focus/visibility unavailability.

The strengthened M15 physical evidence directly observes:

```text
Renderer replacement:
    two distinct hashed Renderer identities across reload

Data reconnect:
    current candidate retirement caused by deterministic physical socket destruction
    → fresh candidate prepare / prepared / current
    → unchanged subsystem generation and data profile
    → presentation and trusted keyboard input resume

Browser input producer:
    production createDesktopRendererInputSource running inside Electron Chromium
    → OS-trusted Pointer primary/secondary chord on Windows (Playwright trusted pointer on hosted Linux)
    → synthetic Pointer rejected
    → standard Gamepad polling/threshold/fresh reconnect identity
    → unavailable → fresh State baseline → available lifecycle ordering

Shutdown:
    ordinary BrowserWindow close
    → Main settled
    → Renderer Control closed
    → Data Broker closed
    → Content service closed
    → product closed
    → captured Hostra Runner PID absent
    → former Content loopback port refuses connections
```

## Exact-source Electron evidence — 2026-09-11

The repository-portable M15 E2E uses the checked-in deterministic M14 fixture. It must not be described as original Essentials artwork. A separate local gate now consumes the actual third-party source corpus without checking those bytes into this repository:

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
screenshot: artifacts/m15-essentials-v21.1-electron.png
local gate duration: 146.3 seconds
```

The product executes the frozen `@loomrealm-game/map` TypeScript business implementation. The Essentials v21.1 Ruby scripts are imported and classified as source material but are not executed by the Node Hostra Runner; claiming otherwise would misstate the M14/M15 architecture.

## Implemented qualification surface

The canonical gate owns evidence for the checked-in Hostra-ready Essentials example, Electron `process.execPath` Runner in run-as-node mode, the existing Runtime Control and Desktop Data/Content owners, secure same-origin BrowserWindow composition, isolated one-shot preload handoff, Main-World M13 presentation, trusted DOM input mapping, reload, same-generation Data reconnect, primitive-capture resistance and normal owner-chain shutdown.

The boundary suite mechanically rejects the frozen architectural escapes, including executable selection in the launch manifest, insecure BrowserWindow preferences, generic Electron exposure, CORS/file-origin expansion, renderer-internal imports, application Data over settlement IPC and new generic host/registry/recovery abstractions.

## Formal closure rule

M15 may be changed to **Closed** only after this record identifies one landed qualification subject and records:

```text
M14 = formally Closed
+ local npm run test:m15 = PASS
+ hosted Node 24 npm run test:m15 = PASS
→ M15 Closed
```
