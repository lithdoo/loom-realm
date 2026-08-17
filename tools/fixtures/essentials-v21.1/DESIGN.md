# Pokémon Essentials v21.1 → FSDB Fixture Importer 草案

> 状态：Draft  
> 目标：将开发者本地合法取得的 Pokémon Essentials v21.1 目录转换为本地 FSDB 测试语料，用于验证 `@loomrealm/fsdb-http` 的真实世界兼容性、规模和安全边界。  
> 输出不得作为 LoomRealm 仓库或 npm package 的第三方素材分发渠道。

---

## 1. 定位

本工具属于 development / fixture tooling，不属于 LoomRealm runtime，也不属于 `@loomrealm/fsdb-http` production package。

建议位置：

```text
tools/
└── fixtures/
    └── essentials-v21.1/
        ├── DESIGN.md
        └── import.mjs          # 后续实现
```

本工具的第一阶段只负责：

```text
local Pokémon Essentials v21.1 directory
        ↓
strict FSDB compatibility preflight
        ↓
FSDB Resource mirror
        ↓
openFsdb(output)
        ↓
real-corpus integration / stress test
```

它不是 Pokémon Essentials 语义转换器。

---

## 2. Phase A Scope

### 2.1 In Scope

第一版导入：

```text
Graphics/
Audio/
Fonts/
Data/
PBS/
```

分别映射为 FSDB Resource table：

```text
[FSDB]Essentials v21.1/
├── [resource]Graphics/
├── [resource]Audio/
├── [resource]Fonts/
├── [resource]Data/
├── [resource]PBS/
└── [struct]测试信息/
```

Resource 保持原始 bytes，不解析内容语义。

每个 Resource table 自动生成根级：

```text
.desc.meta
```

`[struct]测试信息` 用于确保同一 fixture 同时覆盖 Struct + Resource：

```text
[struct]测试信息/
├── .info.meta
└── 来源.json
```

### 2.2 Out of Scope

Phase A 不负责：

```text
PBS → Struct / Group 业务转换
RPG Maker rxdata 解析
MapXXX.rxdata → loom.map
Pokémon/GameData schema 设计
引用完整性转换
素材编辑、压缩、格式转换
运行 Pokémon Essentials 游戏
下载或重新分发第三方素材
```

这些能力如果需要，分别进入后续 compatibility/importer 工作，不进入本 fixture importer。

---

## 3. 输入与输出

建议 CLI：

```bash
node tools/fixtures/essentials-v21.1/import.mjs \
  --source "/path/to/Pokemon Essentials v21.1" \
  --output ".local/fixtures/[FSDB]Essentials v21.1"
```

约束：

- `--source` 必须是调用方本地已有目录；
- importer 不负责网络下载；
- importer 不修改 source；
- output 必须位于本地 ignored workspace，推荐 `.local/fixtures/`；
- `.local/` 应保持 Git ignored；
- importer 不得将第三方原始素材写入 tracked repository path。

---

## 4. 映射模型

### 4.1 Resource directory mapping

源目录：

```text
Graphics/Characters/trainer.png
```

目标：

```text
[resource]Graphics/Characters/trainer.png
```

FSDB logical identity：

```text
TableIdentity = (resource, Graphics)
ResourceKey   = Characters/trainer
Extension     = png
```

HTTP identity：

```text
/fsdb/v1/resource/Graphics/Characters/trainer
```

最后 extension 不属于 ResourceKey。

### 4.2 Opaque bytes

所有 Resource 文件：

```text
source bytes == target bytes
```

importer MUST NOT：

```text
transcode
normalize content
rewrite text encoding
recompress image/audio
modify line endings
```

文件名可以进行 FSDB compatibility validation，但默认不得静默改名。

---

## 5. Strict Import 原则

Phase A 第一版只实现：

```text
--strict
```

规则：

> 任何源对象不能无歧义映射为当前 FSDB logical identity 时，整个 import 失败并生成明确报告；不得静默修复。

禁止自动：

```text
lowercase extension
trim filename
replace forbidden characters
collapse whitespace
rename normalization collision
pick one file from a ResourceKey collision
```

未来若真实需求证明有价值，可以另加：

```text
--adapt
```

但 adaptation 必须 deterministic，并输出完整 source → target mapping report；不属于 Phase A 首版。

---

## 6. Preflight

真正复制前 MUST 先完整扫描 source，并构造计划：

```ts
interface PlannedResource {
  readonly sourcePath: string;
  readonly table: "Graphics" | "Audio" | "Fonts" | "Data" | "PBS";
  readonly resourceKey: string;
  readonly extension: string;
  readonly targetRelativePath: string;
  readonly size: bigint;
}
```

Preflight 至少检查：

### 6.1 NameSegment / ResourceKey

每个 table name、directory segment、leaf name 必须满足当前 FSDB `NameSegment` authority。

### 6.2 UTF-8 / Unicode

物理名称必须能无损解释为有效 Unicode；logical identity 使用 NFC。

### 6.3 Normalization collision

例如：

```text
é.png
é.png
```

若 canonicalize 后 ResourceKey 相同 → import fail。

### 6.4 Extension grammar

当前 FSDB Extension：

```text
[a-z0-9][a-z0-9_-]{0,31}
```

例如：

```text
foo.PNG
foo
```

在 strict 模式下若不能合法映射 → import fail。

### 6.5 Cross-extension ResourceKey collision

例如同 table：

