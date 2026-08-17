# Pokémon Essentials v21.1 → FSDB 完整数据导入器草案

> 状态：Draft / v3 architecture  
> 目标：替换当前 `tools/fixtures/essentials-v21.1/import.mjs` 的单文件实现，将 **Pokémon Essentials v21.1 vanilla** 的可观测静态数据尽可能完整、可追溯、可验证地转换为 FSDB fixture。  
> 本工具仅用于本地开发、兼容性验证和测试，不是 LoomRealm 对第三方 Pokémon 素材的分发渠道。

---

## 1. 设计结论

本版本不再采用：

```text
Essentials source
    ↓
Resource-only import
    ↓
第二个脚本再补部分 Struct
```

也不继续把所有能力堆进一个不断膨胀的 `import.mjs`。

正式目标是一个统一但内部严格分层的导入 pipeline：

```text
Pokémon Essentials v21.1 source
        ↓
Acquisition
        ↓
Source Manifest
        ↓
┌──────────────────────────────────────────────────────────────┐
│ Raw authority                                               │
│                                                              │
│ resource bytes / PBS source / Data / Plugins / project data │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
          PBS pipeline                    Marshal / RMXP
              │                                 │
              ▼                                 ▼
      v21.1 compiler passes              structural model
              │                                 │
              ├──────────────┬──────────────────┘
              │              │
              ▼              ▼
       Hardcoded GameData   compiler-derived data
              \              /
               \            /
                ▼          ▼
             Canonical Dataset
                    ↓
          Derived Semantic Dataset
                    ↓
                 FSDB Plan
                    ↓
       identity + integrity validation
                    ↓
               transaction
                    ↓
             production FSDB
                    ↓
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
    openFsdb     coverage      Oracle diff
       └────────────┴─────────────┘
                    ↓
              qualification
```

**当前 `import.mjs` 视为 legacy baseline。后续实现必须替换它的内部结构，而不是继续向其中追加 PBS、Marshal、RMXP、地图、人物或 Essentials 业务解析算法。**

---

## 2. Compatibility Authority

第一版明确只承诺：

```text
Pokémon Essentials v21.1 vanilla
```

语义 authority 按优先级分为：

```text
1. Pokémon Essentials v21.1 官方源码行为
2. v21.1 GameData / Compiler / RMXP runtime data shape
3. 官方 v21.1 完整 distribution 的实际 corpus
4. 本 importer 的兼容实现
```

开发时应固定参考版本：

```text
Maruno17/pokemon-essentials
Tag: v21.1
Commit: ea7b5d56d2436591160983c4e641a2ceee2d875a
```

不得通过“当前 master 看起来相同”替代 v21.1 authority。

任意第三方 Plugin 不属于 v1 semantic completeness 承诺，因为 Plugin 可以：

```text
新增 PBS schema
patch GameData
修改 compiler
新增 Marshal class
改变 Event Script semantics
改变地图运行时行为
```

规则是：

```text
vanilla v21.1 known behavior  → semantic support
known plugin adapter          → 可扩展支持
unknown plugin                → raw preservation + diagnostic
```

不得为了提高 semantic coverage 而执行任意项目 Ruby 代码。

---

## 3. Completeness 模型

“尽可能完整”不是一句描述，而是三个独立、可计量的目标。

### 3.1 Physical completeness

```text
所有 recognised corpus object 进入 Source Manifest
所有纳入 Resource 的原始 bytes 可验证
所有 recognised physical object 都被 classify
不静默跳过文件、目录或数据根
```

### 3.2 Structural completeness

```text
PBS recognised syntax 100% 可表达
Marshal encountered tag 100% 有结构处理结果
Marshal shared refs / cycles / object identity 不丢失
known RPG/RGSS object 的额外 ivar 不丢失
EventCommand 不因 unknown code 而丢弃
unknown Ruby class 仍以 generic object 保留
```

### 3.3 Semantic completeness

尽可能复现 v21.1 自身最终可观察语义：

```text
PBS compatibility rewrites
SCHEMA
CSV cast rules
default values
local normalization
global compiler finalization
cross-record references
hardcoded GameData
forms / evolutions / encounters / trainer semantics
map / event semantics
compiler-derived trainer event changes
messages / localization extraction
animation-related compiled data
```

Semantic 层允许存在 `unknown / opaque`，但必须显式计量。

### 3.4 核心 invariant

```text
unknown != discarded
```

允许：

