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
semantic-map materialization tests using distributable fixture
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
map runtime does not consume RmxpObject/RubyString/$id/$ref/$typed importer wrappers
M13/M12 physical credentials/paths do not leak into game business state
```

## Data-shape evidence

必须证明 importer/preparation：

```text
Ruby/Marshal/RMXP source mechanics
→ materialized RMXP/Essentials semantic records
→ M12 Content records/resources
```

第一版不定义独立 `MapNormalizedV1` 或 `MapBundle`。Semantic records 应保留 RMXP/Essentials map meaning，同时移除 Ruby object graph/serialization mechanics。

至少覆盖 M14 vertical 实际需要的：

```text
RPG::Map
RPG::Tileset
RPG::MapInfo
Essentials MapMetadata / connections when used
RPG::Event / Page / EventCommand when used
RGSS Table tile data
```

## Functional evidence

至少证明：

```text
RMXP/Essentials semantic map record load
real Content resource use
player spawn
Input movement
RenderDomain initial/update state
map-owned WC projection
same live identity reuse across ordinary update
visible movement result
```

至少一个 tileset 或 player sprite 必须从 logical resource identity/version 经 Render data 到 `PresentationResourceClient`，不得由 WC direct fetch 或 privileged URL shortcut 获得。

不得复制 M10–M13 全量 conformance；M14 验证真实 consumer integration。

## Presentation bootstrap evidence

必须证明：

```text
@loomrealm-game/map browser JS/CSS
→ prepared Content
→ WebPresentationConfigV1
→ M13 bootstrap
→ customElements registration
→ real map projection
```

测试不得通过直接 import browser entry 或测试代码手工注册 element 来绕过该路径。

## Qualification harness evidence

M14 full vertical 可以使用 test-owned composition harness，但必须：

```text
reuse existing production Main/Subsystem/Data/Renderer/Content roles
reuse existing/synthetic RendererInputSource producer
use real Chromium
create no new production hosting abstraction
```

M14 不 claim Hostra Launcher / Electron BrowserWindow / physical input / reload-shutdown full composition；这些仍属于 M15。

## Essentials compatibility evidence

M14 closure record分开记录：

```text
CI-safe synthetic/author-owned RMXP-compatible semantic fixture qualification
local exact-v21.1 corpus compatibility qualification
```

local official corpus 不提交、不上传为 repository artifact；记录 source version/fingerprint、semantic materialization result与必要统计即可。

两条 evidence 必须汇入同一 map runtime/browser consumer path；CI 不得维护另一套 fake map schema。

## Explicit non-claims

M14 Closed 不代表：

```text
Pokémon Essentials v21.1 full gameplay complete
all maps/events semantically complete
universal map schema established
Desktop BrowserWindow full E2E complete
PWA Runtime/full E2E complete
large-map performance universally solved
```

## Reopen rule

只有真实 map consumer 暴露 correctness/security contradiction、author capability缺口或可测性能失败时，才 reopen M10–M13。目录对称、API美观或未来猜测不是 reopen evidence。
