# Pokémon Essentials v21.1 → FSDB 完整数据导入器草案

> 状态：Draft / v2 architecture  
> 目标：替换当前 `tools/fixtures/essentials-v21.1/import.mjs` 的单文件实现，将 Pokémon Essentials v21.1 的原始资源、PBS 结构化数据、RPG Maker XP / RGSS `rxdata` 数据尽可能完整地转换为可验证的 FSDB fixture。  
> 本工具仅用于本地开发、兼容性验证和测试，不是 LoomRealm 对第三方 Pokémon 素材的分发渠道。

---

## 1. 替代关系

本草案替代此前两份设计思路：

- 仅把 `Graphics / Audio / Fonts / Data / PBS` 镜像为 FSDB Resource 的旧 importer 设计；
- 在 Resource fixture 之上再单独运行 PBS `structure.mjs` 的二阶段设计。

新的目标不再是：

```text
Essentials source
    ↓
Resource-only import
    ↓
第二个脚本再补部分 Struct
```

而是一个统一的导入 pipeline：

```text
Pokémon Essentials v21.1 source
        ↓
Acquisition / Source Validation
        ↓
Lossless Raw Preservation
        ↓
┌───────────────────────────────┬──────────────────────────────┐
│ PBS compiler-compatible path  │ Ruby Marshal / RMXP path     │
│                               │                              │
│ PBS text                      │ Data/*.rxdata / *.dat        │
│   ↓                           │   ↓                          │
│ lexical / CSV decode          │ lossless Marshal graph       │
│   ↓                           │   ↓                          │
│ v21.1 schema interpretation   │ RPG/RGSS object decode       │
│   ↓                           │   ↓                          │
│ Essentials normalization      │ Essentials map/event meaning │
└───────────────┬───────────────┴──────────────┬───────────────┘
                ↓                              ↓
                     Canonical Import Plan
                              ↓
                        FSDB materialize
                              ↓
                     production openFsdb()
                              ↓
                         final output
```

**当前 `import.mjs` 视为 legacy baseline，后续实现应替换其内部结构，而不是继续向这个文件追加 PBS、Marshal、RMXP 和 Essentials 业务解析逻辑。**

---

## 2. 核心目标

### 2.1 完整性的三个层级

导入器分别追求三种 completeness：

#### Physical completeness

```text
所有纳入 corpus 的源文件都进入 Source Manifest
原始 Resource bytes 保留
文件 hash / size 可验证
不静默遗漏 recognised source object
```

#### Structural completeness

```text
PBS recognised syntax 100% 可表达
Ruby Marshal recognised tag 100% 可解码
Marshal shared references / object links 不丢失
RPG/RGSS known object 的 ivar 不静默丢失
EventCommand 不因 unknown code 而丢弃
```

#### Semantic completeness

```text
尽可能复现 Pokémon Essentials v21.1 自身：
SCHEMA
CSV cast rules
default values
compiler normalization
cross-record references
forms / evolutions / encounters / trainer semantics
map / event semantics
```

Semantic 层允许存在 `unknown / opaque`，但不允许因为无法理解而丢弃原始信息。

### 2.2 核心 invariant

```text
unknown != discarded
```

对于插件脚本、未知 RPG class、未知 Event Command 或无法可靠理解的 Ruby expression：

```text
能结构化理解     → raw representation + semantic representation
暂时无法理解     → 保留 raw/opaque representation + diagnostic
绝不             → 静默忽略
```

原始 `PBS`、`Data`、`Plugins` 等资源仍保留，因此任何 derived semantic data 都可以追溯到 raw authority。

---

## 3. Compatibility Target

第一版明确绑定：

```text
Pokémon Essentials v21.1 vanilla
official v21.1 behavior
```

v21.1 的 compiler / `GameData` 源码是 semantic interpretation 的主要 executable specification。

不声称自动完整支持任意第三方 Plugin。Plugin 可以：

```text
新增 PBS schema
patch GameData
修改 compiler
新增 Marshal class
改变 Event Script semantics
改变地图运行时行为
```

