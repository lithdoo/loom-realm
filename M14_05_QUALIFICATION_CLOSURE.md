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
M14 consumer-projection tests using distributable fixture
concrete example Game Entry validation/startup test
prepared Content assembly test
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
map runtime reads map content through ContentClient
map runtime receives JsonValue FSDB records, not RPG/RMXP decoder objects
map runtime does not consume RmxpObject/RubyString/$id/$ref/$typed importer wrappers
M13/M12 physical credentials/paths do not leak into game business state
Essentials importer does not own map browser JS/CSS packaging
example/test preparation does not parse PBS/Marshal/RMXP source
```

## Data-shape evidence

必须证明 preparation chain：

```text
Ruby/Marshal/RMXP source mechanics
→ importer internal typed/object-graph representation
→ JSON-compatible semantic materialization
→ FSDB Map/Tileset/MapInfo/... records + resources
→ M12 ContentClient
→ @loomrealm-game/map JsonValue consumer
```

第一版不定义独立 `MapNormalizedV1` 或 `MapBundle`。

这里的语义/表示边界固定为：

```text
RMXP/Essentials
    semantic authority

FSDB JSON record
    persisted/runtime representation

ContentClient.record()
    Runtime access boundary
```

`RPG::Map`、`RPG::Tileset`、`RPG::Event`、RGSS `Table` 等名称用于定义 FSDB record 的字段含义和关系来源，不表示 map runtime 接收对应 decoder class/object。

FSDB JSON records 必须移除 Ruby object graph/serialization mechanics，并能作为普通 `JsonValue` 被 M12 Content API 返回。

M14 consumer projection 的机械规则必须按 `tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md` 自动验证，至少包括：

```text
known RPG @ivar → strip one leading @ and preserve remaining spelling
RubyString/RubySymbol → JSON string
Ruby Array → JSON array
RGSS Table → { dimensions, xSize, ySize, zSize, values:number[] }
Map.events stays embedded and uses decimal event-id JSON object keys
no kind/className/rubyObjectId/$id/$ref/$typed in consumer records
```

M14-required source fact若无法无歧义投影成 JsonValue，preparation 必须 fail closed；不得通过 generic wrapper把问题推给 Runtime。

至少覆盖 M14 vertical 实际需要的语义：

```text
RPG::Map-compatible map facts
RPG::Tileset-compatible tileset/passability facts
RPG::MapInfo-compatible map info
Essentials MapMetadata / connections when used
RPG::Event / Page / EventCommand semantics when used
RGSS Table tile-data semantics
```

第一版不得为了 Event 表型拆分引入 `ContentClient.group()`。

## Concrete Game Entry evidence

M14 必须证明 `examples/essentials-v21.1` 是真实 concrete game，而不只是 fixture directory：

```text
examples/essentials-v21.1/game.json
→ parseGameEntryV1 / validateGameEntryV1
→ validated subsystem topology + initial target/input
→ test-owned physical Definition binding
→ existing Main
→ initial Frame
```

测试不得绕过 Game Package validation 后直接硬编码 logical topology。

第一条 vertical可以使用 example initial input中的 `mapId/x/y` 作为 player spawn；完整 `RPG::System` startup compatibility不是 M14 closure prerequisite。

## Prepared Content assembly evidence

必须证明 qualification 只使用一个 assembled prepared Content view：

```text
importer-produced FSDB or CI-safe semantic fixture
+
@loomrealm-game/map browser JS/CSS build
+
example WebPresentationConfig logical refs
→ example/test preparation
→ one prepared Content view
```

该 preparation 只做 composition/materialization；不得成为 Runtime dependency、production Host、第二个 map adapter 或 generic GamePackager/ContentBuilder framework。

## Functional evidence

至少证明：

```text
FSDB Map/Tileset JSON record load via ContentClient
real Content resource use
player spawn from validated example initial input
Input movement
RenderDomain initial/update state
map-owned WC projection
same live identity reuse across ordinary update
visible movement result
```

至少一个 tileset 或 player sprite 必须走：

```text
semantic record-derived namespace/key
→ map runtime ContentClient.resource(namespace, key)
→ returned contentVersion
→ Render data namespace/key/contentVersion
→ PresentationResourceClient
→ browser bytes
```

Runtime 获得的 raw bytes不得进入 Render payload。M14 不新增 resource metadata/HEAD author API；允许 Runtime 与 Renderer各读取一次同一 resource。只有真实 M14 performance evidence才能支持后续最小 reopen M12。

不得复制 M10–M13 全量 conformance；M14 验证真实 consumer integration。

## Presentation bootstrap evidence

必须证明：

```text
@loomrealm-game/map browser JS/CSS
→ assembled prepared Content
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
CI-safe synthetic/author-owned FSDB JSON fixture qualification
local exact-v21.1 corpus importer → M14 consumer projection → FSDB JSON compatibility qualification
```

CI fixture 的字段语义必须与同一 M14 RMXP/Essentials-compatible FSDB Content model 对齐；不能构造只在测试里存在的 fake map object model。

local official corpus 不提交、不上传为 repository artifact；记录 source version/fingerprint、FSDB semantic materialization result与必要统计即可。

两条 evidence 必须汇入同一 assembled prepared Content → `ContentClient` → map runtime → browser consumer path。

现有 importer RC 仍然有效，但不得把它误写成 M14 consumer projection 已完成：

```text
existing importer RC
!=
Map/{id} / Tileset/{id} Runtime consumer projection closure
```

M14 closure record必须单独记录后者的实现与 qualification。

## Explicit non-claims

M14 Closed 不代表：

```text
Pokémon Essentials v21.1 full gameplay complete
all maps/events semantically complete
universal map schema established
Content group API established
resource metadata API established
full RPG::System startup compatibility established
Desktop BrowserWindow full E2E complete
PWA Runtime/full E2E complete
large-map performance universally solved
```

## Reopen rule

只有真实 map consumer 暴露 correctness/security contradiction、author capability缺口或可测性能失败时，才 reopen M10–M13。目录对称、API美观或未来猜测不是 reopen evidence。
