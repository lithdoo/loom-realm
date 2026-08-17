# Pokémon Essentials v21.1 → FSDB Implementation Roadmap

> 状态：Draft  
> 本文是 `DESIGN.md` 的执行计划。`DESIGN.md` 定义最终架构、authority、completeness 与 invariants；本文只定义实现顺序、阶段边界、测试和退出条件。  
> 原则：每个 Stage 都必须形成可运行、可验证、可提交的闭环；禁止跨多个 Stage 同时大范围改动。

---

## 1. 推进原则

完整 importer 不采用“一次重写完成”的方式落地，而采用：

```text
freeze boundary
→ implement one vertical slice
→ synthetic conformance
→ Oracle where applicable
→ coverage accounting
→ FSDB/integration validation
→ stable commit boundary
→ next slice
```

实现过程中始终保持：

```text
unknown != discarded
```

允许 semantic coverage 暂时不完整，但不允许 recognised data 被静默遗漏。

每个 Stage 完成后都必须能够回答：

```text
expected capability = ?
implemented capability = ?
remaining capability = ?
new discarded-data path = 0
```

---

## 2. 先冻结的实现级模型

开始复杂 parser 前，先冻结以下小接口/数据模型。具体 `.mjs` 文件可以使用 JSDoc typedef 或 TypeScript declaration 风格描述；不要为了类型定义引入新的 runtime package。

### 2.1 Acquisition / source

```ts
interface AcquiredSource {
  readonly root: string;
  readonly mode: "local-directory" | "local-zip" | "auto-download";
  close(): Promise<void>;
}

interface SourceManifest {
  readonly version: "21.1";
  readonly root: string;
  readonly objects: readonly SourceObject[];
}
```

### 2.2 Completeness authority

```ts
interface VanillaRegistry {
  readonly pbsFamilies: readonly PbsFamilyDefinition[];
  readonly compiledData: readonly CompiledDataDefinition[];
  readonly hardcodedDomains: readonly HardcodedDomainDefinition[];
  readonly rmxpRoots: readonly RmxpRootDefinition[];
  readonly compilerPasses: readonly CompilerPassDefinition[];
}
```

### 2.3 Dataset boundaries

```text
RawDataset
    source facts only

CanonicalDataset
    v21.1 compiler/runtime-compatible facts

DerivedSemanticDataset
    higher-level interpretations such as trainer NPC / warp / item event
```

### 2.4 FSDB output

```ts
interface PlannedObject {
  readonly identity: FsdbIdentity;
  readonly references: readonly FsdbReference[];
  readonly size?: bigint;
  readonly digest?: string;
  open(): AsyncIterable<Uint8Array>;
}

interface ImportPlan {
  readonly objects: readonly PlannedObject[];
  readonly diagnostics: readonly Diagnostic[];
  readonly coverage: CoverageReport;
}
```

### 2.5 Coverage

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

这些模型形成模块之间的边界。Parser 不直接写 FSDB；FSDB mapper 不读取原始 filesystem；CLI 不理解 domain algorithm。

---

## 3. Stage 1 — Refactor legacy baseline

### Scope

只拆当前 `import.mjs`，**不改变任何可观察行为，也不加入 PBS/Marshal 新功能**。

### Target files

```text
import.mjs
lib/errors.mjs
lib/cli.mjs
lib/importer.mjs
lib/report.mjs
lib/acquisition/source.mjs
lib/acquisition/download.mjs
lib/acquisition/eevee-expo.mjs
lib/acquisition/zip.mjs
lib/acquisition/temporary.mjs
lib/source/identity.mjs
lib/source/names.mjs
lib/source/fingerprint.mjs
lib/fsdb/raw-resources.mjs
lib/fsdb/transaction.mjs
lib/fsdb/writer.mjs
lib/fsdb/validate.mjs
```

### Required result

`import.mjs` 只保留：

```text
parse CLI
→ construct dependencies
→ importEssentialsV21_1()
→ print result/error
→ set exitCode
```

### Tests

现有 `import.test.mjs` 保持等价通过，并补模块化后的：

```text
CLI
ZIP safety
download resolver
transaction cleanup
```

### Exit criteria

```text
semantic behavior change = 0
existing fixture behavior equivalent
existing failure categories equivalent
local directory import PASS
local ZIP import PASS
auto-download behavior retained
production openFsdb validation retained
import.mjs contains no independent domain algorithm
```

---

## 4. Stage 2 — SourceManifest + acquisition closure

### Scope

建立完整 physical inventory，不做复杂 semantic parse。

### Required modules

```text
lib/source/manifest.mjs
lib/source/reader.mjs
```

### Required behavior

Manifest 必须分类每个 recognised source object：

```text
raw-preserved
parsed
opaque-preserved
explicitly-excluded
```

不得存在无解释的 recognised `unclassified`。

同时关闭：

```text
physical UTF-8 filename
NFC writer spelling
symlink/junction rejection
source fingerprint/change detection
ResourceKey collision
case-portability diagnostics
Plugins detection
```

