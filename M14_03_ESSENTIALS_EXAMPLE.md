# M14 / 03 — Essentials v21.1 Concrete Example

> 状态：Implementation Landing / M14 Pending

## Objective

建立第一个 concrete game workspace：

```text
examples/essentials-v21.1
```

它验证真实游戏如何组合 LoomRealm framework + reusable game library，而不是把 example 逻辑塞进 `apps/desktop` 或 `packages/*`。

## Ownership

Example owns：

```text
Game Entry / game-specific Subsystem keys
concrete game composition
initial business input / game-specific glue
WebPresentationConfig declaration for the example/dev composition
```

Example 是 private workspace，不作为 npm 发布物。

M14 不再让 example 拥有 Essentials→map normalized adapter。Map library 消费的是 importer 写入 prepared FSDB、再通过 `ContentClient` 暴露的 JSON records/resources；RMXP/Essentials 只是这些 records 的 semantic authority。

Importer 侧精确的 M14 consumer projection 见：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

## Source / preparation boundary

`tools/fixtures/essentials-v21.1` 继续负责 source acquisition/import/compatibility qualification。M14 不把它变成 runtime library。

开发链：

```text
external/local Essentials v21.1 corpus
→ existing tools/fixtures/essentials-v21.1 importer
→ Ruby/Marshal/RMXP decode
→ importer internal typed/object-graph representation
→ semantic JSON materialization
→ importer-produced FSDB records + raw resources
→ example/test prepared Content assembly
→ M12 Content view
→ examples/essentials-v21.1 runtime
→ @loomrealm-game/map
```

Importer 的职责包括理解：

```text
Ruby Marshal
.rxdata
RPG::* source objects
PBS / Essentials compiled data
source filesystem/layout
```

Runtime example 与 `@loomrealm-game/map` 不理解 importer object-graph/serialization mechanics。

规则：

```text
runtime example imports tools/* = forbidden
game-libs/map imports tools/* implementation = forbidden
third-party game assets committed to repo = forbidden
prepared physical path exposed to business = forbidden
runtime consumes RmxpObject/RubyString/$id/$ref/$typed wrappers = forbidden
runtime treats decoder object/class instances as Content records = forbidden
```

Runtime 只通过 M12 logical Content API 读取 FSDB JSON records/resources。

## FSDB semantic materialization

Importer 应在现有 canonical/FSDB preparation 中 materialize 可直接消费的 JSON records，例如：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

这里的 `RPG::Map` / `RPG::Tileset` 等名称只定义 semantic authority：字段含义、关系与行为来源保持 RMXP/Essentials 本身；Runtime persisted representation 是普通 JSON-compatible FSDB record value。

因此：

```text
RPG::Map source/decoder object
!= FSDB Map/{id} JSON record
```

但：

```text
FSDB Map/{id} field meaning
= RPG::Map-compatible map semantics
```

Materialization 负责移除 Ruby/Marshal/object-graph transport details，例如 decoder wrapper、object identity、typed-array runtime object等，并生成 `ContentClient.record()` 可返回的 `JsonValue`。它不是第二套 map business model。

机械 projection 规则由 `M14_CONSUMER_PROJECTION.md` 唯一拥有，包括：

```text
known @ivar → strip one leading @, preserve remaining spelling
RubyString/RubySymbol → JSON string
Array → JSON array
Table → { dimensions, xSize, ySize, zSize, values:number[] }
Map.events → embedded JSON object keyed by decimal event id
```

第一版不拆 `MapEvent` Group，也不为 M14 增加 `ContentClient.group()`。

因此 M14 不创建：

```text
MapNormalizedV1
MapBundle schema
Essentials→map example adapter
@loomrealm-game/map-schema
```

如果未来另一个 source format 需要使用同一个 map library，应由那个 source 的 importer/materializer产出满足同一 RMXP-compatible **FSDB JSON record semantics** 的 Content，或由真实 consumer evidence 再决定是否需要新的 map abstraction；M14 不提前泛化。

## Example/test prepared Content assembly

Essentials importer 不负责 map browser build，也不负责 Web Presentation Config。

M14 使用一个薄的 example/test preparation step 把已经存在的内容组装成 qualification 使用的 prepared Content view：

```text
importer-produced FSDB or CI-safe semantic fixture
+
@loomrealm-game/map browser JS/CSS build
+
example WebPresentationConfig logical refs
→ one test-local prepared Content view
```