```text
无法理解 → raw/opaque preservation + diagnostic
```

禁止：

```text
无法理解 → 忽略
```

进一步冻结：

```text
discarded recognised data = 0
```

这是 RC 级硬约束。

---

## 4. 顶层 CLI：仍然只有两个参数

CLI 保持：

```text
--source <path>
--output <directory>
```

不因为内部能力增加而暴露 parser/debug/adaptation 参数。

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

未指定时自动 acquisition。

默认 stable authority：

```text
https://www.eeveeexpo.com/essentials/download
```

### 4.2 自动下载

自动下载必须：

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

如果 stable authority 返回受支持的 landing page，可以由：

```text
acquisition/eevee-expo.mjs
```

进行 authority-specific、fail-closed 的 archive candidate resolution。

它不是通用网页 scraper；不得把临时 CDN URL 当长期 authority 写死。

### 4.3 `--output`

`--output` 表示输出父目录。

未指定：

```text
output parent = process.cwd()
```

最终 FSDB root 永远创建新目录：

```text
[FSDB]Essentials v21.1
[FSDB]Essentials v21.1 2
[FSDB]Essentials v21.1 3
...
```

不得覆盖已有 fixture。

---

## 5. `import.mjs` 必须是薄 composition root

新的 `import.mjs` 只负责：

```text
parse CLI
→ create dependencies
→ invoke importEssentialsV21_1()
→ print result/failure
→ set exitCode
```

它不得包含：

```text
HTTP redirect algorithm
landing-page resolver
ZIP parser
filesystem tree scanner
PBS lexer
CSV parser
GameData schema
compiler pass
Ruby Marshal decoder
RPG class decoder
Event semantics
FSDB writer details
transaction cleanup algorithm
SHA-256 copy loop
```

目标量级约 50–150 行；行数不是 contract，但出现独立 domain algorithm 就应继续拆分。

---

## 6. 建议目录结构

```text
tools/fixtures/essentials-v21.1/
├── DESIGN.md
├── import.mjs
├── import.test.mjs
│
├── lib/
│   ├── errors.mjs
│   ├── cli.mjs
│   ├── importer.mjs
│   ├── report.mjs
│   │
│   ├── acquisition/
│   │   ├── source.mjs
│   │   ├── download.mjs
│   │   ├── eevee-expo.mjs
│   │   ├── zip.mjs
│   │   └── temporary.mjs
│   │
│   ├── source/
│   │   ├── identity.mjs
│   │   ├── manifest.mjs
│   │   ├── names.mjs
│   │   ├── fingerprint.mjs
│   │   └── reader.mjs
│   │
│   ├── pbs/
│   │   ├── lexer.mjs
│   │   ├── csv.mjs
│   │   ├── cast.mjs
│   │   ├── parser.mjs
│   │   └── provenance.mjs
│   │
│   ├── marshal/
│   │   ├── reader.mjs
│   │   ├── decoder.mjs
│   │   ├── graph.mjs
│   │   ├── tag-registry.mjs
│   │   └── types.mjs
│   │
│   ├── rmxp/
│   │   ├── decoder.mjs
│   │   ├── class-registry.mjs
│   │   ├── table.mjs
│   │   ├── color.mjs
│   │   ├── tone.mjs
│   │   ├── audio-file.mjs
│   │   ├── map.mjs
│   │   ├── map-info.mjs
│   │   ├── event.mjs
│   │   ├── event-page.mjs
│   │   ├── event-command.mjs
│   │   ├── move-route.mjs
│   │   ├── move-command.mjs
│   │   ├── common-event.mjs
│   │   ├── tileset.mjs
│   │   └── system.mjs
│   │
│   ├── essentials/
│   │   └── v21.1/
│   │       ├── vanilla-registry.mjs
│   │       ├── schema-registry.mjs
│   │       ├── hardcoded-data.mjs
│   │       ├── references.mjs
│   │       ├── rxdata.mjs
│   │       ├── event-semantics.mjs
│   │       ├── messages.mjs
│   │       ├── animations.mjs
│   │       ├── trainer-events.mjs
│   │       ├── compiler/
│   │       │   ├── index.mjs
│   │       │   ├── precompile.mjs
│   │       │   ├── schema-cast.mjs
│   │       │   ├── normalize.mjs
│   │       │   ├── defaults.mjs
│   │       │   ├── resolve.mjs
│   │       │   └── finalize.mjs
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
│   ├── model/
│   │   ├── raw-dataset.mjs
│   │   ├── canonical-dataset.mjs
│   │   └── semantic-dataset.mjs
│   │
│   └── fsdb/
│       ├── names.mjs
│       ├── mapper.mjs
│       ├── plan.mjs
│       ├── raw-resources.mjs
│       ├── structured.mjs
│       ├── schemas.mjs
│       ├── integrity.mjs
│       ├── writer.mjs
│       ├── transaction.mjs
│       └── validate.mjs
│
└── test/
    ├── acquisition.test.mjs
    ├── zip.test.mjs
    ├── source-manifest.test.mjs
    ├── pbs.test.mjs
    ├── compiler.test.mjs
    ├── marshal.test.mjs
    ├── rmxp.test.mjs
    ├── essentials.test.mjs
    ├── fsdb-plan.test.mjs
    ├── transaction.test.mjs
    └── fixtures/
```

