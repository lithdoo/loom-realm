# Essentials v21.1 Controls Composition

> 状态：**Draft / Ready for implementation**
> 范围：`examples/essentials-v21.1` 私有 product composition
> 上游设计：[`game-control-ports.md`](../../doc/10-architecture/game-control-ports.md)

本文件只定义 Essentials example 的 controls landing。它不是 Framework / game-library contract。

## Target topology

当前 Map-only gameplay 改为：

```text
Game
└─ base
   ├─ RenderDomain
   │  └─ <game-controls-input>
   └─ call("map", initialMapParams)
          ↓
        map Frame
        ├─ ControlsConsumer
        ├─ DirectionalControlsTracker
        └─ RPGMapControls
```

`base` 是 example-private infrastructure Subsystem。它只拥有 unified controls producer，不消费 controls、不知道 Map business Control Port，也不成为新的 Input Authority。

## Exact files

```text
game.json
    initial.subsystem = "base"
    subsystems = ["base", "map"]

launch.hostra.json
    base -> subsystems/base.mjs
    map  -> subsystems/map.mjs

subsystems/base.mjs
    create one RenderDomain containing one game-controls-input
    call map with frame.params
    close producer RenderDomain on terminal return

subsystems/map.mjs
    construct RPGMapHandler
    create @loomrealm-game/common-controls/subsystem Consumer/Tracker
    map ControlsDirection -> Direction
    finally setMoveIntent(null) + reset + close
```

Existing `presentation.json` continues to load `Presentation/controls/device-input.browser.js`; no second producer is added.

## Base lifecycle

Canonical shape:

```ts
export default defineSubsystem((scope) => ({
  async frame(frame) {
    const inputHost = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "game-controls-input",
        tag: "game-controls-input",
        attrs: {},
        data: {},
        children: [],
      }],
    });

    try {
      return await frame.call("map", frame.params);
    } finally {
      inputHost.close();
    }
  },
}));
```

Base suspension while Map is active does not destroy/hide its RenderDomain. The producer remains live and `broadcast:"top-frame"` targets the active Map Frame.

## Map controls lifecycle

Map child owns the Activation-local consumer:

```text
Map Activation starts
→ fresh Consumer + Tracker
→ initial neutral
→ controls State/Event updates retained moveIntent

Map Frame terminal
→ setMoveIntent(null)
→ tracker.reset()
→ consumer.close()
```

The Base subsystem MUST NOT subscribe to controls and forward semantic actions to Map.

## Qualification

At minimum prove:

- Game Entry / Hostra registers exactly `base + map`;
- Base owns exactly one `game-controls-input`;
- Map Render Tree no longer owns raw keyboard/gamepad input roots;
- Playwright keyboard -> `game-controls-input` -> top-frame -> Consumer -> Map Control Port -> observable movement;
- teardown leaves no duplicate producer or retained movement intent.
