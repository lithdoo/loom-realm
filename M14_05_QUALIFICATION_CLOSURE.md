# M14 / 05 — Qualification Closure

> 状态：Implementation Landing / M14 Pending

## Closure target

M14 的 future canonical gate：

```text
npm run test:m14
```

在实现该命令并真实通过前，不宣称 M14 Closed。

## Required gate composition

`test:m14` 至少包含：

```text
npm run test:m13
map game-library tests
example preparation/compatibility tests using distributable fixture
real Chromium M14 game vertical
workspace/package boundary checks
@loomrealm-game/map pack/publish dry-run qualification
```

`examples/essentials-v21.1` 必须 private，不做 publish/pack product qualification。

Node 20 / 24 CI 继续作为 canonical matrix。

## Boundary evidence

必须自动证明：

```text
game-libs/map runtime entry does not import renderer/main/platform/tooling
examples are private
packages/* do not depend on game-libs/examples
runtime example does not import tools/fixtures
M13/M12 physical credentials/paths do not leak into game business state
```

## Functional evidence

至少证明：

```text
normalized map data load
real Content resource use
player spawn
Input movement
RenderDomain initial/update state
map-owned WC projection
same live identity reuse across ordinary update
visible movement result
```

不得复制 M10–M13 全量 conformance；M14 验证真实 consumer integration。

## Essentials compatibility evidence

M14 closure record分开记录：

```text
CI-safe synthetic/author-owned fixture qualification
local exact-v21.1 corpus compatibility qualification
```

local official corpus 不提交、不上传为 repository artifact；记录 source version/fingerprint、preparation result与必要统计即可。

## Explicit non-claims

M14 Closed 不代表：

```text
Pokémon Essentials v21.1 full gameplay complete
all maps/events semantically complete
Desktop BrowserWindow full E2E complete
PWA Runtime/full E2E complete
large-map performance universally solved
```

## Reopen rule

只有真实 map consumer 暴露 correctness/security contradiction、author capability缺口或可测性能失败时，才 reopen M10–M13。目录对称、API美观或未来猜测不是 reopen evidence。