该 preparation 只做 composition/materialization，不做新的 map semantic transform。

它：

```text
MAY live under examples/essentials-v21.1 or qualification tooling
MUST NOT become Runtime dependency
MUST NOT become production Host
MUST NOT create UniversalGamePackager / ContentBuilder framework
MUST NOT teach the Essentials importer about map browser JS/CSS
```

只有未来多个真实 games 证明需要共享 packaging capability 时才讨论抽出 package。

## Game Entry must participate

`examples/essentials-v21.1` 不能只是 fixture directory。M14 qualification 必须实际读取 example 的 `game.json` 并通过现有 Game Package：

```text
examples/essentials-v21.1/game.json
→ parseGameEntryV1 / validateGameEntryV1
→ validated subsystem keys + initial target/input
→ test-owned physical Definition binding
→ Main
```

M14 test harness 只为 validated logical key 绑定具体 Definition；不要求 Hostra/PWA Launch Manifest，因此不侵入 M15。

第一条 vertical 可以使用最小 initial business input，例如：

```json
{
  "mapId": 1,
  "x": 10,
  "y": 8
}
```

这样真实证明 Game Entry → initial Frame/map startup，同时避免为了首张地图强制实现完整 `RPG::System.start_map_id/start_x/start_y` compatibility。若后续真实 Essentials startup 需要 System，再按 consumer evidence加入。

## Presentation preparation

`@loomrealm-game/map` browser build 是 game library-owned presentation artifact，但必须进入正常 prepared Content：

```text
map browser JS/CSS build
→ example/test prepared Content assembly
→ prepared Content logical refs
→ WebPresentationConfigV1
→ M13 bootstrap
→ native customElements registration
```

Example 可以拥有该具体游戏的 Config declaration；Config acquisition/private browser binding/Window lifecycle 仍属于 test/platform composition，不进入 business authority。

M14 qualification 不得通过测试文件直接 import map browser entry 来替代 M13 bootstrap。

## CI vs official corpus

Canonical CI 不能依赖未提交的第三方 corpus。M14 使用两类 evidence：

```text
CI
→ checked-in synthetic/author-owned FSDB JSON fixture
→ record semantics mirror the required RMXP/Essentials map facts
→ same prepared Content assembly
→ same Content identities/runtime/browser path
→ deterministic full M14 vertical

Local compatibility qualification
→ exact Essentials v21.1 official/local corpus
→ existing importer
→ same semantic JSON materialization into FSDB
→ same prepared Content assembly
→ same ContentClient/map runtime/browser path
→ recorded compatibility result
```

两条路径必须汇入同一 `@loomrealm-game/map` consumer path，不允许 CI 使用另一套 fake map model，也不允许 map runtime 在 local path 读取 importer decoder objects。

## First slice

官方/local corpus 开发时优先选择一个足够小但真实的地图，验证对应 FSDB JSON records 能表达：

```text
RPG::Map-compatible width/height/data/events semantics
RPG::Tileset-compatible resource/passability semantics
MapInfo/MapMetadata semantics as needed
player spawn from example initial input
movement collision facts needed by first slice
real tileset/player resource
```

资源 logical identity继续使用现有 Content mapping，例如 tileset `Graphics / Tilesets/{tileset_name}`、character `Graphics / Characters/{character_name}`；version由 map Runtime 调现有 `ContentClient.resource()` 获得。

M14 不承诺完整 Pokémon Essentials gameplay、battle/menu/party/Pokédex 等业务。

## Closure

- example workspace private；
- importer 只参与 source/semantic preparation，不成为 runtime dependency；
- local output 位于 ignored `.local/`；
- importer 将 source/decoder representation materialize 为 FSDB JSON records，不把 Ruby object wrappers变成 map runtime API；
- example/test preparation只组装 semantic Content + map browser artifacts + Config refs，不成为新 framework；
- `game.json` 真实经过 `@loomrealm/game-package` validation 并驱动 M14 logical startup；
- Runtime 通过 `ContentClient` 消费 FSDB JSON `JsonValue` records/resources；
- example runtime 直接消费 prepared Content + game library/public LoomRealm APIs；
- CI fixture 与 official-corpus qualification 使用同一 FSDB Content/runtime/browser path。
