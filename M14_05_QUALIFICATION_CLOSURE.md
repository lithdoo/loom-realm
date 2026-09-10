# M14 / 05 — Qualification Closure

> 状态：**Closure contract frozen; formal requalification pending**
> Evidence authority：`doc/30-implementation/m14-qualification.md` is the single source of truth for the current qualification subject, run IDs, local evidence and formal M14 status. This file defines the gate; it does not mirror live PASS checkmarks.

## 1. Closure unit

M14 closes only when one qualification subject has all required evidence：

```text
one qualification subject
+
hosted npm run test:m14 / Node 20 PASS
+
hosted npm run test:m14 / Node 24 PASS
+
exact v21.1 local npm run test:m14:essentials-local PASS
```

A **qualification subject** is the Git commit whose M14 executable behavior and qualification inputs are being tested. It includes behavior-affecting Runtime/importer/browser artifacts plus the tests, harness, fixtures, workflow and prepared-content configuration that determine the qualification result.

Evidence may be recorded by a later docs-only commit without changing the subject. This avoids making the act of writing a run ID invalidate the evidence it records.

A later commit creates a new qualification subject when it changes M14 behavior or qualification inputs, including any of：

```text
map Runtime / browser artifact
consumer projection / importer behavior
GameEntry or prepared Content behavior
canonical fixture or exact-local selection semantics
M14 tests / harness
M14 workflow or execution configuration
M10–M13 behavior consumed by this vertical
```

Pure documentation corrections that only record or explain already-observed evidence do not create a new qualification subject.

## 2. Canonical commands

```text
npm run test:m14
npm run test:m14:essentials-local -- --source <path-to-exact-v21.1-root>
```

`test:m14` is the CI-safe synthetic + real Chromium qualification. `test:m14:essentials-local` is the exact Pokémon Essentials v21.1 corpus qualification.

Both must exercise the same concrete M14 game/map library/browser implementation. They must not introduce a second test-only business Runtime.

Exact-local additionally must use the canonical M10 input path and Desktop FSDB-backed ContentClient；direct listener-handler calls or ad-hoc filesystem/text clients do not qualify.

## 3. Functional qualification

The current subject must prove all of the following：

1. checked-in `game.json` is parsed/validated through the existing Game Package seam；
2. Main launches `subsystemKey = "map"`；
3. map Runtime reads `struct.Map` and `struct.Tileset` through ContentClient；
4. a real projected RGSS Table non-zero coordinate participates through the frozen accessor/index convention；
5. a real Tileset or Character resource is read through `resource.Graphics` and its MIME/contentVersion come from the Content seam；
6. directional input enters through RendererInputSource → M10 → Frame-bound InputListener；
7. passable movement changes authoritative position；blocked movement preserves x/y while updating facing according to the frozen rule；
8. exactly one opaque SDK-owned RenderDomain publishes current full state；qualification never depends on its wire-id spelling；
9. checked-in presentation config reaches the existing M13 bootstrap/projector path；
10. `lr-map-view` and `lr-map-sprite` exist in real Chromium and ordinary movement preserves their live HTMLElement identities；
11. private Canvas/sprite pixels come from real resource bytes rather than CSS placeholders；
12. full-state repaint removes stale pixels；
13. delayed same-resource completion cannot overwrite newer render data；
14. foreign pre-existing `lr-map-view` / `lr-map-sprite` definitions fail closed；
15. projected Table validation rejects fields outside `dimensions/xSize/ySize/zSize/values`；
16. renderer-internal qualification access is guarded by explicit path allowlist rather than source-text matching.

## 4. Passability branch evidence

Unit qualification independently locks：

```text
down  passage bit 0x01
left  passage bit 0x02
right passage bit 0x04
up    passage bit 0x08
0x0f all-block
higher-layer priority fall-through
priority 0 short-circuit
source-direction block
target reverse-entry block
out-of-bounds block
```

The canonical synthetic fixture must still prove one allowed movement and one blocked movement from persisted Map/Tileset facts. No `blocked`/`walkable` shortcut or derived collision bitmap is accepted as source truth.

## 5. Synthetic CI fixture

The repository-owned fixture must contain enough semantic facts to lock the algorithm, not merely make a demo move：

- three Table layers and a known non-zero coordinate tile；
- static standard-tile range used by the first slice；
- one deterministic passable target and one deterministic blocked target；
- passages and priorities；
- exact author-owned character and tileset PNGs；
- first-frame expected tile/pixel evidence；
- deterministic expected world/camera/screen state before and after movement.

Third-party Essentials assets do not enter repository CI.

## 6. Exact v21.1 local qualification

