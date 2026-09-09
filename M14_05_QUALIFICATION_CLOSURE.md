# M14 / 05 — Qualification Closure

> 状态：Implementation Landing / M14 Pending

## Closure target

M14 的 canonical CI gate：

```text
npm run test:m14
```

M14 `Closed` 不是仅指 CI fixture green。关闭该 milestone 必须同时满足：

```text
1. npm run test:m14
   → canonical Node 20 / 24 CI matrix green

2. npm run test:m14:essentials-local
   → 对 exact Essentials v21.1 local corpus 完成一次记录化 compatibility qualification
   → 对应同一个 M14 closure revision
```

第二条是 milestone closure evidence，不进入 GitHub Actions，也不使第三方 corpus 成为 repository/CI dependency。在两类 evidence 都真实通过并记录前，不宣称 M14 Closed。

Closure record MUST 绑定：

```text
repository commit SHA
CI M14 qualification result
exact-v21.1 source identity/fingerprint
local consumer-projection result
first-slice semantic vertical result
```

这样后续不能用另一个 revision 的 importer/local result 替当前 M14 implementation 背书。

## Required gate composition

`test:m14` 至少包含：

```text
npm run test:m13
map game-library tests
M14 consumer-projection tests using distributable fixture
concrete example Game Entry validation/startup test
prepared Content assembly test
real Chromium M14 game semantic vertical
workspace/package boundary checks
@loomrealm-game/map pack/publish dry-run qualification
```

`examples/essentials-v21.1` 必须 private，不做 publish/pack product qualification。

Node 20 / 24 CI 继续作为 canonical matrix。

`test:m14:essentials-local` 是 local-only compatibility command。它可以复用现有 importer/acquisition mechanics，但第三方 source/bytes 必须继续位于 ignored/local ownership，不得被提交、上传为 CI artifact 或变成 `test:m14` 的隐式 prerequisite。

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
nil → null
boolean → JSON boolean
safe Integer → JSON number; unsafe required Integer fails closed
finite Float → JSON number; non-finite required Float fails closed
RubyString/RubySymbol → JSON string
Ruby Array → JSON array
RGSS Table → { dimensions, xSize, ySize, zSize, values:number[] }
RGSS Table index(x,y,z) = x + y*xSize + z*xSize*ySize
RGSS Table values.length = xSize*ySize*zSize
Map.events stays embedded and uses decimal event-id JSON object keys
no kind/className/rubyObjectId/$id/$ref/$typed in consumer records
```

Table qualification不能只断言 `values` 是 number array；至少必须使用已知非零坐标样本证明 serialized order、轴顺序与 frozen index rule 一致。

M14-required source fact若无法无歧义投影成 JsonValue，preparation 必须 fail closed；不得通过 generic wrapper把问题推给 Runtime。

至少覆盖 M14 vertical 实际需要的语义：

```text
RPG::Map-compatible map width/height/tile-data facts
RPG::Tileset-compatible resource/passability facts
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

## Functional / semantic evidence

M14 full vertical 至少证明：

```text
FSDB Map/Tileset JSON record load via ContentClient
Map.data is interpreted with the frozen RGSS Table indexing semantics
at least one visible tile is derived from Map.data tile identity + Tileset/resource facts
real Content resource use
player spawn from validated example initial input
Input path reaches map business logic
one passable movement is accepted from persisted map/tileset passability facts
one blocked movement is rejected from persisted map/tileset passability facts
RenderDomain initial/update state reflects authoritative business position
map-owned WC projection
same live identity reuse across ordinary update
visible movement occurs for the passable case and not for the blocked case
```

Qualification 不得用下面的方式获得形式通过：

```text
load Map/Tileset but render a test-local fixed terrain
inject isBlocked/passable conclusions that do not exist in real consumer Content semantics
move player by unconditional x/y increment without consulting implemented passability facts
use a fake CI-only map object model different from the local exact-v21.1 consumer path
```

第一版只要求所选 map slice 实际需要的 RMXP/Essentials-compatible passability subset，不要求 M14 一次实现完整 event collision、priority、terrain、transition compatibility。但实际实现的 subset 必须由 persisted Content facts驱动，并在 CI fixture 与 local exact-v21.1 qualification 中走同一 map runtime logic。

至少一个 tileset 或 player sprite 必须走：

```text
semantic record-derived namespace/key
→ map runtime ContentClient.resource(namespace, key)
→ returned contentVersion
→ Render data namespace/key/contentVersion
→ PresentationResourceClient
→ browser bytes
→ resource is actually used by the visible qualified result
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

M14 closure record分开记录两类证据，但两者共同构成 `Closed`：

```text
CI
→ npm run test:m14
→ checked-in synthetic/author-owned FSDB JSON fixture
→ deterministic full M14 semantic vertical

Local exact-v21.1
→ npm run test:m14:essentials-local
→ exact Essentials v21.1 corpus
→ existing importer
→ M14 consumer projection
→ same prepared Content / ContentClient / map / browser path
→ recorded compatibility result
```

CI fixture 的字段语义必须与同一 M14 RMXP/Essentials-compatible FSDB Content model 对齐；不能构造只在测试里存在的 fake map object model。

Local qualification record 至少包含：

```text
repository commit SHA
source version/identity + fingerprint
consumer projection pass/fail
materialized Map/Tileset/... record counts as relevant
resource count/statistics needed to identify the qualified slice
first-slice visible-tile semantic result
passable + blocked movement semantic result
final qualification pass/fail
```

local official corpus 不提交、不上传为 repository artifact；closure record 只保存 fingerprint/result/statistics，不保存第三方 bytes。

两条 evidence 必须汇入同一 assembled prepared Content → `ContentClient` → map runtime → browser consumer path。Local command 不允许直接向 map Runtime 注入 decoder objects；CI 也不允许使用另一套 fake runtime model。

现有 importer RC 仍然有效，但不得把它误写成 M14 consumer projection 已完成：

```text
existing importer RC
!=
Map/{id} / Tileset/{id} Runtime consumer projection closure
```

M14 closure record必须单独记录后者的实现与 qualification，并与 closure revision SHA 对齐。

## Performance evidence

轻量 timing/node/update diagnostics MAY 随 M14 qualification 记录，但默认不是 closure gate，也不得为了 qualification 新建 MetricsCollector、Profiler、Scheduler 或其他 performance framework。

只有 first real vertical 出现可复现的 frame pressure、unbounded latency 或其他 measurable failure 时，性能才成为 blocking evidence，并可支持最小 reopen M12/M13。

## Explicit non-claims

M14 Closed 不代表：

```text
Pokémon Essentials v21.1 full gameplay complete
all maps/events semantically complete
full RMXP collision/passability/event semantics complete
universal map schema established
Content group API established
resource metadata API established
full RPG::System startup compatibility established
Desktop BrowserWindow full E2E complete
PWA Runtime/full E2E complete
large-map performance universally solved
```

## Reopen rule

只有真实 map consumer 暴露 correctness/security contradiction、author capability缺口或可测性能失败时，才 reopen M10–M13。目录对称、API美观、qualification 代码整洁诉求或未来猜测不是 reopen evidence。