目录可以在实现时小幅调整，但能力边界不得重新合并回一个大文件。

---

## 7. 依赖方向

依赖必须单向：

```text
cli
 ↓
importer orchestration
 ↓
acquisition / source
 ↓
pbs          marshal
 ↓              ↓
essentials    rmxp
   \            /
    canonical model
          ↓
   semantic model
          ↓
       fsdb mapper
          ↓
        fsdb plan
          ↓
 writer / validator
```

禁止：

```text
marshal → FSDB
pbs lexer → FSDB writer
rmxp → CLI
fsdb writer → Essentials compiler
acquisition → semantic compiler
```

物理解码、版本语义、业务推导和 FSDB 表示必须解耦。

---

## 8. VanillaRegistry：完整性的 authority

禁止通过人工维护的“常见数据类型列表”定义 coverage。

新增：

```text
essentials/v21.1/vanilla-registry.mjs
```

概念模型：

```ts
interface VanillaRegistry {
  readonly pbsFamilies: readonly PbsFamilyDefinition[];
  readonly compiledData: readonly CompiledDataDefinition[];
  readonly hardcodedDomains: readonly HardcodedDomainDefinition[];
  readonly rmxpRoots: readonly RmxpRootDefinition[];
  readonly compilerPasses: readonly CompilerPassDefinition[];
}
```

Registry 必须从固定 v21.1 authority 人工校对生成，而不是运行项目 Ruby 动态发现。

它至少覆盖 v21.1 自身的：

```text
GameData PBS_BASE_FILENAME registry
Compiler.get_all_pbs_files_to_compile
Compiler.compile_pbs_files
GameData.get_all_data_filenames
Compiler.compile_all
RMXP Data roots
hardcoded GameData definitions
```

已知非单纯 GameData generic path 也必须进入 Registry，例如：

```text
BattleFacility
Connection / map_connections
RegionalDex
DungeonTileset
DungeonParameters
PhoneMessage
trainer lists
```

核心闭环：

```text
expected vanilla data families
-
classified importer data families
=
∅
```

如果 Registry 新增条目而 importer 没有 handler：

```text
coverage failure
```

而不是静默忽略。

---

## 9. Source Manifest

Acquisition 成功后，第一步生成完整 `SourceManifest`。

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

Manifest 负责：

```text
完整 physical inventory
valid UTF-8 physical name
NFC logical identity
no symlink/junction traversal
source version identity
source change detection
extension / ResourceKey collision diagnostics
classification status
```

任何后续 parser 只能通过 Manifest / validated source abstraction 读取，不允许重新无约束遍历 filesystem。

Manifest 中每个 recognised source object 必须最终处于：

```text
raw-preserved
parsed
opaque-preserved
explicitly excluded by frozen policy
```

不得存在无说明的 `unclassified`。

---

## 10. Raw authority preservation

结构化解析不是 raw data 的替代品。

第一版至少保留：

```text
[resource]Graphics
[resource]Audio
[resource]Fonts
[resource]Data
[resource]PBS
```

如果完整 distribution 存在：

```text
Plugins/
```

则保留：

```text
[resource]Plugins
```

其他 root-level project files 必须由 Source Manifest 分类；不因为“完整”而无设计地把 executable/tooling 全部塞进 FSDB。

Resource bytes 必须保持不变。

除显式冻结、内容哈希锁定的 compatibility adaptation 外：

```text
不得转码
不得 lowercase filename
不得 trim
不得自动替换非法字符
不得静默修复 normalization collision
```

