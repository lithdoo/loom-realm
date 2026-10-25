# Game Control Ports v1 Qualification

> 状态：**Implemented / Qualified / Frozen**
> 日期：2026-10-25
> Executable / qualification-input subject：`5017fde181f8c8f3abe2b0c6d65edb2d6e4bced1`
> Frozen contract deviations：**None**

本记录验证 [Game Control Ports](../10-architecture/game-control-ports.md)、[RPGMap Control Port v1](../20-modules/loom-map/control-port-v1.md) 和 product-private `base + map` composition。后续 docs-only evidence commit 不改变上述 executable subject。

## Environment

```text
OS       Microsoft Windows NT 10.0.26300
Node     v24.19.0
npm      11.17.0
Browser  repository Playwright Chromium launcher seam
```

## Exact closed loops

`test/game-control-ports-v1/qualification.test.mjs` 在真实 Chromium/PWA Worker topology 中证明：

```text
trusted Browser ArrowRight
→ product-private <game-controls-input>
→ broadcast:"top-frame"
→ activation-scoped ControlsConsumer
→ DirectionalControlsTracker
→ RPGMapControls.setMoveIntent(...)
→ observable Map movement
```

以及：

```text
trusted Browser KeyZ
→ unified controls event
→ product Dialogue composition
→ dialogue.controls.confirm()
→ Render Event / Web Presentation
→ submit
→ Conversation completed result
```

## Commands and results

在上述 executable subject 的实现与 qualification inputs 上执行：

```text
npm run test:game-control-ports:qualification
PASS
  Node composition lifecycle 1/1
  real Chromium closed loops 2/2

npm run test:rpgmap:v1
PASS
  @loomrealm-game/map 109/109
  Essentials topology 3/3; live terrain 3/3
  M14 vertical 3/3
  M15 Desktop 14/14; Hostra 17/17
  Map/browser/import regression 85/85
  blocked retained intent has no automatic/timer/refresh/same-value retry

npm run test:m17 -w @loomrealm/pwa
PASS
  unit 40/40
  Chromium 17/17
  PokeMan movement, collision, transfers and session restart included

npm run build:staging -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging
PASS 1/1 PokeMan staging closed loop

npm test -w @loomrealm-example/pokeman
PASS 17/17

npm run test:game-controls-input:qualification
PASS
  common-controls 30/30
  precise unified-controls qualification 9/9
  frame-targeted core/integration 50/50
  Desktop Hostra top-frame 1/1
  PWA top-frame 1/1
  docs links/build PASS
```

Clean generated-state verification moved the existing generated directories out of the workspace and confirmed all four paths absent. The generic PWA shell then built while Map and Dialogue `dist` were still absent:

```text
npm run build -w @loomrealm/pwa
npm run build:qualification -w @loomrealm/pwa
npm run test:m17 -w @loomrealm/pwa
npm run build:staging -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging
npm run build:m14
npm run test:m14:pr
npm run build:m15
npm run test:m15:pr
npm run build:m17
npm run test:rpg-dialogue-v1:qualification
npm run test:game-control-ports:qualification
```

All passed without a Map-local `prebuild`. The standalone generic PWA build no longer loads the PokeMan staging fixture; staging imports that product dependency only inside its own lifecycle. `build:m14`, inherited `build:m15`, `build:m17`, and `@loomrealm/pwa build:qualification` build common-controls before affected Map/example/PWA work.

## Product and ABI evidence

- `@loomrealm-game/common-controls` package-root runtime ABI remains exact; Consumer/Tracker are available only from `@loomrealm-game/common-controls/subsystem`.
- Common Controls has no Map/Dialogue dependency; Map has no common-controls dependency and owns no physical/unified input subscription or producer root.
- Dialogue owns no Keyboard/Gamepad/unified controls mapping.
- Essentials Desktop, PokeMan Desktop, and PokeMan PWA use `base + map`; Base owns the sole producer and Map owns the activation-local Consumer/Tracker.
- PokeMan PWA installs exactly `subsystems/base.mjs` and `subsystems/map.mjs`; both executable contents contribute to bundle identity.
- PokeMan restart creates fresh Base/Map activations with one producer and no stale retained controls.
- A lightweight Node lifecycle test proves teardown neutralization, reset/close, an inert old Activation, a neutral replacement Activation, State-based held-truth recovery, and no Event replay.
- Consumer Frame validation is structural across realms/adapters while malformed signals still fail closed.
- Map retained-intent scheduling is centralized at the four contract-defined boundaries; blocked movement still has no automatic retry path.
- No `@loomrealm-game/control-bindings` package was introduced.

No remaining qualification item is BLOCKED for this subject.
