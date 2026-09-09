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
Essentials compatibility preparation
example-local business glue
WebPresentationConfig source for the example/dev composition
```

Example 是 private workspace，不作为 npm 发布物。

## Source / preparation boundary

`tools/fixtures/essentials-v21.1` 继续负责 source acquisition/import/compatibility qualification。M14 不把它变成 runtime library。

开发链：

```text
external/local Essentials v21.1 corpus
→ existing tools/fixtures/essentials-v21.1 importer
→ .local/examples/essentials-v21.1/imported
→ example-local preparation/compiler
→ map-library normalized records/resources
→ .local/examples/essentials-v21.1/prepared
→ example runtime
```

规则：

```text
runtime example imports tools/* = forbidden
game-libs/map imports Essentials tooling = forbidden
third-party game assets committed to repo = forbidden
prepared physical path exposed to business = forbidden
```

Runtime 只通过 M12 logical Content API 读取 prepared data/resource。

## Compatibility adapter placement

第一版 Essentials→map normalized translation 保持 example-local。只有第二个真实 Essentials-compatible game 证明 adapter 需要复用时，才评估独立 compatibility game-lib/tool package。

不要提前创建：

```text
@loomrealm-game/essentials
CompatibilityRegistry
UniversalImporter API
```

## CI vs official corpus

Canonical CI 不能依赖未提交的第三方 corpus。M14 使用两类 evidence：

```text
CI
→ checked-in synthetic/author-owned minimal map fixture
→ deterministic full M14 vertical

Local compatibility qualification
→ exact Essentials v21.1 official/local corpus
→ existing importer
→ example preparation
→ recorded compatibility result
```

两条路径必须汇入同一个 map normalized schema/runtime，不允许 CI 使用另一套 fake business implementation。

## First slice

官方/local corpus 开发时优先选择一个足够小但真实的地图，验证：

```text
map metadata
map dimensions/layers
resource references
event/player spawn facts
movement collision facts needed by first slice
```

M14 不承诺完整 Pokémon Essentials gameplay、battle/menu/party/Pokédex 等业务。

## Closure

- example workspace private；
- importer 只参与 preparation；
- local output 位于 ignored `.local/`；
- example runtime 只消费 normalized Content + game library/public LoomRealm APIs；
- CI fixture 与 official-corpus preparation 使用同一 runtime path。