FSDB writer 创建 physical filename 时必须请求 NFC canonical spelling。

---

## 11. 数据模型分层

正式冻结三层数据模型。

### 11.1 RawDataset

表达“源里实际存在什么”：

```text
PBS raw records
raw Marshal graph
raw Resource metadata
raw project data
```

### 11.2 CanonicalDataset

表达“v21.1 compiler/runtime 将数据规范化后是什么”：

```text
schema cast
compatibility migration
defaults
local normalization
global compiler finalization
resolved typed references
RMXP typed structural model
hardcoded GameData
```

### 11.3 DerivedSemanticDataset

表达 importer 的高层业务推导：

```text
MapEvent classified as trainer
known warp
known item event
known battle helper
known message/choice semantics
```

规则：

```text
RPG::Event = canonical fact
Trainer NPC = derived semantic interpretation
```

Derived 层错误不得破坏 Canonical 层事实。

---

## 12. PBS：复现 v21.1 compiler，而不是通用 INI parser

### 12.1 Generic syntax layer

PBS generic parser 只负责：

```text
UTF-8 / supported BOM
comments
whitespace
section
key=value
repeated properties
Essentials CSV grammar
source provenance
```

它不知道 Pokémon、Move 或 Item。

### 12.2 Schema registry

v21.1 adapter 提供：

```text
PBS_BASE_FILENAME
SCHEMA
field target names
cast grammar
enum/reference targets
repeated-field semantics
compile order
```

例如：

```text
pokemon
pokemon_forms
```

都属于 Species domain，但 schema 和 post-processing 不完全相同。

### 12.3 Precompile compatibility pass

必须复现 v21.1 在正式 compile 前的 compatibility rewrite。

已知示例：

```text
VictoryME  → VictoryBGM
BaseDamage → Power
```

Raw Resource 不修改；变换发生在 Canonical pipeline。

provenance 可记录：

```ts
interface FieldProvenance {
  readonly sourceField: string;
  readonly canonicalField: string;
  readonly transformation?: string;
}
```

### 12.4 Compiler pass pipeline

```text
PBS Syntax IR
    ↓
Precompile Compatibility
    ↓
Schema Cast
    ↓
Local Normalize
    ↓
Defaults
    ↓
Cross-record Resolve
    ↓
Global Finalize
    ↓
Canonical GameData
```

这些 pass 分文件实现，不允许重新变成一个巨型 `compiler.mjs`。

### 12.5 Provenance

每个 canonical record 至少能追溯：

```text
source file
section / record identity
explicit fields
compatibility-transformed fields
```

Raw PBS 已由 Resource 保存，因此 structured JSON 不必重复完整源文本。

---

## 13. PBS coverage 由 Registry 驱动

实现顺序可以 vertical slice，但最终 coverage 不能通过人工列表判断。

第一批可以：

```text
Type
Ability
Move
Item
Species
```

但完成条件是：

```text
VanillaRegistry.pbsFamilies
→ every family classified
→ every required family supported
→ optional family absence explicitly represented
```

至少应包括 v21.1 官方 compiler 涉及的：

```text
TownMap
Connection
Type
Ability
Move
Item
BerryPlant
Species
SpeciesForm
SpeciesMetrics
ShadowPokemon
RegionalDex
Ribbon
Encounter
TrainerType
Trainer
BattleFacility
Metadata
MapMetadata
DungeonTileset
DungeonParameters
PhoneMessage
```

以及 Registry 中从固定 v21.1 source 审计得到的其他 vanilla family。

文档中的列表是说明，不是 authority；`VanillaRegistry` 才是 authority。

---

## 14. Hardcoded GameData 必须进入 Canonical Dataset

Essentials 并非所有业务枚举都来自 PBS。

v21.1 的 hardcoded data 至少包括类似：

```text
GrowthRate
GenderRatio
EggGroup
BodyShape
BodyColor
Habitat
Evolution
Stat
Nature
...
```

这些数据会被 PBS schema、default、reference resolution 和 runtime logic 使用。

因此不能只把它们当 importer 内部 magic constants。

设计：

```text
vanilla-registry
    ↓
hardcoded-data
    ↓
CanonicalDataset
```

FSDB mapper SHOULD 对具有稳定业务 identity 的 hardcoded domain 生成结构化表，例如：

```text
[struct]GrowthRate
[struct]GenderRatio
[struct]EggGroup
[struct]BodyShape
[struct]BodyColor
[struct]Habitat
[struct]EvolutionMethod
[struct]Stat
[struct]Nature
```

