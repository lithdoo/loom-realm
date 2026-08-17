# Pokémon Essentials v21.1 PBS → FSDB Structured Data 草案

> 状态：Draft  
> 目标：基于 Phase A 已生成的 FSDB fixture，对 `[resource]PBS` 中的 Pokémon Essentials v21.1 PBS 源数据进行二次语义解析，并生成 FSDB `struct / extend / group` 结构化表。  
> 本阶段不重新读取 Pokémon Essentials 原始目录，也不承担素材下载、解压或 Resource 导入职责。

---

## 1. 定位

现有 `import.mjs` 保持单一职责：

```text
Pokémon Essentials v21.1 source
        ↓
import.mjs
        ↓
FSDB Resource corpus
```

新增第二阶段工具：

```text
FSDB Resource corpus
        ↓
structure.mjs
        ↓
FSDB Structured tables
```

完整开发链路：

```text
Essentials source
    ↓
raw import
    ↓
[resource]Graphics / Audio / Fonts / Data / PBS
    ↓
PBS semantic transform
    ↓
[struct] / [extend] / [group]
```

两个阶段必须独立：

- `import.mjs` 不理解 PBS 业务语义；
- `structure.mjs` 不理解下载、ZIP、原始 Essentials checkout；
- 第二阶段只依赖一个已经存在且可读取的 FSDB；
- 原始 `[resource]PBS` 保留，不被删除或改写。

---

## 2. 输入与输出

### 2.1 输入

输入是 Phase A 已生成的 FSDB root，例如：

```text
[FSDB]Essentials v21.1/
├── [resource]Graphics/
├── [resource]Audio/
├── [resource]Fonts/
├── [resource]Data/
├── [resource]PBS/
└── [struct]测试信息/
```

结构化转换只读取：

```text
[resource]PBS/**
```

它不得回退到原始 Essentials filesystem path。

### 2.2 输出

第二阶段在同一个 FSDB database 中新增结构化表，例如：

```text
[FSDB]Essentials v21.1/
├── [resource]PBS/
│   └── ...原始 PBS source 保留
│
├── [struct]Ability/
├── [struct]Type/
├── [struct]Move/
├── [struct]Item/
├── [struct]Pokemon/
├── [extend]PokemonForm/
├── [group]Encounter/
│
└── ...existing resource tables
```

第二阶段不得把原始 PBS Resource 当作临时文件删除。

---

## 3. TableKind 映射原则

不要把所有 PBS 数据机械转换为 `[struct]`。

FSDB 表型按业务基数选择：

```text
一个 Key 对应一个实体
    → [struct]

一个实体是基础实体的附加/扩展数据，并显式引用基础 Struct
    → [extend]

一个 Key 对应一组有序 records
    → [group]

原始文本、图片、音频、二进制以及需要保留的 source artifact
    → [resource]
```

是否使用 Group 取决于业务模型，而不是 JSON 中是否出现数组。

例如 Trainer 内部存在 party array，并不自动意味着 Trainer 应成为 Group。

---

## 4. 第一批目标映射

第一版按 vertical slice 推进，不一次实现全部 PBS。

### 4.1 Struct

优先实现：

```text
abilities*.txt
    → [struct]Ability

types*.txt
    → [struct]Type

moves*.txt
    → [struct]Move

items*.txt
    → [struct]Item

pokemon*.txt
    → [struct]Pokemon
```

FSDB Key 使用 Essentials 的稳定业务 identifier，而不是显示名称。

例如：

```text
[BULBASAUR]
Name = Bulbasaur
...
```

生成：

```text
[struct]Pokemon/BULBASAUR.json
```

而不是：

```text
[struct]Pokemon/Bulbasaur.json
```

显示名只作为 record data。

### 4.2 Extend

Pokémon form 数据优先作为第一个 Extend vertical slice：

```text
pokemon_forms*.txt
    → [extend]PokemonForm
```

示例 record：

