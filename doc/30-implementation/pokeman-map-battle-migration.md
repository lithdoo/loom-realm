# PokeMan Map / Battle ownership migration

## Baseline and inventory

- LoomRealm migration baseline: `e76f453f`.
- PokeMan migration baseline: `97babf6c`.
- The legacy `examples/PokeMan` tree contained 479 tracked files. Blob/path
  comparison found 472 byte-identical files, seven path/package-name changes,
  no LoomRealm-only product file, and 138 additional PokeMan files.
- Map, Battle, and tile-presentation source trees were byte-identical apart
  from package manifests and test paths needed for the repository boundary.

## Final ownership

PokeMan owns `@pokeman/game-map`, `@pokeman/game-battle`,
`@pokeman/tile-presentation`, game subsystems, FSDB content, browser
presentation, product integration, performance evidence, and PWA qualification.

LoomRealm owns the generic framework and import substrate only. Its public
boundary consists of the `@loomrealm/*` runtime, state, renderer, data,
content, platform, Desktop, and PWA packages, plus the reusable
`@loomrealm-game/common-controls`, `@loomrealm-game/rpg-dialogue`, and
`@loomrealm-game/schema-form` libraries. LoomRealm is the single source of
truth for those libraries. PokeMan consumes them through its pinned LoomRealm
checkout and does not keep source copies. LoomRealm does not import PokeMan or
build any PokeMan product package.

## Removed LoomRealm consumers

- `examples/PokeMan`, `examples/essentials-v21.1`, and the tracked
  `examples/essentials-v21.1-local` consumer shell;
- `game-libs/map`, `game-libs/battle`, and `game-libs/tile-presentation`;
- product-specific Map/Battle browser, Desktop, PWA, Hostra, performance, and
  terrain qualification tests;
- Map/Battle capability jobs, impact outputs, build aliases, and staging build
  ownership.

The ignored local `[FSDB]Essentials v21.1` importer output is deliberately
preserved on developer machines. Generic PBS, RMXP, Marshal, FSDB, and
Essentials parsing/import tests remain in LoomRealm.

## Product verification owner

PokeMan's root scripts build the three owned packages and run Map, Battle,
story/dialogue, browser, PWA, and settlement integration tests. Its staging
workflow calls LoomRealm's generic PWA bundle runner with a PokeMan-owned test
file; no product fixture or product test is resolved from LoomRealm.