### Invocation

```text
npm run test:m14:essentials-local -- --source <path-to-exact-v21.1-root>
```

Environment fallback is allowed：

```text
LOOMREALM_M14_ESSENTIALS_SOURCE=<path>
```

CLI `--source` takes precedence.

### Exact-source requirement

The source tree must identify：

```text
Pokemon Essentials
Version 21.1
19 Jul 2023
```

Qualification must not patch the source tree, rewrite `Data/*.rxdata`, bypass consumer projection to consume Ruby objects, or substitute unrelated PNGs while claiming exact-v21.1 evidence.

Generated local material stays under ignored deterministic work paths such as `.local/` / `.m14-local/` and never modifies the source tree.

### Minimum evidence

The selected exact slice must reach the same production implementation far enough to prove：

```text
existing importer/lossless decode
→ selective M14 consumer projection
→ prepared FSDB
→ Desktop FSDB HTTP Content service
→ bound Subsystem ContentClient
→ @loomrealm-game/map Runtime
→ RendererInputSource / M10 input path
→ M13 Chromium presentation
→ real regular source tile + real player sprite
```

The exact-local path does not need to reproduce both synthetic passability branches；CI owns deterministic branch coverage.

## 7. Hosted Node coverage

Hosted qualification must cover at least：

```text
Node 20
Node 24
```

M13 exposed a Node-version-sensitive delayed-convergence risk, so M14 must not silently collapse to one hosted Node version.

If a hosted run becomes anomalously slow, retain bounded watchdog/phase timing and locate the concrete asynchronous phase first. Do not promote one timing incident into a profiler/framework abstraction without repeated evidence.

## 8. Browser/bootstrap evidence

Real Chromium qualification must prove：

```text
customElements.get("lr-map-view") exists
customElements.get("lr-map-sprite") exists
document.querySelector("lr-map-view") hits the authoritative map element
player is the M13-managed light-DOM child of map-view
map Canvas contains real non-transparent resource pixels
player contains real visible sprite pixels or equivalent pixel evidence
computed outer page CSS satisfies the fixed 640×480 contract
```

Global example CSS owns only page/window placement. It must not become a second map semantic layout authority.

## 9. Failure model

M14 creates no new Error hierarchy. Failures continue through existing boundaries：

```text
import/projection contradiction      → tool failure
invalid GameEntry                    → package validation failure
Content mismatch                     → existing Content error
runtime data contradiction           → subsystem failure
unknown/foreign presentation tag     → M13/bootstrap preflight failure
resource currentness mismatch        → PresentationResourceClient failure
browser qualification timeout        → qualification failure
```

Tests should assert the existing externally visible failure class/code/effect instead of inventing a parallel taxonomy.

## 10. What formal M14 closure does not claim

Even after formal reclosure, M14 does not claim completion of：

```text
Desktop Host / Hostra Node child
Electron BrowserWindow physical composition
DOM physical input
reload / reconnect / shutdown
PWA WorkerRunner or offline/install
full Essentials gameplay
events / interpreter / battle / audio
responsive viewport
full autotile support
```

Those remain later milestones.

## 11. Frozen implementation prerequisites

These are implementation/design prerequisites, not live evidence flags：

- `game-libs/map` and the private concrete example exist as independent workspaces；
- Consumer Projection supplies only the first-slice selective records and exact projected Table shape；
- map Runtime consumes public author seams only and keeps the gameplay Frame intentionally long-lived；
- directional input, passability, camera, static-tile mapping and full Render state are deterministic；
- one opaque RenderDomain and exactly two map-owned Custom Elements implement the vertical；
- classic browser artifact, map CSS and example page CSS preserve M13 ownership boundaries；
- package root does not expose implementation-only helpers such as `tableAt` as author API；
- exact-local uses RendererInputSource/M10 and Desktop FSDB-backed bound ContentClient；
- foreign Custom Element conflicts and malformed projected Tables fail closed；
- no Workspace/Plugin/Game/Resource Manager, second test Runtime or M10–M13 contract rewrite was introduced to make the example pass.

## 12. Formal closure decision

Never infer `Closed` from implementation completion alone. The decision procedure is：

```text
implementation prerequisites satisfied
AND
qualification record names one subject
AND
Node 20 hosted PASS targets that subject
AND
Node 24 hosted PASS targets that subject
AND
exact v21.1 local PASS targets that subject
→ M14 Closed

otherwise
→ implementation may be complete, but formal qualification remains pending
```

The final M14 value remains：

> A real consumer entered LoomRealm through the existing M10–M13 seams without forcing the framework to grow a second machinery path.