```json
{
  "pokemon": "CHARIZARD",
  "form": 1,
  "name": "...",
  "types": ["FIRE", "DRAGON"]
}
```

`.extend.meta` 至少声明基础 Pokémon 引用：

```jsonl
{"field":"pokemon","struct":"Pokemon","desc":"Base Pokémon species"}
```

具体 key 编码必须满足 FSDB Key 规则并保持确定性；第一版候选：

```text
CHARIZARD.1
```

在实现前应通过真实 v21.1 corpus 验证 form identity 是否存在需要额外维度的情况。

### 4.3 Group

Encounter 数据优先作为第一个 Group vertical slice：

```text
encounters*.txt
    → [group]Encounter
```

一个 Group Key 表示一个确定的 encounter scope；该 key 下 JSONL 保存有序 encounter records。

示例：

```jsonl
{"type":"Land","weight":20,"pokemon":"PIDGEY","minLevel":2,"maxLevel":4}
{"type":"Land","weight":15,"pokemon":"RATTATA","minLevel":2,"maxLevel":3}
```

并通过 `.extend.meta` 声明：

```jsonl
{"field":"pokemon","struct":"Pokemon","desc":"Encountered Pokémon species"}
```

Encounter Group Key 的最终定义必须基于真实 v21.1 PBS identity，而不是根据文件名猜测。

---

## 5. Raw Source 与 Structured View 并存

第二阶段生成的是结构化语义视图，不替代原始 PBS。

必须保持：

```text
[resource]PBS/pokemon.txt
        ↓ parse
[struct]Pokemon/*.json
```

两者同时存在。

这样具备：

```text
raw source provenance
→ deterministic parser
→ structured FSDB representation
```

当某个结构化 record 有问题时，可以直接回到原始 PBS source 对照。

第二阶段不得把 `[resource]PBS` 视为 expendable intermediate artifact。

---

## 6. Parser 与 Emitter 分离

`structure.mjs` 不应实现为：

```text
PBS text
→ parse while writing files directly
```

而应拆成：

```text
FSDB resource reader
        ↓
PBS parser
        ↓
canonical semantic model
        ↓
FSDB structured emitter
```

建议内部模型：

```ts
interface StructuredRecordPlan {
  readonly tableKind: "struct" | "extend" | "group";
  readonly tableName: string;
  readonly key: string;
  readonly data: Readonly<Record<string, unknown>>;
}
```

Group 可以使用单独 plan：

```ts
interface StructuredGroupPlan {
  readonly tableName: string;
  readonly key: string;
  readonly records: readonly Readonly<Record<string, unknown>>[];
}
```

Metadata 也应作为 plan 明确生成，而不是散落在 parser 中。

目标是让：

```text
PBS parsing
FSDB representation
schema generation
reference metadata
filesystem materialization
```

可以分别测试。

---

## 7. Resource Reader Boundary

PBS parser 不直接依赖 physical source path。

第二阶段至少建立一个内部逻辑读取边界，例如：

```ts
interface FixtureResourceReader {
  read(resourceKey: string): Promise<Uint8Array>;
  list(prefix?: string): Promise<readonly string[]>;
}
```

调用示意：

```text
read("PBS/abilities")
read("PBS/pokemon")
```

第一版 reader 可以直接基于 disk FSDB 实现。

该抽象只用于隔离 parser 与 filesystem layout，不因此创建新的 public package/protocol。

未来若确有第二消费者，再评估是否复用为独立 capability。

---

## 8. PBS Parser 第一版语义

第一版目标不是重新实现整个 Pokémon Essentials compiler。

只做：

> 对 PBS 中显式存在的数据进行确定性的结构化解析。

原则：

```text
explicit source value
→ typed JSON value

missing source field
→ omit field
```

第一版可以进行无歧义的基础类型转换，例如：

```text
"45"             → 45
"true"           → true
"GRASS,POISON"   → ["GRASS", "POISON"]
```

但不得在没有证明 Essentials compiler semantics 的情况下：

