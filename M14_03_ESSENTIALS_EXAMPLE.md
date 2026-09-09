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

M14 不再让 example 拥有 Essentials→map normalized adapter。Map library 直接消费 importer 产生的 RMXP/Essentials semantic records。

## Source / preparation boundary

`tools/fixtures/essentials-v21.1` 继续负责 source acquisition/import/compatibility qualification。M14 不把它变成 runtime library。

开发链：

```text
external/local Essentials v21.1 corpus
→ existing tools/fixtures/essentials-v21.1 importer
→ Ruby/Marshal/RMXP decode
→ RMXP/Essentials semantic records + raw resources
→ prepared FSDB / Content view
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
```

Runtime 只通过 M12 logical Content API 读取 semantic records/resources。

## Semantic materialization

Importer 应在现有 canonical/FSDB preparation 中 materialize 可直接消费的地图语义记录，例如：

```text
Map/{id}
Tileset/{id}
MapInfo/{id}
MapMetadata/{id}
```

字段语义保持 RMXP/Essentials 本身；只移除 Ruby/Marshal/object-graph transport details。

因此 M14 不创建：

```text
MapNormalizedV1
MapBundle schema
Essentials→map example adapter
@loomrealm-game/map-schema
```

如果未来另一个 source format 需要使用同一个 map library，应由那个 source 的 importer/materializer产出相同 RMXP-compatible semantic model，或由真实 consumer evidence 再决定是否需要新的 map abstraction；M14 不提前泛化。

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
→ checked-in synthetic/author-owned RMXP-compatible semantic fixture
→ same Content identities/runtime/browser path
→ deterministic full M14 vertical

Local compatibility qualification
→ exact Essentials v21.1 official/local corpus
→ existing importer
→ same semantic materialization
→ same map runtime/browser path
→ recorded compatibility result
```

两条路径必须汇入同一 `@loomrealm-game/map` consumer path，不允许 CI 使用另一套 fake map model。

## First slice

官方/local corpus 开发时优先选择一个足够小但真实的地图，验证：

```text
RPG::Map width/height/data/events
RPG::Tileset resource/passability facts
MapInfo/MapMetadata as needed
player spawn facts
movement collision facts needed by first slice
real tileset/player resource
```

M14 不承诺完整 Pokémon Essentials gameplay、battle/menu/party/Pokédex 等业务。

## Closure

- example workspace private；
- importer 只参与 preparation，不成为 runtime dependency；
- local output 位于 ignored `.local/`；
- importer materializes semantic records，不把 Ruby object wrappers变成 map runtime API；
- example runtime 直接消费 prepared Content + game library/public LoomRealm APIs；
- CI fixture 与 official-corpus qualification 使用同一 semantic/runtime/browser path。