因此规则是：

```text
vanilla v21.1 known behavior      → semantic support
known plugin adapter              → 可扩展支持
unknown plugin                    → raw preservation + diagnostic
```

不得为了支持未知 Plugin 而执行任意 Ruby 代码。

---

## 4. CLI 保持只有两个参数

顶层 CLI 继续只公开：

```text
--source <path>
--output <directory>
```

不因为内部能力增加而暴露一组 parser/debug/adaptation CLI flags。

典型调用：

```bash
node tools/fixtures/essentials-v21.1/import.mjs \
  --source "/path/to/Pokemon Essentials v21.1" \
  --output ".local/fixtures"
```

两个参数都可省略。

### 4.1 `--source`

指定时接受：

```text
1. 已解压 Pokémon Essentials v21.1 根目录
2. Pokémon Essentials v21.1 ZIP archive
```

未指定时：

```text
通过固定的 Eevee Expo stable authority 自动获取 v21.1
```

下载、redirect、landing-page resolution、ZIP 保存和解压均属于 acquisition 模块；**不得继续写在 `import.mjs` 中。**

### 4.2 自动下载

默认 authority：

```text
https://www.eeveeexpo.com/essentials/download
```

下载实现必须：

```text
HTTPS only
bounded redirects
bounded response size
temporary-file streaming
no JS execution
no shell/browser automation
archive type/shape validation
safe cleanup
```

若 stable authority 返回受支持的 HTML landing page，可由**authority-specific resolver**解析当前 HTTPS archive candidate；resolver 必须是显式、可测试、fail-closed 的实现，而不是通用网页 scraper。

不得把临时 CDN URL 当长期 authority 写死。

### 4.3 `--output`

`--output` 仍表示输出父目录。

未指定时：

```text
output parent = process.cwd()
```

输出目录永远是新目录：

```text
[FSDB]Essentials v21.1
[FSDB]Essentials v21.1 2
[FSDB]Essentials v21.1 3
...
```

不得覆盖旧 fixture。

---

## 5. `import.mjs` 必须成为薄 composition root

新的 `import.mjs` 只负责：

```text
parse CLI
→ create importer dependencies
→ invoke importEssentialsV21_1()
→ print success/failure
→ set exitCode
```

目标上它不应该包含：

```text
ZIP parsing
HTTP redirect loop
filesystem tree scanner
PBS lexer
CSV parser
GameData schema
Ruby Marshal decoder
RPG::Map decoder
EventCommand semantics
FSDB tree writer details
SHA-256 copy loop
```

建议控制在约 50–150 行量级；具体行数不是 contract，但出现多个独立 domain algorithm 就应继续拆分。

---

## 6. 建议目录结构