```text
invent defaults
apply runtime inheritance
materialize implicit forms
apply compiler-only normalization
resolve runtime fallback behavior
```

如果未来目标升级为 Essentials runtime compatibility，再单独定义 compiler-semantic layer。

---

## 9. Multi-file PBS Merge

Essentials v21.1 允许同类 PBS 数据拆分到多个文件。

因此发现阶段不能假设：

```text
moves.txt == all Move records
```

而应按已确认的 v21.1 文件命名/目录规则发现同类 source，例如：

```text
moves*.txt
items*.txt
pokemon*.txt
```

具体 discovery grammar 必须通过真实 corpus 和 Essentials v21.1 parser 行为验证后冻结。

Merge 必须确定性：

```text
discover sources
→ stable source order
→ parse records
→ detect duplicate logical Key
→ either apply proven Essentials override semantics or fail closed
```

在没有证明 override semantics 前，重复 Key 默认应视为 semantic import error，而不是“最后一个 wins”。

---

## 10. Schema 与 Metadata

每个生成的 Struct / Extend / Group 必须生成符合 FSDB authority 的 metadata。

### 10.1 `.info.meta`

应描述第一版实际输出字段和类型。

当需要跨实现 JSON Schema validation 时，应显式声明 `$schema` dialect。

不要只生成：

```json
{"type":"object"}
```

作为长期结构化 fixture schema；vertical slice 稳定后应逐步补足字段类型和 required constraints。

### 10.2 `.desc.meta`

描述：

- source PBS 类别；
- FSDB table semantics；
- key identity；
- 是否经过语义归一化。

### 10.3 `.extend.meta`

Extend / Group 中存在对基础 Struct 的引用时，应显式声明。

例如：

```jsonl
{"field":"pokemon","struct":"Pokemon","desc":"Pokémon species identifier"}
```

不要因为 JSON 字段值“看起来像 ID”就隐式建立 reference。

---

## 11. Integrity Strategy

第二阶段至少保证输出是 Well-formed FSDB。

随后应增加 semantic validation：

```text
all generated records satisfy .info.meta
all declared Struct targets exist
all declared referenced keys exist
no duplicate TableIdentity
no duplicate Key
```

理想闭环：

```text
existing FSDB
    ↓
parse PBS resources
    ↓
construct complete structured plan
    ↓
validate plan
    ↓
materialize
    ↓
openFsdb()
    ↓
Integrity validation
```

第二阶段不应在遇到第一个 record 时就直接写入最终 table；应先形成可验证的完整计划。

---

## 12. 写入与失败模型

`structure.mjs` 会修改一个已存在的 fixture，因此必须避免半结构化状态。

推荐：

```text
read current FSDB
    ↓
build complete structured plan
    ↓
validate no target-table conflict
    ↓
materialize generated tables into sibling staging area
    ↓
validate staged tables
    ↓
atomically/promotably attach generated tables
```

第一版不要求实现通用 database transaction，但至少满足：

```text
parse failure
schema failure
reference failure
filesystem write failure
```

不能留下“部分 Pokemon 已生成、Move 尚未生成”的成功假象。

已有同名目标表默认 fail closed，不自动覆盖：

```text
TARGET_TABLE_EXISTS
```

重新生成/replace policy 后续单独设计，不在第一版偷偷加入。

---

## 13. CLI 草案

第二阶段只接受一个必需输入：FSDB root。

候选接口：

```bash
node tools/fixtures/essentials-v21.1/structure.mjs \
  --source "./[FSDB]Essentials v21.1"
```

其中 `--source` 指向已经生成的 FSDB database root，而不是 Essentials 原始目录。

第一版不增加：

```text
--overwrite
--tables
--mode
--compiler-compatible
```

保持行为确定且 fail closed。

如果后续需要重新生成，优先通过重新执行 Phase A 产生新的 fixture，而不是立即增加 overwrite semantics。

---

## 14. 建议目录结构