```text
foo.png
foo.webp
```

二者都映射为：

```text
ResourceKey = foo
```

→ import fail。

### 6.6 Case portability warning

例如：

```text
Hero.png
hero.png
```

当前 FSDB logical identity 区分大小写，因此不是 Core validation failure；importer SHOULD 输出 portability warning。

### 6.7 Indirection

source 中 symlink/junction/其他 filesystem indirection 默认不得 follow。

Phase A 建议：

```text
recognized source object is indirection
    → import fail
```

避免导入结果依赖 source root 之外的文件。

---

## 7. Copy Transaction

不要边扫描边直接产生最终 output。

建议：

```text
scan/preflight
    ↓ PASS
create staging directory
    ↓
copy resources byte-for-byte
    ↓
generate metadata
    ↓
openFsdb(staging)
    ↓ PASS
atomic-ish promote staging → output
```

若任意步骤失败：

```text
remove staging
leave existing successful output untouched
```

Phase A 不要求实现通用事务系统，只需要避免产生半完成、看起来像合法 fixture 的输出目录。

---

## 8. Generated Metadata

每个 Resource table 自动生成 `.desc.meta`，例如：

```md
Imported from local Pokémon Essentials v21.1 `Graphics/`.

Generated for local LoomRealm FSDB integration testing.
Source assets are not owned or redistributed by LoomRealm.
```

`[struct]测试信息/.info.meta`：

```json
{"type":"object"}
```

`[struct]测试信息/来源.json` 建议：

```json
{
  "name": "Pokémon Essentials",
  "version": "21.1",
  "purpose": "local fsdb-http integration fixture"
}
```

不得把开发者本机绝对路径写入 FSDB fixture，以免测试输出泄漏环境信息。

---

## 9. 最终验证

导入完成前 MUST 使用 production implementation 验证：

```ts
const db = await openFsdb({ root: stagingRoot });
await db.close();
```

不得复制一套 importer-private FSDB validator 并以其结果代替 `openFsdb()`。

这形成：

```text
real third-party corpus
→ importer
→ FSDB output
→ production openFsdb()
→ PASS
```

---

## 10. HTTP Integration Test

成功导入后可以启动：

```ts
const service = await serveFsdb({ root: outputRoot });
```

至少执行：

```text
descriptor GET
random Resource GET
random Resource HEAD
Content-Length verification
MIME verification
byte-for-byte body verification
nested ResourceKey verification
ETag / 304 smoke
```

对于随机抽样，测试报告必须记录 logical identity，不记录或输出绝对 filesystem path。

---

## 11. Import Report

成功时建议输出：

```text
Imported Pokémon Essentials v21.1

Tables:
  Graphics   <count> resources  <bytes>
  Audio      <count> resources  <bytes>
  Fonts      <count> resources  <bytes>
  Data       <count> resources  <bytes>
  PBS        <count> resources  <bytes>

Total:
  <count> files
  <bytes>

Warnings:
  <count>

FSDB validation: PASS
```

失败时报告应该使用稳定 problem category，而不是只抛 raw stack：

```text
INVALID_UTF8_NAME
INVALID_NAME_SEGMENT
INVALID_EXTENSION
NORMALIZATION_COLLISION
RESOURCE_KEY_COLLISION
SOURCE_INDIRECTION
COPY_FAILURE
FSDB_VALIDATION_FAILURE
```

这些 category 属于 development tooling，不成为 FSDB 或 `fsdb-http` wire contract。

---

## 12. 测试目的

这个 fixture 的价值不是证明 Pokémon Essentials 能完整迁移到 LoomRealm，而是暴露 synthetic fixture 很难发现的问题：

```text
真实目录深度
真实资源数量
真实文件大小分布
真实 Unicode / ASCII 混合命名
扩展名多样性
大量 ResourceKey
文件系统扫描性能
index memory footprint
HTTP streaming
MIME coverage
snapshot open latency
```

如果真实 corpus 暴露 FSDB contract 问题，应按已有流程处理：

```text
import / implementation
→ concrete failure
→ classify boundary issue
→ minimal FSDB/fsdb-http clarification or change
→ conformance
→ continue
```

不得为了让 Essentials fixture 通过而加入仅针对 Pokémon Essentials 的 FSDB 特例。

---

## 13. 后续阶段

### Phase B — PBS semantic importer

在 Resource mirror 稳定后，另行设计：

```text
PBS/*.txt
→ parser
→ FSDB Struct / Group
```

可能覆盖：

```text
Pokemon
Move
Item
Ability
Type
Trainer
Encounter
```

Phase B 是 Pokémon Essentials compatibility，不属于 `fsdb-http`。

### Phase C — RPG Maker / Essentials map compatibility

另行处理：

```text
Data/MapXXX.rxdata
→ @loomrealm/map-essentials
→ LoomRealm map model / loom.map
```

不得把 RPG Maker binary parsing 塞进本 importer Phase A。

---

## 14. Phase A 完成标准

Phase A importer 可以认为完成，当：

```text
source never modified
no network/download responsibility
strict preflight implemented
all planned copies byte-for-byte
no silent filename repair
all generated metadata deterministic
no host absolute path leaked
staging failure leaves no partial output
production openFsdb(output) PASS
representative HTTP GET/HEAD PASS
byte-for-byte sampled resources PASS
large real corpus statistics reported
```

达到此状态后，再根据真实导入结果决定是否设计 `--adapt` 或进入 Phase B。