```text
tools/fixtures/essentials-v21.1/
├── DESIGN.md
├── import.mjs                         # CLI / composition root only
├── import.test.mjs                    # top-level integration tests
│
├── lib/
│   ├── errors.mjs
│   ├── cli.mjs
│   ├── importer.mjs                   # pipeline orchestration
│   ├── report.mjs
│   │
│   ├── acquisition/
│   │   ├── source.mjs                 # local dir / local zip / auto download
│   │   ├── download.mjs               # bounded HTTPS download
│   │   ├── eevee-expo.mjs             # stable authority resolver
│   │   ├── zip.mjs                    # safe archive extraction
│   │   └── temporary.mjs              # owned temp lifecycle
│   │
│   ├── source/
│   │   ├── identity.mjs               # v21.1 source-shape validation
│   │   ├── manifest.mjs               # complete source inventory
│   │   ├── names.mjs                  # physical UTF-8/NFC handling
│   │   └── fingerprint.mjs            # size/hash/source-change checks
│   │
│   ├── pbs/
│   │   ├── lexer.mjs                  # section / key=value / comments / BOM
│   │   ├── csv.mjs                    # Essentials-compatible CSV splitting
│   │   ├── cast.mjs                   # i/u/v/f/e/... typed casting
│   │   ├── parser.mjs                 # generic section parser
│   │   └── provenance.mjs             # file / section / explicit fields
│   │
│   ├── marshal/
│   │   ├── decoder.mjs                # Ruby Marshal format
│   │   ├── reader.mjs                 # byte cursor / numeric primitives
│   │   ├── graph.mjs                  # object/symbol refs, cycles
│   │   └── types.mjs                  # neutral Marshal IR
│   │
│   ├── rmxp/
│   │   ├── decoder.mjs                # generic RPG/RGSS dispatch
│   │   ├── table.mjs                  # RGSS Table user payload
│   │   ├── color.mjs
│   │   ├── tone.mjs
│   │   ├── audio-file.mjs
│   │   ├── map.mjs
│   │   ├── map-info.mjs
│   │   ├── event.mjs
│   │   ├── event-page.mjs
│   │   ├── event-command.mjs
│   │   ├── move-route.mjs
│   │   ├── common-event.mjs
│   │   ├── tileset.mjs
│   │   └── system.mjs
│   │
│   ├── essentials/
│   │   └── v21.1/
│   │       ├── schema-registry.mjs     # PBS_BASE_FILENAME / SCHEMA mapping
│   │       ├── compiler.mjs            # compile-like orchestration
│   │       ├── defaults.mjs            # GameData runtime defaults
│   │       ├── validation.mjs          # cross-record validation
│   │       ├── references.mjs          # typed logical references
│   │       ├── event-semantics.mjs     # known Essentials event/script forms
│   │       ├── rxdata.mjs              # Essentials-specific RMXP mapping
│   │       └── schemas/
│   │           ├── type.mjs
│   │           ├── ability.mjs
│   │           ├── move.mjs
│   │           ├── item.mjs
│   │           ├── berry-plant.mjs
│   │           ├── species.mjs
│   │           ├── species-form.mjs
│   │           ├── species-metrics.mjs
│   │           ├── ribbon.mjs
│   │           ├── trainer-type.mjs
│   │           ├── trainer.mjs
│   │           ├── encounter.mjs
│   │           ├── metadata.mjs
│   │           ├── map-metadata.mjs
│   │           ├── town-map.mjs
│   │           └── ...
│   │
│   └── fsdb/
│       ├── names.mjs                   # shared FSDB naming authority adapter
│       ├── plan.mjs                    # complete immutable output plan
│       ├── raw-resources.mjs           # raw corpus → Resource plan
│       ├── structured.mjs              # canonical model → table plan
│       ├── schemas.mjs                 # generated .info.meta
│       ├── writer.mjs                  # materialization only
│       ├── transaction.mjs             # reserve/stage/promote/cleanup
│       └── validate.mjs                # production openFsdb validation
│
└── test/
    ├── acquisition.test.mjs
    ├── zip.test.mjs
    ├── pbs.test.mjs
    ├── marshal.test.mjs
    ├── rmxp.test.mjs
    ├── essentials.test.mjs
    ├── fsdb-plan.test.mjs
    └── fixtures/                       # synthetic, redistributable only
```

目录可在实现时做小幅调整，但能力边界不应重新合并回一个大文件。

---

## 7. 依赖方向

依赖保持单向：

```text
cli
 ↓
importer orchestration
 ↓
acquisition / source
 ↓
pbs      marshal
 ↓          ↓
essentials  rmxp
   \        /
    canonical models
          ↓
       fsdb plan
          ↓
       fsdb writer
          ↓
 production validator
```

特别禁止：

```text
marshal → FSDB
pbs lexer → FSDB writer
rmxp → CLI
fsdb writer → Essentials parser
acquisition → semantic compiler
```

物理解码、版本语义和 FSDB 表示必须解耦。

---

## 8. Source Manifest

成功 acquisition 后第一步生成完整 `SourceManifest`。

概念模型：

```ts
interface SourceObject {
  readonly relativePath: string;
  readonly kind: "file" | "directory";
  readonly size?: bigint;
  readonly sha256?: string;
}

interface SourceManifest {
  readonly root: string;
  readonly version: "21.1";
  readonly objects: readonly SourceObject[];
}
```