### Exit criteria

```text
physical.unclassifiedRecognisedObjects = 0
source mutation during import detected
NFC target-name conformance test PASS
raw byte-preservation test PASS
```

---

## 5. Stage 3 — VanillaRegistry + completeness accounting

### Scope

在复杂 semantic parser 之前建立 v21.1 completeness authority。

### Required modules

```text
lib/essentials/v21.1/vanilla-registry.mjs
lib/model/coverage.mjs
```

Registry 固定审计 v21.1：

```text
GameData PBS_BASE_FILENAME registry
Compiler.get_all_pbs_files_to_compile
Compiler.compile_pbs_files
GameData.get_all_data_filenames
Compiler.compile_all
RMXP Data roots
hardcoded GameData definitions
```

### Required output

即使 semantic implementation 仍为空，也应能报告：

```text
expected families
implemented families
remaining families
compiled-data roots
hardcoded domains
compiler passes
RMXP roots/classes observed
```

### Exit criteria

```text
Registry 有固定 v21.1 source traceability
expected - classified 可计算
Registry 新增 required family 会使 coverage gate 失败
coverage report deterministic
```

从这一 Stage 开始，后续每次实现都必须同步 coverage accounting。

---

## 6. Stage 4 — Generic PBS substrate

### Scope

只实现 reusable PBS engine，不一次实现所有 GameData domain。

### Modules

```text
lib/pbs/lexer.mjs
lib/pbs/csv.mjs
lib/pbs/cast.mjs
lib/pbs/parser.mjs
lib/pbs/provenance.mjs
lib/essentials/v21.1/compiler/precompile.mjs
lib/essentials/v21.1/compiler/schema-cast.mjs
lib/essentials/v21.1/compiler/normalize.mjs
lib/essentials/v21.1/compiler/defaults.mjs
lib/essentials/v21.1/compiler/resolve.mjs
lib/essentials/v21.1/compiler/finalize.mjs
```

### Synthetic conformance

必须覆盖：

```text
UTF-8 / BOM
comments / whitespace
section syntax
repeated property
quoted CSV
all used cast grammar
invalid integer/enum/reference
compatibility rewrite
provenance
```

### Exit criteria

```text
PBS parser 不知道 FSDB
compiler passes 不做 filesystem writes
raw source 不被 compatibility rewrite 修改
pbs.discardedProperties = 0
```

---

## 7. Stage 5 — Simple GameData + early Oracle

### Scope

用简单 domain 验证 PBS compiler substrate：

```text
Type
Ability
Move
Item
```

不要从 Species 开始。

### Required behavior

每个 domain 同时完成：

```text
schema
cast
local normalize
defaults
reference resolution
CanonicalDataset representation
coverage accounting
Oracle export/diff
```

### Oracle rule

Oracle 不等到 full-corpus Stage 才第一次使用。

从这个 Stage 起，每个已实现 GameData domain 都要支持：

```text
our canonical domain
vs
original v21.1 resolved domain
```

### Exit criteria

每个已实现 domain：

```text
synthetic tests PASS
real v21.1 sample/corpus parse PASS
unclassified Oracle diff = 0
no direct FSDB dependency
```

---

## 8. Stage 6 — Hardcoded GameData + Species reference closure

### Scope

**先实现 hardcoded GameData，再实现 Species。**

### Hardcoded domains

由 `VanillaRegistry` 决定，至少包括实际 v21.1 使用的：

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

### Then Species

再实现：

```text
Species
SpeciesForm
SpeciesMetrics
```

使以下引用真正进入 CanonicalDataset：

```text
types
stats
growth rate
gender ratio
abilities
moves
items
evolution method/parameter
forms
```

### Exit criteria

```text
Species implementation 不含临时 magic compatibility constants
required hardcoded domains materialized
known Species references fully resolved
Species Oracle unclassified diff = 0
```

---

## 9. Stage 7 — Full vanilla PBS coverage

### Scope

由 Registry 驱动逐项关闭剩余 PBS family，而不是再维护人工 TODO 列表。

可能包括：

```text
TownMap
Connection
BerryPlant
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
...
```

### Exit criteria

```text
registry.unhandledRequiredFamilies = 0
pbs.unclassifiedVanillaFiles = 0
pbs.discardedProperties = 0
all implemented canonical domains have Oracle classification
```

---

## 10. Stage 8 — Lossless Ruby Marshal core

### Scope

只做：

```text
bytes → MarshalGraph
```

不直接做 Map JSON。

### Required support

按完整 v21.1 corpus encountered tag 驱动：

```text
scalar values
symbols + symbol links
strings + ivars/encoding
arrays / hashes
objects
object links
class/module refs
regexp / struct where encountered
extended/user-defined/user-class/user-marshal forms where encountered
shared refs / cycles
```

### Exit criteria

```text
marshal.unsupportedEncounteredTags = 0
marshal.invalidReferences = 0
marshal.discardedNodes = 0
shared identity preserved
unknown class can remain generic
```

---

## 11. Stage 9 — RMXP/RGSS structural layer