```text
tools/fixtures/essentials-v21.1/
├── DESIGN.md
├── STRUCTURE.md
├── import.mjs
├── import.test.mjs
├── structure.mjs
├── structure.test.mjs
│
└── lib/
    └── pbs/
        ├── discover.mjs
        ├── parser.mjs
        ├── abilities.mjs
        ├── types.mjs
        ├── moves.mjs
        ├── items.mjs
        ├── pokemon.mjs
        ├── forms.mjs
        └── encounters.mjs
```

文件拆分按真实实现复杂度渐进进行；不要为了匹配草案目录提前创建空模块。

---

## 15. 测试分层

### 15.1 Parser unit tests

使用最小 PBS snippets：

```text
PBS text
→ canonical semantic records
```

不接触 filesystem。

### 15.2 Structured transformation tests

构造最小 FSDB input：

```text
[resource]PBS/
└── abilities.txt
```

执行 transformer 后断言：

```text
[struct]Ability/
├── .info.meta
├── .desc.meta
├── OVERGROW.json
└── ...
```

### 15.3 Real corpus tests

本地完整 v21.1 fixture 上验证：

```text
all supported PBS sources discovered
all records parsed
all generated logical identities unique
all structured tables Well-formed
all declared references Integrity-valid
```

第三方完整素材不得提交进公开仓库；CI 使用最小 synthetic PBS fixtures。

### 15.4 Pipeline separation

测试责任必须保持：

```text
import.test
    source filesystem / ZIP → FSDB resources

structure.test
    FSDB PBS resources → FSDB structured tables

fsdb-http conformance
    FSDB → HTTP
```

不得让 `structure.test` 依赖网络下载或完整 Essentials ZIP。

---

## 16. 第一阶段实施顺序

建议按以下顺序形成 vertical slices：

```text
1. Ability
2. Type
3. Move
4. Item
5. Pokemon
6. PokemonForm
7. Encounter
```

理由：

```text
Ability / Type
    → 最小 section parser + Struct emitter

Move / Item
    → typed field complexity + multi-file discovery

Pokemon
    → 较复杂 record + cross-table identifiers

PokemonForm
    → 第一条 Extend/reference vertical slice

Encounter
    → 第一条 Group/JSONL vertical slice
```

每完成一层都应先在真实 v21.1 corpus 上验证，再扩下一类。

---

## 17. 非目标

本阶段明确不负责：

```text
重新下载 Essentials
重新导入 Graphics/Audio/Data
修改原始 PBS resource
解析 MapXXX.rxdata
生成 loom.map
完整复刻 Essentials compiler/runtime semantics
运行 Pokémon Essentials
为 Pokémon domain 建立通用 LoomRealm protocol
把 fixture parser 提升为 public npm package
```

这些需求如果出现，应分别证明新的稳定能力边界。

---

## 18. 完成标准

第一版 structured transformer 可认为闭环，当且仅当：

```text
Phase A FSDB can be used as sole input
raw PBS resources remain unchanged
Ability / Type / Move / Item / Pokemon successfully materialize as Struct
at least one Extend mapping is proven on real corpus
at least one Group mapping is proven on real corpus
generated metadata is valid
logical identity is deterministic
all generated tables pass FSDB Well-formed validation
supported references pass Integrity validation
rerunning against an already-structured target fails cleanly without partial mutation
minimal synthetic tests run without third-party assets
real v21.1 corpus completes locally
```

---

## 19. 核心原则

```text
Raw Import ≠ Semantic Transform

Resource Source ≠ Structured View

PBS Parser ≠ FSDB Emitter

Explicit Source Data ≠ Essentials Runtime Defaults

Package Boundary ≠ Fixture Tool Boundary
```

第二阶段的价值不是把 `.txt` 换成 `.json`，而是：

> 从已经进入 FSDB 的原始事实数据中，构造具有稳定 identity、schema、grouping 和 reference semantics 的 FSDB 结构化视图，同时保留可追溯的原始 PBS source。