Manifest 至少负责：

```text
所有 recognised corpus object 被记录
valid UTF-8 physical name
NFC logical identity
no symlink/junction traversal
source version identity
source change detection
extension / ResourceKey collision diagnostics
```

任何后续 parser 都从 Manifest / validated source abstraction 取数据，不重新无约束遍历 filesystem。

---

## 9. Raw corpus 保留

结构化解析不是 Raw Resource 的替代品。

第一版至少保留：

```text
[resource]Graphics/
[resource]Audio/
[resource]Fonts/
[resource]Data/
[resource]PBS/
```

如果完整 distribution 中存在 `Plugins/`，也应纳入：

```text
[resource]Plugins/
```

是否纳入其他 root-level project files 由 Source Manifest 先报告，再明确映射；不得为了“完整”把无关 executable/tooling 文件未经设计全部塞进 FSDB。

Resource bytes 必须保持不变，除已经显式冻结、内容哈希锁定的 physical-name compatibility adaptation 外不得静默改名或转码。

FSDB writer 创建 physical filename 时必须使用 NFC canonical spelling。

---

## 10. PBS：尽量复现 v21.1 compiler

### 10.1 不手写 ad-hoc parser

PBS 解析应复现 Essentials 自身行为：

```text
read file
→ strip supported BOM
→ comments / whitespace
→ section grouping
→ repeated properties
→ Essentials CSV grammar
→ SCHEMA-driven cast
→ category-specific normalization
→ defaults
→ cross-record resolution
```

### 10.2 Version-specific schema registry

Generic PBS parser 不知道 Pokémon、Move、Item。

v21.1 adapter 提供：

```text
PBS_BASE_FILENAME
SCHEMA
field target names
cast grammar
enum/reference targets
repeated-field behavior
post-processing
```

例如 `pokemon` 与 `pokemon_forms` 都属于 Species domain，但 schema/normalization 不完全相同；不能通过“通用 INI 转 JSON”获得完整语义。

### 10.3 Provenance

每个 structured record SHOULD 保留足够 provenance：

```text
source file
section/key
explicit fields
```

原始文本仍由 `[resource]PBS` 保存，因此 structured JSON 不必复制整个 source section。

### 10.4 Defaults 与 normalized result

目标 structured record 表达 Essentials 最终 canonical/runtime-facing value，而不是只表达 PBS 显式字段。

例如：

```text
missing PBS field
    ↓
Essentials-defined default
    ↓
resolved structured value
```

同时 provenance 的 `explicitFields` 可区分：

```text
source explicitly wrote value
vs
value came from v21.1 default/normalization
```

### 10.5 第一批完整覆盖对象

不是只停在五张表；目标应逐步覆盖 v21.1 所有 vanilla PBS/GameData 类，包括但不限于：

```text
Type
Ability
Move
Item
BerryPlant
Species
SpeciesForm
SpeciesMetrics
Ribbon
TrainerType
Trainer
Encounter
Metadata
MapMetadata
TownMap
MapConnection
RegionalDex
ShadowPokemon
BattleFacility data
```

实现顺序可以 vertical slice，但最终 coverage 由 v21.1 schema registry 驱动，而不是人工维护一个“常用表名单”。

---

## 11. Ruby Marshal：先无损解码，再解释

`.rxdata` / 某些 `.dat` 的第一层不是 Map parser，而是 Ruby Marshal parser。

### 11.1 Neutral Marshal IR

Decoder 必须能够表示：

```text
nil
boolean
integer / bignum where applicable
float
string + encoding/ivars
symbol
array
hash
object
class/module refs
instance variables
object links
symbol links
user-defined/user-marshal payload
```

对象图必须保留：

```text
shared identity
reference links
cycles where format permits
```

不要先转成会破坏共享引用的普通递归 JSON tree。

可使用内部 graph IR：

