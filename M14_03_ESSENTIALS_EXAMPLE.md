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

## Source / preparation boundary

`tools/fixtures/essentials-v21.1` 继续负责 source acquisition/import/compatibility qualification。M14 不把它变成 runtime library。

开发链：

```text
external/local Essentials v21.1 corpus
→ existing tools/fixtures/essentials-v21.1 importer
→ Ruby/Marshal/RMXP decode
→ importer internal typed/object-graph representation
→ semantic JSON materialization
→ prepared FSDB records + raw resources
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

因此 M14 不创建：

```text
MapNormalizedV1
MapBundle schema
Essentials→map example adapter
@loomrealm-game/map-schema
```

如果未来另一个 source format 需要使用同一个 map library，应由那个 source 的 importer/materializer产出满足同一 RMXP-compatible **FSDB JSON record semantics** 的 Content，或由真实 consumer evidence 再决定是否需要新的 map abstraction；M14 不提前泛化。

## Presentation preparation

`@loomrealm-game/map` browser build 是 game library-owned presentation artifact，但必须进入正常 prepared Content：

```text
map browser JS/CSS build
→ example/dev preparation declares logical Content refs
→ prepared Content
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
→ same Content identities/runtime/browser path
→ deterministic full M14 vertical

Local compatibility qualification
→ exact Essentials v21.1 official/local corpus
→ existing importer
→ same semantic JSON materialization into FSDB
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
player spawn facts
movement collision facts needed by first slice
real tileset/player resource
```

M14 不承诺完整 Pokémon Essentials gameplay、battle/menu/party/Pokédex 等业务。

## Closure

- example workspace private；
- importer 只参与 preparation，不成为 runtime dependency；
- local output 位于 ignored `.local/`；
- importer 将 source/decoder representation materialize 为 FSDB JSON records，不把 Ruby object wrappers变成 map runtime API；
- Runtime 通过 `ContentClient` 消费 FSDB JSON `JsonValue` records/resources；
- example runtime 直接消费 prepared Content + game library/public LoomRealm APIs；
- CI fixture 与 official-corpus qualification 使用同一 FSDB Content/runtime/browser path。