### Scope

```text
MarshalGraph → typed/generic RMXP model
```

优先实现：

```text
Table
Color
Tone
AudioFile
MapInfo
Map
Event
EventPage
EventCommand
MoveRoute
MoveCommand
CommonEvent
Tileset
System
```

所有其他 encountered class：

```text
known → typed view + extra ivars
unknown → GenericRubyObject
```

### Exit criteria

```text
rmxp.discardedIvars = 0
rmxp.discardedEventCommands = 0
all official corpus encountered classes typed or generic-preserved
Map/Event structural round-trip comparison fixtures PASS
```

---

## 12. Stage 10 — Essentials compiler-derived / semantic layer

### Scope

在 canonical RMXP facts 之上实现：

```text
trainer-event compiler effects
message/localization extraction
animation static-data classification
known Essentials event/helper semantics
```

### Boundary

```text
RPG::Event       = canonical fact
Trainer NPC      = derived interpretation
Ruby script text = canonical/raw fact
helper-call meaning = derived interpretation
```

禁止执行 arbitrary project Ruby。

### Exit criteria

```text
all compiler passes in VanillaRegistry classified
compiler-derived static data accounted
semantic.opaqueRubyScripts explicitly counted
semantic.unclassifiedEventMeaning explicitly counted
no semantic classifier mutates canonical facts
```

---

## 13. Stage 11 — FSDB mapper + integrity closure

### Scope

直到 CanonicalDataset 足够稳定后，才冻结完整 FSDB mapping。

### Required modules

```text
lib/fsdb/mapper.mjs
lib/fsdb/plan.mjs
lib/fsdb/structured.mjs
lib/fsdb/schemas.mjs
lib/fsdb/integrity.mjs
```

### Required behavior

Parser 不直接选择 output path；mapper 决定：

```text
Struct
Extend
Group
Resource
```

`FsdbPlan` 是 materialization 前 commit barrier。

Plan 必须在写盘前完成：

```text
TableIdentity uniqueness
NameSegment/ResourceKey validation
NFC output spelling
normalization collision
schema consistency
known reference integrity
coverage hard gates
```

### Exit criteria

```text
FSDB Plan validation PASS
FSDB Well-formed PASS
known reference integrity PASS
streaming/spooled content producer works
no full-corpus byte buffering requirement
```

---

## 14. Stage 12 — Full-corpus qualification / RC

### Scope

使用本地官方 Pokémon Essentials v21.1 corpus 做最终 qualification。

### Mandatory pipeline

```text
full import
→ coverage hard gates
→ FSDB Plan integrity
→ materialize
→ production openFsdb PASS
→ full Integrity PASS
→ HTTP smoke test
→ original v21.1 Oracle diff
→ qualification
```

### RC gates

```text
physical.unclassifiedRecognisedObjects = 0
registry.unhandledRequiredFamilies = 0
pbs.unclassifiedVanillaFiles = 0
pbs.discardedProperties = 0
marshal.unsupportedEncounteredTags = 0
marshal.invalidReferences = 0
marshal.discardedNodes = 0
rmxp.discardedIvars = 0
rmxp.discardedEventCommands = 0
integrity.identityCollisions = 0
integrity.knownBrokenReferences = 0
Oracle unclassified diff = 0
```

允许非零但必须显式报告：

```text
rmxp.genericUnknownClasses
semantic.opaqueRubyScripts
semantic.unclassifiedEventMeaning
```

---

## 15. 统一 Definition of Done

每一个 Stage 都使用相同验收模板：

```text
Implementation
    PASS

Synthetic tests
    PASS

Coverage accounting
    PASS

New discarded-data path
    0

Dependency direction
    PASS

Relevant Oracle comparison
    PASS / explicitly N/A

FSDB/integration regression
    PASS / explicitly N/A

Documentation invariants
    unchanged or explicitly updated
```

禁止：

```text
implementation now
conformance later
```

每个稳定 commit 本身就应是一个小闭环。

---

## 16. Commit / review discipline

一个 Stage 可以拆成多个小 commit，但不能在同一 commit 中混入不相关 Stage 的 domain change。

推荐：

```text
refactor
→ tests
→ one domain slice
→ oracle/conformance
→ coverage update
```

Review 时优先检查：

```text
boundary 是否变模糊
是否出现 dependency inversion
是否新增 silent discard
是否为了 semantic coverage 做不可靠猜测
是否绕过 VanillaRegistry
是否绕过 FsdbPlan 直接写盘
```

---

## 17. 当前第一步

当前代码仍是 legacy 单文件 importer，因此立即开始：

```text
Stage 1 — Refactor legacy baseline
```

此阶段明确禁止顺手实现：

```text
PBS semantic parser
Ruby Marshal
Map/Event semantic
new FSDB structured tables
```

Stage 1 完成并建立稳定 commit 后，再进入：

```text
Stage 2 — SourceManifest
Stage 3 — VanillaRegistry + CoverageReport
```

只有 completeness authority 建立后，才开始大规模 semantic implementation。