```ts
interface MarshalGraph {
  readonly root: MarshalRef;
  readonly objects: ReadonlyMap<number, MarshalNode>;
}
```

### 11.2 Unknown Marshal object

未知 class 不是 decode failure，只要 Marshal 结构本身合法：

```text
known class   → typed decoder
unknown class → generic className + ivars/payload
```

只有格式本身损坏、引用非法、越界等才是 structural failure。

---

## 12. RMXP / RGSS object layer

Marshal 之上再实现 RPG Maker XP / RGSS 类型：

```text
RPG::Map
RPG::MapInfo
RPG::Event
RPG::Event::Page
RPG::Event::Page::Condition
RPG::Event::Page::Graphic
RPG::EventCommand
RPG::MoveRoute
RPG::MoveCommand
RPG::AudioFile
RPG::CommonEvent
RPG::Tileset
RPG::System
...

RGSS Table
Color
Tone
```

已知 class 的 decoder MUST 检查已知字段，但不得静默丢弃额外 ivar。

推荐输出模型：

```text
known fields
+
extra/unknown ivars
```

这样插件或小版本差异仍可被保留和报告。

---

## 13. Map / Event 完整解析

### 13.1 Map

地图至少保留：

```text
map id / map info
width / height
tileset id
tile Table data
autoplay flags
BGM / BGS
events
all additional known RPG::Map fields
unknown ivars
```

### 13.2 Event

Map Event 不直接等于 NPC。

```text
RPG::Event
```

可能代表：

```text
NPC
Trainer
Door
Warp
Chest
Sign
Cutscene trigger
Invisible trigger
Script controller
```

因此第一层 structured identity 应是 `MapEvent`。

每个 Event 必须保留：

```text
id
name
x / y
pages[]
```

每个 page 必须尽可能完整保留：

```text
conditions
graphic
movement settings
move route
animation flags
priority/through/direction behavior
trigger
commands[]
extra ivars
```

### 13.3 EventCommand

所有 EventCommand 先结构化保存：

```json
{
  "code": 355,
  "indent": 0,
  "parameters": ["..."]
}
```

known command 可再增加 semantic view；unknown command 仍保留 code/parameters。

不得只保留当前关注的 Trainer/Transfer/Text 命令。

---

## 14. Essentials Event semantics

RMXP structural decode 完成后，可以识别 Pokémon Essentials v21.1 常见语义：

```text
trainer battle
wild battle
item ball / receive item
transfer / warp
self switch
message / choice
common event
known Essentials helper calls
```

对 Ruby Script event：

```text
known, safely parseable call pattern
    → semantic extraction + raw script

unknown/arbitrary Ruby
    → raw script only + diagnostic
```

**不实现 Ruby interpreter，不执行项目脚本。**

执行 arbitrary Ruby 会把 fixture importer 变成不可信代码执行环境，也无法形成稳定、可移植的解析 contract。

---

## 15. Compiled `.dat` 与 Oracle 验证

如果 distribution 已包含由 PBS compiler 生成的 `Data/*.dat`，可以把它们作为：

```text
additional structural corpus
+
semantic oracle candidate
```

但第一版 authority 仍应清楚区分：

```text
raw PBS source
compiled GameData representation
our resolved canonical model
```

不要混成一个不可追溯的数据来源。

开发验证中可设计：

```text
PBS
 ├→ our compiler-compatible parser → Canonical JSON
 └→ original Essentials v21.1      → Oracle export
                                      ↓
                                    diff
```

Original Essentials Oracle 是开发/验证工具，不应成为正式 importer 的 runtime dependency。

---

## 16. FSDB mapping

最终 mapping 由 semantic model 决定，不为了覆盖 FSDB 类型而强拆。

### 16.1 Struct

适合：

```text
one Key = one entity
```

候选：

```text
[struct]Type
[struct]Ability
[struct]Move
[struct]Item
[struct]Pokemon
[struct]TrainerType
[struct]Trainer
[struct]Map
[struct]Tileset
[struct]CommonEvent
...
```

### 16.2 Extend