这样 `Pokemon.growthRate`、`Pokemon.evolutions[].method` 等引用可以真正闭合在 FSDB 内，而不是依赖 importer 外部隐式知识。

具体表名/字段以真实 consumer 和 FSDB identity 评审后冻结。

---

## 15. Ruby Marshal：先无损 graph decode

`.rxdata` / `.dat` 首先进入 Ruby Marshal decoder，而不是直接进入 Map parser。

### 15.1 Neutral graph IR

Decoder 必须保留：

```text
nil
boolean
fixnum / bignum where applicable
float
string + ivars/encoding
symbol
array
hash
regexp where encountered
struct where encountered
object
class/module refs
instance variables
object links
symbol links
extended object forms
user-defined/user-class/user-marshal payload where encountered
```

内部模型应能表达 shared identity：

```ts
interface MarshalGraph {
  readonly root: MarshalRef;
  readonly objects: ReadonlyMap<number, MarshalNode>;
}
```

不要先转成会破坏共享引用或 cycles 的普通 JSON tree。

### 15.2 TagRegistry

Marshal support 不通过“我们记得有哪些 tag”证明完整。

运行时记录：

```text
encountered tags
handled tags
invalid tags
unsupported encountered tags
```

vanilla full corpus qualification 必须满足：

```text
unsupported encountered Marshal tags = 0
invalid reference = 0
discarded nodes = 0
```

### 15.3 Unknown class

```text
known class
    → typed decoder + extra ivars

unknown class
    → GenericRubyObject { className, ivars/payload }
```

未知 class 本身不是 structural failure。

只有无法保证 Marshal graph 无损时才 `MARSHAL_UNSUPPORTED` / `MARSHAL_INVALID`。

---

## 16. RMXP / RGSS structural layer

Marshal 之上实现 RPG Maker XP / RGSS typed views。

候选包括：

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
RGSS Table
Color
Tone
...
```

同样，文档列表不是 completeness authority。

最终要求：

```text
所有 official v21.1 corpus 中遇到的 class
→ typed view 或 generic preservation
```

known class decoder 必须：

```text
known fields
+
extra/unknown ivars
```

不得因为 typed decoder 没声明某个 ivar 就把它丢掉。

### 16.1 ClassRegistry

```text
rmxp/class-registry.mjs
```

负责 className → decoder 映射和 coverage accounting。

Qualification 关键指标：

```text
discarded ivars = 0
discarded EventCommand = 0
```

---

## 17. Map / Event 完整解析

### 17.1 Map

Map 至少保留：

```text
map id / MapInfo
width / height
tileset id
tile Table data
autoplay flags
BGM / BGS
events
all known RPG::Map fields
extra ivars
```

### 17.2 Event

```text
RPG::Event != NPC
```

Event 可能代表：

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

Canonical identity 首先是 `MapEvent`。

每个 Event：

```text
id
name
x / y
pages[]
extra ivars
```

Page：

```text
conditions
graphic
movement settings
move route
animation flags
priority / through / direction behavior
trigger
commands[]
extra ivars
```

### 17.3 EventCommand

所有 EventCommand 先保存 structural form：

```json
{
  "code": 355,
  "indent": 0,
  "parameters": ["..."]
}
```

known command 可增加 semantic view；unknown code 仍必须保留。

---

## 18. Essentials Event semantics 是 Derived 层

RMXP structural decode 后，再识别 v21.1 known semantics：

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

Ruby Script event：

```text
known, safely parseable form
    → semantic extraction + raw script

unknown/arbitrary Ruby
    → raw script + opaque semantic diagnostic
```

禁止实现“为了完整而执行脚本”。

不实现通用 Ruby interpreter。

指标：

```text
semantic known
semantic opaque
semantic unclassified
```

可以非零，但必须可计量。

---

## 19. Compiler-derived data 不能遗漏

v21.1 的完整 static-data pipeline 不止 `PBS + 原始 MapXXX.rxdata`。

官方 compile 主流程还包含类似：

```text
compile PBS
compile animations
compile trainer events
collect script/event translatable text
save/load message data
```

因此 v1 full-data importer 的 scope 必须包含对应的静态结果/语义：

### 19.1 Trainer-event compiler effects

需要区分：

```text
raw RMXP Event
    ↓
v21.1 compiler-normalized Event
    ↓
