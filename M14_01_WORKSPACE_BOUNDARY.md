# M14 / 01 — Workspace and Game Ownership Boundary

> 状态：**Implemented / contract frozen; formal requalification pending**
> Closure authority：formal M14 status and current qualification evidence live only in `doc/30-implementation/m14-qualification.md`. This file freezes the implemented workspace/package boundary; it does not independently claim milestone closure.

## Objective

先把 repository ownership 和 package-resolution boundary 落到文件系统/npm workspace，再实现 map。M14 不允许继续把业务库放进 framework `packages/`。

目标结构：

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries
examples/      concrete games, private
apps/          platform hosts
tools/         development/import/compatibility tooling
```

## 1. Required workspace change

Root `workspaces` adds：

```text
game-libs/*
examples/*
```

Required shape：

```json
{
  "workspaces": [
    "packages/*",
    "game-libs/*",
    "apps/*",
    "examples/*"
  ]
}
```

`tools/*` remains tooling ownership, not a runtime workspace category.

## 2. Package identity

```text
packages/*   → @loomrealm/*
game-libs/*  → @loomrealm-game/*
examples/*   → private, not publishable
```

M14 map package：

```text
game-libs/map
@loomrealm-game/map
```

`@loomrealm/map` is forbidden.

## 3. Map package external seams

The reusable package must be consumable without a caller knowing its `dist/` filesystem layout.

Required package-level seams：

```text
@loomrealm-game/map
    Runtime root module
    default export = SubsystemDefinitionFactory for the map Definition

@loomrealm-game/map/browser/map.browser.js
    classic-script presentation artifact

@loomrealm-game/map/browser/map.css
    presentation CSS artifact
```

Conceptual `exports` shape：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./browser/map.browser.js": "./dist/browser/map.browser.js",
    "./browser/map.css": "./dist/browser/map.css"
  }
}
```

The exact package metadata order is not normative, but these resolvable subpaths are. Example/preparation tooling MUST resolve the package artifacts through package metadata/subpaths rather than hard-code `node_modules/@loomrealm-game/map/dist/...` or reach into `game-libs/map/browser/...` source.

The browser JS/CSS subpaths are artifact-discovery seams, not a new JavaScript presentation SDK. `map.browser.js` remains a classic script as frozen by M14/02.

`files`/pack output must include `dist/` so all three seams survive `npm pack`.

## 4. Dependency direction

```text
examples → game-libs → public LoomRealm author APIs
```

For M14 Runtime code, `@loomrealm-game/map` has one LoomRealm runtime dependency：

```text
@loomrealm/subsystem
```

It MUST NOT add direct Runtime dependencies on Renderer/Main/Platform/Data/Wire/FSDB/tooling merely because those packages exist transitively elsewhere.

Browser presentation source is standalone classic browser code and does not import Runtime/core package modules at execution time.

Framework/runtime packages never depend on game libraries/examples.

## 5. Concrete example package boundary

`examples/essentials-v21.1/package.json` MUST contain：

```text
private = true
type = module
```

It may depend on `@loomrealm-game/map` and existing framework packages needed by its test/dev composition, but it does not become a published game SDK or Host package.

The example's exact `game.json`, `presentation.json` and page CSS are frozen by M14/03.

## 6. Script hygiene

Adding workspaces changes the expansion of existing `--workspaces` convenience scripts. M14 implementation MUST review each such script before changing root workspaces.

Canonical milestone gates MUST NOT depend on ambiguous workspace expansion; M14's new build/test/pack commands should use explicit workspace/package targets where milestone meaning matters.

Existing M10–M13 canonical gates must retain their previous meaning after workspace expansion. Do not rename/rewrite historical gates merely for cosmetic script cleanup.

Allowed minimal separation：

```text
existing framework/package gates
game-lib build/test
example qualification
repository-wide convenience command
```

No workspace orchestration framework.

## 7. Pack qualification

M14 package qualification must resolve and verify：

```text
import("@loomrealm-game/map")
    → Runtime root / default map Definition factory

package subpath resolution:
    @loomrealm-game/map/browser/map.browser.js
    @loomrealm-game/map/browser/map.css
```

and `npm pack --dry-run` must include the corresponding `dist` files.

The test does not execute the browser artifact in Node; execution is qualified through the M13 Chromium bootstrap.

## Closure

This boundary is implemented and frozen. Formal M14 closure is nevertheless governed by the current qualification subject recorded in `doc/30-implementation/m14-qualification.md`.

- `game-libs/*` and `examples/*` are real workspaces;
- package identity follows ADR 0032;
- map Runtime root and browser artifact subpaths are resolvable without physical-layout reach-through;
- map Runtime dependency graph points only to public author APIs;
- example is private;
- framework graph has no reverse dependency;
- existing M13 gate semantics do not change due to workspace expansion;
- no package/asset registry or workspace orchestration framework is introduced.