仅在确实表达“依附于基础 Struct 的扩展实体”时使用。

候选：

```text
[extend]PokemonForm
[extend]MapMetadata
```

具体 identity 需要在实现真实 corpus 后冻结。

### 16.3 Group

适合：

```text
one Key = ordered collection of records
```

候选：

```text
[group]Encounter
[group]MapEvent
[group]MapConnection
```

EventCommand 是嵌入 `MapEvent` 还是单独 Group，不在本草案提前冻结；应根据实际访问模式和数据规模决定。

### 16.4 Resource

始终保存 raw authority：

```text
Graphics
Audio
Fonts
Data
PBS
Plugins (if present)
```

---

## 17. Canonical Import Plan

所有写盘之前构造完整计划。

概念上：

```ts
interface ImportPlan {
  readonly resources: readonly PlannedResource[];
  readonly structs: readonly PlannedStructTable[];
  readonly extends: readonly PlannedExtendTable[];
  readonly groups: readonly PlannedGroupTable[];
  readonly diagnostics: readonly Diagnostic[];
  readonly coverage: CoverageReport;
}
```

Plan 阶段完成：

```text
identity collision check
FSDB NameSegment validation
ResourceKey collision check
reference validation where possible
schema generation
output path calculation
NFC writer spelling
size/count limits
coverage accounting
```

Plan PASS 后才允许 materialize。

这样可以避免：

```text
写了一半 Struct
→ 后面发现 Map collision
→ staging 中留下难以推理的部分结果
```

---

## 18. Output transaction

沿用并模块化当前可靠的 staging 思路：

```text
acquire
→ manifest
→ parse/decode
→ build complete plan
→ validate plan
→ reserve unique output
→ create staging
→ materialize
→ production openFsdb(staging)
→ optional integrity validation
→ promote
→ cleanup
```

失败时：

```text
remove importer-owned staging
delete importer-owned temp/download/extraction
never mutate borrowed source
never mutate previous successful fixture
```

`transaction.mjs` 负责目录 ownership 和 promotion；业务 parser 不处理 cleanup。

---

## 19. FSDB authority 复用

Importer 不应复制一份逐渐漂移的 FSDB naming implementation。

当前可以通过一个小 adapter 复用 production/shared authority：

```text
lib/fsdb/names.mjs
```

如果后续出现第二个真实 consumer，应该把 FSDB naming/validation capability 抽成稳定共享包；不要让 fixture importer 长期 import `@loomrealm/fsdb-http/dist/...` 私有内部路径。

这个抽包是 implementation follow-up，不要求为了本草案先制造新的协议或 Profile。

---

## 20. Diagnostics 与 coverage

成功报告不能只打印“多少文件/多少 bytes”。

建议至少输出：

```text
Source
  acquisition mode
  files / bytes

Raw resources
  copied files
  byte verification

PBS
  files discovered
  sections parsed
  records resolved
  unsupported properties
  reference failures

Marshal
  files decoded
  nodes decoded
  unknown tags
  unknown classes
  preserved extra ivars

RMXP
  maps
  events
  event pages
  event commands
  unknown command codes

Semantic
  known Essentials script commands
  opaque Ruby scripts
  unresolved references

FSDB
  struct tables / records
  extend tables / records
  group tables / records
  resource tables / files
  validation result
```

关键指标：

```text
discarded recognised data = 0
```

Semantic coverage 可以低于 100%，但必须显式报告。

---

## 21. Failure categories

继续使用稳定 category，而不是让底层异常直接成为 CLI contract。

建议分域：

```text
INVALID_ARGUMENT

DOWNLOAD_FAILURE
DOWNLOAD_REDIRECT_FAILURE
DOWNLOAD_RESOLUTION_FAILURE
ARCHIVE_INVALID
ARCHIVE_PATH_ESCAPE

SOURCE_NOT_ESSENTIALS_V21_1
SOURCE_INDIRECTION
SOURCE_CHANGED
INVALID_UTF8_NAME

PBS_SYNTAX_FAILURE
PBS_SCHEMA_FAILURE
PBS_REFERENCE_FAILURE

MARSHAL_INVALID
MARSHAL_UNSUPPORTED
RMXP_DECODE_FAILURE
ESSENTIALS_SEMANTIC_FAILURE

FSDB_NAME_FAILURE
FSDB_IDENTITY_COLLISION
FSDB_PLAN_FAILURE
COPY_FAILURE
FSDB_VALIDATION_FAILURE
```