derived trainer/event semantics
```

不能把 compiler 会修改/规范化的 Event 直接当成原始对象语义。

### 19.2 Messages / localization

应识别并保留：

```text
PBS translatable fields
script/event translatable text
compiled message data where present
```

第一版可以不构建完整国际化 runtime，但不能把 message extraction 路径排除在 completeness accounting 之外。

### 19.3 Animation-related data

官方 compile pass 中涉及的 animation static data 必须进入 Registry 和 Source Manifest classification。

如果 importer 暂时只做 structural preservation，必须在 coverage 中明确标记，而不是从“完整数据”口径里消失。

---

## 20. Compiled `.dat`：corpus + oracle candidate

如果 distribution 包含由 Essentials compiler 生成的 `Data/*.dat`：

```text
raw PBS source
compiled GameData representation
our CanonicalDataset
```

必须作为三个不同层次处理。

Compiled `.dat` 可以用于：

```text
Marshal structural coverage
semantic cross-check
Oracle candidate
```

但不得因为 `.dat` 已存在就跳过 PBS compiler-compatible parser，也不得因为 PBS 可解析就忽略 compiled data。

---

## 21. FSDB Mapping 原则

FSDB 表型由业务 identity 决定，不为了“覆盖四种类型”而强拆。

### 21.1 Struct

```text
one Key = one entity
```

候选：

```text
Type
Ability
Move
Item
Pokemon
TrainerType
Trainer
Map
Tileset
CommonEvent
Hardcoded GameData domains
```

### 21.2 Extend

只用于真正依附于基础 Struct 的扩展：

```text
PokemonForm
MapMetadata
```

具体 identity 必须通过真实 corpus/consumer 冻结。

### 21.3 Group

```text
one Key = ordered records
```

候选：

```text
Encounter
MapEvent
MapConnection
```

EventCommand 是嵌入 MapEvent 还是独立 Group，不提前冻结；按真实访问模式和数据规模决定。

### 21.4 Resource

Raw authority 始终保留：

```text
Graphics
Audio
Fonts
Data
PBS
Plugins (if present)
```

---

## 22. Streaming-safe immutable FSDB Plan

所有输出 identity 必须在写盘前确定，但不要求整个 corpus 的实际 bytes/JSON 一次性驻留内存。

概念模型：

```ts
interface PlannedObject {
  readonly identity: FsdbIdentity;
  readonly size?: bigint;
  readonly digest?: string;
  readonly references: readonly FsdbReference[];
  readonly metadata: PlannedMetadata;
  open(): AsyncIterable<Uint8Array>;
}

interface ImportPlan {
  readonly objects: readonly PlannedObject[];
  readonly diagnostics: readonly Diagnostic[];
  readonly coverage: CoverageReport;
}
```

Plan 冻结：

```text
identity
output path
metadata
schema
references
size/hash where available
content producer/spool reference
```

Plan 阶段必须完成：

```text
FSDB NameSegment validation
TableIdentity uniqueness
ResourceKey collision
normalization collision
reference validation where known
schema consistency
output path collision
coverage hard-invariant validation
```

这样既保持：

```text
validate before materialize
```

又允许：

```text
large Resource → stream
large Map/table → stream/spool
JSONL → incremental encode
```

---

## 23. FSDB Integrity 是 mandatory gate

旧的“optional integrity validation”不再适用于 full-data importer。

成功输出必须满足：

```text
Plan validation PASS
+
FSDB Well-formed PASS
+
generated schema validation PASS
+
known reference integrity PASS
```

对于无法理解的 opaque semantic 数据：

```text
不要伪造 reference
```

因此未知 Ruby 语义不会成为降低已知 FSDB integrity 的理由。

Production `openFsdb()` 仍是最低 production adapter gate，但不等于完整 Integrity validation。

---

## 24. Output Transaction

流程：

```text
acquire
→ source identity
→ manifest
→ classify
→ raw/semantic decode
→ canonical dataset
→ derived semantic dataset
→ build immutable plan
→ validate plan + coverage + integrity
→ reserve output
→ create staging
→ materialize
→ production openFsdb(staging)
→ integrity validator
→ promote
→ cleanup
```

失败：

```text
remove importer-owned staging
remove importer-owned temp/download/extraction
never mutate borrowed source
never mutate previous successful fixture
```

`transaction.mjs` 独占 ownership / reserve / promote / cleanup 逻辑。

业务 parser 不删除目录。

---

## 25. CoverageReport：从统计升级为 contract

```ts
interface CoverageReport {
  readonly physical: PhysicalCoverage;
  readonly registry: RegistryCoverage;
  readonly pbs: PbsCoverage;
  readonly marshal: MarshalCoverage;
  readonly rmxp: RmxpCoverage;
  readonly semantic: SemanticCoverage;
  readonly integrity: IntegrityCoverage;
}
```

### 25.1 Hard invariants

以下必须为 0：

```text
physical.unclassifiedRecognisedObjects
registry.unhandledRequiredFamilies
pbs.unclassifiedVanillaFiles
pbs.discardedProperties
marshal.unsupportedEncounteredTags
marshal.invalidReferences
marshal.discardedNodes
rmxp.discardedIvars
rmxp.discardedEventCommands
integrity.identityCollisions
integrity.knownBrokenReferences
```

### 25.2 允许非零但必须报告

```text
rmxp.genericUnknownClasses
semantic.opaqueRubyScripts
semantic.unclassifiedEventMeaning
semantic.knownPluginUnsupported
```

原则：

> 允许不知道某段业务代码是什么意思；不允许不知道自己漏了什么，也不允许静默丢掉。

---

## 26. Oracle Qualification：RC 必须执行

Oracle 不再只是 optional nice-to-have。

CI 与 full-corpus qualification 分开。

### 26.1 Normal CI

仓库内 synthetic fixture：

```text
mandatory
redistributable
small
stable
```

### 26.2 Full-data RC qualification

RC qualification 使用本地官方 v21.1 corpus：

```text
official v21.1 source
 ├→ our importer → CanonicalDataset
 └→ original v21.1 behavior → Oracle export
                              ↓
                            diff
```

比较对象是 canonical semantic result，不要求 FSDB physical layout 与原版一致。

Oracle diff 分类：

```text
expected/intentional representation difference
known opaque semantic
known upstream oddity
unclassified difference
```

RC gate：

```text
unclassified oracle diff = 0
```

Allowlist 必须显式、可审计、具体到 domain/path/reason。

Oracle runner 是开发/qualification 工具，不是正式 importer runtime dependency。

---

## 27. Diagnostics / Report

成功报告至少包含：

```text
Source
  acquisition mode
  files / bytes
  registry version

Raw
  preserved files
  byte verification
  explicitly excluded objects

PBS
  expected families
  discovered files
  sections/records
  compatibility rewrites
  unsupported properties
  reference failures

Hardcoded GameData
  domains expected / materialized

Marshal
  files decoded
  nodes
  encountered tags
  unsupported tags
  generic objects

RMXP
  classes encountered
  typed classes
  generic classes
  maps/events/pages/commands
  extra ivars preserved

Compiler-derived
  trainer-event transformations
  messages
  animation data status

Semantic
  known event semantics
  opaque Ruby
  unclassified meaning

FSDB
  tables / records / resources
  well-formed validation
  integrity validation

Oracle
  compared domains
  allowlisted diffs
  unclassified diffs
```

报告应明确最终：

```text
Physical completeness
Structural completeness
Semantic coverage
Integrity status
Oracle qualification status
```

---

## 28. Failure categories

CLI 输出稳定 category，不暴露底层异常作为 contract。

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
SOURCE_CLASSIFICATION_FAILURE

REGISTRY_COVERAGE_FAILURE

PBS_SYNTAX_FAILURE
PBS_SCHEMA_FAILURE
PBS_REFERENCE_FAILURE
PBS_COMPATIBILITY_FAILURE

HARDCODED_DATA_FAILURE

MARSHAL_INVALID
MARSHAL_UNSUPPORTED
RMXP_DECODE_FAILURE
ESSENTIALS_SEMANTIC_FAILURE

FSDB_NAME_FAILURE
FSDB_IDENTITY_COLLISION
FSDB_PLAN_FAILURE
FSDB_INTEGRITY_FAILURE
COPY_FAILURE
FSDB_VALIDATION_FAILURE

ORACLE_MISMATCH
```

Unknown semantic object 通常是 diagnostic，不是 failure。

只有无法保证结构无损、identity、已知 integrity 或 RC Oracle gate 时才 fail closed。

---

## 29. Test Strategy

### 29.1 Unit tests

```text
CLI parsing
redirect bounds
landing resolver
ZIP traversal / duplicate / symlink
UTF-8 filename handling
SourceManifest classification
VanillaRegistry completeness
PBS comments/BOM/section/repeated fields
Essentials CSV edge cases
precompile compatibility rewrite
schema cast/default/normalize/finalize
hardcoded GameData references
Marshal tag matrix
Marshal shared refs/cycles
RGSS Table
RPG classes + extra ivars
EventCommand
semantic classifier
FSDB plan collision/integrity
transaction cleanup
```

### 29.2 Synthetic integration corpus

仓库只提交自造、可再分发的 fixture：

```text
PBS sample
small synthetic Marshal/RMXP blobs
fake Graphics/Audio
Map with multiple Event pages
known + unknown EventCommand
unknown Ruby class
extra ivars
normalization collision
reference failure
```

### 29.3 Local full corpus

完整 Pokémon Essentials v21.1 distribution 本地验证：

```text
full import
→ hard coverage invariants
→ openFsdb PASS
→ integrity PASS
→ HTTP fixture smoke test
→ original v21.1 Oracle diff
→ unclassified diff = 0
```

第三方素材不得进入 repo/npm artifact。

---

## 30. 实现顺序

不要一次重写所有能力。

### Stage 1 — 拆旧 importer，行为等价

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

先把现有逻辑迁出 `import.mjs`，existing tests 等价 PASS。

### Stage 2 — SourceManifest + acquisition closure

```text
complete inventory
hash/fingerprint
NFC writer
Plugins detection
classification
```

### Stage 3 — VanillaRegistry + completeness accounting

在任何复杂 semantic parser 之前先冻结：

```text
expected PBS families
compiled data roots
hardcoded domains
compiler passes
RMXP roots
```

之后每个 Stage 都能报告：

```text
expected X
implemented Y
remaining Z
```

### Stage 4 — PBS syntax + compiler pipeline

```text
lexer
CSV
cast
provenance
precompile compatibility
normalize/default/resolve/finalize
```

先 vertical slice：

```text
Type
Ability
Move
Item
Species
```

再由 Registry 驱动覆盖全部 vanilla PBS family。

### Stage 5 — Hardcoded GameData + reference closure

建立硬编码 domain，并让 PBS typed reference 可以闭合到 CanonicalDataset。

### Stage 6 — Lossless Ruby Marshal

先完成 neutral graph structural completeness 和 tag coverage，再做 RPG typed class。

### Stage 7 — RMXP/RGSS structural decode

```text
Table
MapInfo
Map
Event
Page
EventCommand
MoveRoute
MoveCommand
CommonEvent
Tileset
System
other encountered classes
```

### Stage 8 — Compiler-derived / Essentials semantics

```text
trainer event compiler effects
messages/localization
animation static-data coverage
known helper/event semantics
```

Unknown Ruby 保持 opaque。

### Stage 9 — FSDB integrity + Oracle qualification

```text
streaming-safe plan
full integrity validation
official full corpus
original v21.1 oracle
zero unclassified diff
```

---

## 31. RC 完成标准

v1 full-data importer 进入 RC 必须满足：

```text
CLI 仍只有 --source / --output
local directory / local ZIP / auto-download 可用
import.mjs 为薄 composition root
raw corpus byte preservation 可验证
SourceManifest 无 recognised omission
VanillaRegistry required family coverage = 100%
PBS vanilla required family structural coverage = 100%
Hardcoded GameData required domains materialized
PBS compatibility/default/normalize/reference behavior经过 Oracle 对齐
Marshal unsupported encountered tags = 0
Marshal discarded nodes = 0
RMXP discarded ivars = 0
EventCommand discarded = 0
Map/Event structural decode 完整
unknown Ruby/Event semantics raw-preserved
FSDB identity validation PASS
FSDB Well-formed PASS
FSDB Integrity PASS
production openFsdb() PASS
coverage hard invariants PASS
synthetic CI PASS
official v21.1 full-corpus qualification PASS
Oracle unclassified diff = 0
third-party corpus 不进入 repo/npm
```

Semantic 分类不要求任意 Ruby 行为达到 100%，但必须：

```text
known
opaque
unclassified
```

三者可计量且 raw data 可追溯。

最终目标定义为：

> **对 vanilla Pokémon Essentials v21.1 的可观测静态数据尽可能完整结构化；所有 recognised 数据都有明确处理路径；所有未知部分无损保留并显式计量；所有已知结构和引用通过 FSDB integrity 验证；最终结果通过原版 v21.1 Oracle 对比证明没有未分类语义偏差。**