`unknown semantic object` 一般应是 diagnostic，而不是 failure；只有无法保证结构无损或输出 identity 时才 fail closed。

---

## 22. 测试策略

不要只有 `import.test.mjs` 一个集成测试。

### 22.1 Unit tests

```text
CLI parsing
redirect bounds
landing page resolver
ZIP traversal / duplicate target / symlink
UTF-8 filename handling
PBS comments/BOM/section/repeated fields
Essentials CSV edge cases
schema cast
Marshal integer/string/symbol/ref/object graph
RGSS Table
RPG::EventCommand
FSDB plan collision
transaction cleanup
```

### 22.2 Synthetic integration fixture

仓库内只提交自造、可再分发的小 corpus：

```text
PBS sample
small synthetic Marshal/RMXP blobs
fake Graphics/Audio files
Map with multiple Event pages
known + unknown EventCommand
normalization collision cases
```

### 22.3 Local full-corpus validation

完整 Pokémon Essentials v21.1 distribution 只在本地使用：

```text
full import
→ coverage report
→ openFsdb PASS
→ HTTP fixture smoke test
→ optional original-Essentials oracle diff
```

第三方素材本身不得进入仓库或 npm artifact。

---

## 23. 实现顺序

不要一次重写所有能力。

### Stage 1 — 拆旧 importer，不改变行为

```text
cli
acquisition
zip
source validation
resource planning
transaction
writer
report
```

先把当前功能迁出 `import.mjs`，保证 existing tests 等价 PASS。

### Stage 2 — Source Manifest + Raw coverage

```text
完整 inventory
hash/fingerprint
NFC writer fix
Plugins detection
coverage report
```

### Stage 3 — PBS generic parser

```text
lexer
CSV
cast grammar
provenance
```

### Stage 4 — v21.1 schema/compiler semantics

先 vertical slice：

```text
Type
Ability
Move
Item
Species
```

然后以 schema registry 扩展到全部 vanilla PBS data。

### Stage 5 — Ruby Marshal decoder

先做到 neutral graph structural completeness，再进入 RPG class。

### Stage 6 — RMXP Map/Event

```text
Table
MapInfo
Map
Event
Page
EventCommand
MoveRoute
CommonEvent
Tileset/System
```

### Stage 7 — Essentials map/event semantics

识别 known helper calls、trainer/wild battle、item/warp 等；unknown Ruby 保留 opaque。

### Stage 8 — Oracle / conformance refinement

```text
our output
vs
original Essentials v21.1 resolved output
```

以真实差异驱动最小修正。

---

## 24. 完成标准

v1 full-data importer 可以进入 RC 的最低标准：

```text
CLI 仍只有 --source / --output
local dir / local ZIP / auto-download acquisition 可用
import.mjs 为薄 composition root
raw corpus byte preservation 可验证
source manifest 无 recognised omission
PBS vanilla v21.1 schema coverage 明确并高覆盖
Marshal decoder 无 recognised tag 丢失
Map/Event structural decode 完整
unknown Event/Script 保留 raw
FSDB plan 在写盘前完成 identity/reference validation
staging/promote failure cleanup 正确
production openFsdb() PASS
coverage report 明确 unknown / opaque / unresolved 数量
CI synthetic tests PASS
full third-party corpus 不进入 repo/npm
```

目标不是宣称“执行层面 100% 复现任意 Essentials 游戏”，而是：

> **对 vanilla Pokémon Essentials v21.1 的可观测静态数据尽可能完整结构化；对暂时无法解释的部分保持无损、可追溯、显式报告，而不是丢弃。**
