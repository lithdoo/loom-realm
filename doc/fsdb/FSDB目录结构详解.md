# FSDB 文件存储系统目录结构详解

## 1. 概述

FSDB（File Store Database）是一种基于文件系统的轻量级数据存储方案，通过特定目录结构和元数据文件组织数据。FSDB 的重要目标之一是让数据在不经过专用数据库工具的情况下，仍能被人和 AI 直接浏览、理解和编辑。

FSDB 支持四种类型的数据表：基础表、拓展表、分组数组表和资源表。

### 1.1 目录命名规范

FSDB 数据库目录使用：

```text
[FSDB]<DatabaseName>
```

数据库下只识别以下四种表目录：

```text
[struct]<TableName>
[extend]<TableName>
[group]<TableName>
[resource]<TableName>
```

`DatabaseName` 与 `TableName` 都使用 1.2 定义的 `NameSegment`。

以上四类表目录均可包含 `.desc.meta`；其中 `[resource]` 与 `[group]` 必填，`[struct]` 与 `[extend]` 可选。

FSDB 根目录下未被上述规则识别的其他目录或文件不会进入 FSDB logical namespace。

### 1.2 NameSegment、Key 与保留命名空间

FSDB 不把 key 限制为 ASCII identifier。表名和 key 应允许中文、日文、韩文、欧洲语言及其他可读 Unicode 文本，以保持“文件系统即可读数据”的设计目标。

FSDB 定义一个统一的 `NameSegment`：

> 一个可直接映射为单个物理文件名/目录名、适合人和 AI 阅读、同时具有跨平台安全边界的 Unicode 名称片段。

`NameSegment` MUST 满足：

1. 必须是有效 Unicode 文本，并以 UTF-8 表示；
2. 必须已经处于 Unicode NFC（Normalization Form C）；读取器不得静默 normalize 非 NFC 名称，而应将其视为 malformed；
3. UTF-8 编码后长度必须在 `1..200` bytes；
4. 不得以 Unicode White_Space 开头或结尾；内部空格允许；
5. 不得以 `.` 开头；`.` 前缀保留给物理 metadata / auxiliary namespace；
6. 不得以 `$` 开头；`$` 前缀保留给 FSDB 协议、服务接口及未来逻辑控制/元数据 namespace；
7. 不得以 `.` 结尾；
8. 不得包含 `/`、`\`、`<`、`>`、`:`、`"`、`|`、`?`、`*`；
9. 不得包含 NUL、Unicode control character（General Category `Cc`）或无效 Unicode scalar value；
10. 为保持常见桌面文件系统兼容性，名称中第一个 `.` 之前的部分不得以 ASCII case-insensitive 方式等于 `CON`、`PRN`、`AUX`、`NUL`、`COM1`..`COM9`、`LPT1`..`LPT9`。

合法示例：

```text
皮卡丘
常磐森林
第一章 开始
技能-十万伏特
NPC 小明
item.large
Map01
价格$USD
```

非法示例：

```text
$info            # logical reserved namespace
.hidden          # physical reserved namespace
 NPC             # leading whitespace
NPC              # trailing whitespace（示意）
foo.             # trailing dot
foo/bar          # logical path separator
foo\bar          # non-portable path separator
foo?bar          # non-portable filename character
CON              # Windows reserved device basename
```

FSDB logical identity **区分大小写**，实现不得自动 lowercase/uppercase、trim、collapse whitespace 或改变合法名称内容。为了跨大小写不敏感文件系统迁移，作者 SHOULD 避免仅通过大小写区分两个名称，例如 `Hero` 与 `hero`。

统一 logical type：

```text
DatabaseName = NameSegment
TableName    = NameSegment
Key          = NameSegment

ResourceKey = NameSegment ("/" NameSegment)*
```

`/` 只用于 ResourceKey 的逻辑层级分隔，不属于任何单个 `NameSegment`。

普通 `[struct]`、`[extend]`、`[group]` key 都是单个 `NameSegment`。ResourceKey 可以由多个 `NameSegment` 组成。

同一 logical namespace 内，NFC 后的完整 logical identity 必须唯一。

### 1.3 物理文件命名与识别规则

`.` 与 `$` 分别承担不同层级的保留空间：

```text
.foo   → physical metadata / auxiliary namespace
$foo   → logical protocol / service namespace
```

普通 FSDB data entry 不得以 `.` 或 `$` 开头。

表目录中的识别规则：

- `[struct]` / `[extend]`：非 dot-prefixed regular file 以 `.json` 结尾时是 data entry candidate；去掉固定末尾 `.json` 后必须得到合法 `Key`；
- `[group]`：非 dot-prefixed regular file 以 `.jsonl` 结尾时是 data entry candidate；去掉固定末尾 `.jsonl` 后必须得到合法 `Key`；
- `[resource]`：递归扫描非 dot-prefixed 目录；目录名必须是合法 `NameSegment`。非 dot-prefixed regular file 是 resource candidate，必须具有非空最后扩展名并满足 5.3；
- recognized candidate 若命名或内容 malformed，应使该 FSDB validation 失败，而不是静默忽略；
- 不属于 candidate 的普通辅助文件可以忽略；
- dot-prefixed 文件/目录默认不进入普通 data namespace；只有本规范明确声明的 `.info.meta`、`.extend.meta`、`.desc.meta` 具有 FSDB metadata 语义。

这使实现能够区分：

```text
unrecognized auxiliary object
    → ignore

recognized FSDB object but malformed
    → validation failure
```

## 2. 基础表数据目录（[struct]）

### 2.1 定义与用途

基础表是 FSDB 的核心数据存储单元，用于存储基础实体。每个基础表对应一个独立业务概念或数据实体。

### 2.2 目录结构

```text
[struct]<TableName>/
├── {Key1}.json
├── {Key2}.json
├── .info.meta
└── .desc.meta (可选)
```

### 2.3 数据文件规范

- **文件格式**：独立 JSON 文件；
- **文件命名**：`{Key}.json`；
- **Key 规则**：只去掉固定末尾 `.json`，其余部分完整作为 `Key`，并满足 1.2；
- **数据内容**：每条数据必须是 JSON object。

例如：

```text
[struct]角色/皮卡丘.json
→ TableName = 角色
→ Key = 皮卡丘
```

### 2.4 元数据文件（.info.meta）

每个 `[struct]` 目录必须包含 `.info.meta`，采用 JSON Schema 描述该目录下 JSON object 的结构。

`.info.meta` 通常包含：

- 数据字段定义；
- 字段数据类型；
- 字段业务描述；
- 字段约束。

如果需要执行完整 schema integrity validation，应优先遵循 `.info.meta` 中显式声明的 JSON Schema `$schema` dialect；未声明 dialect 时，不能假定不同实现会使用同一默认 draft。

## 3. 拓展表数据目录（[extend]）

### 3.1 定义与用途

拓展表存储与基础表相关联的扩展数据。拓展表中的字段可通过 `.extend.meta` 声明对基础表 key 的引用。

### 3.2 目录结构

```text
[extend]<TableName>/
├── {Key1}.json
├── {Key2}.json
├── .info.meta
├── .extend.meta
└── .desc.meta (可选)
```

### 3.3 数据文件规范

- **文件格式**：独立 JSON 文件；
- **文件命名**：`{Key}.json`；
- **Key 规则**：只去掉固定末尾 `.json` 后得到 `Key`，并满足 1.2；
- **数据内容**：每条数据必须是 JSON object，其中部分字段可保存被引用基础表的 key。

### 3.4 元数据文件

#### 3.4.1 .info.meta 文件

与 `[struct]` 相同，每个 `[extend]` 必须包含 `.info.meta`。

如果某字段在 `.extend.meta` 中被声明为基础表引用，则该字段在 `.info.meta` 中定义的数据类型必须为 `string`。

#### 3.4.2 .extend.meta 文件

每个 `[extend]` 必须包含 `.extend.meta`。文件采用 JSONL，每行一个 JSON object：

```json
{"field": "<字段名>", "struct": "<引用的基础表名>", "desc": "<引用关系描述>"}
```

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `field` | string | 是 | 拓展表中的引用字段 |
| `struct` | string | 是 | 被引用的基础表 `TableName` |
| `desc` | string | 否 | 引用关系描述 |

`struct` 的值必须满足 `TableName` 规则。

## 4. 分组数组表数据目录（[group]）

### 4.1 定义与用途

分组数组表按 key 保存一组结构一致的数据对象。与 `[struct]` 每条记录一个 JSON 文件不同，`[group]` 每个 key 对应一个 JSONL 文件。

### 4.2 目录结构

```text
[group]<TableName>/
├── {Key1}.jsonl
├── {Key2}.jsonl
├── .info.meta
├── .desc.meta
└── .extend.meta (可选)
```

### 4.3 数据文件规范

- **文件格式**：JSONL；
- **文件命名**：`{Key}.jsonl`；
- **Key 规则**：只去掉固定末尾 `.jsonl` 后得到 `Key`，并满足 1.2；
- **数据内容**：每个非空 JSONL record 必须是 JSON object，整文件表示该分组下对象序列。

### 4.4 元数据文件

#### 4.4.1 .info.meta 文件

每个 `[group]` 必须包含 `.info.meta`，采用 JSON Schema 描述每条 JSONL object 的结构。

#### 4.4.2 .desc.meta 文件

每个 `[group]` 必须包含 `.desc.meta`，采用 Markdown 描述：

- `{Key}.jsonl` 的分组依据；
- 对象序列业务含义；
- 分组规则和使用约束。

#### 4.4.3 .extend.meta 文件（可选）

`[group]` 可选包含 `.extend.meta`，格式与 `[extend]` 相同。

其 `field` 只针对每条 JSONL object 的字段，不描述整文件级元数据。若某字段被声明为引用字段，则 `.info.meta` 中该字段的数据类型必须为 `string`。

## 5. 资源表数据目录（[resource]）

### 5.1 定义与用途

资源表用于存储图片、音频、视频、文档等非结构化或半结构化资源。

### 5.2 目录结构

Resource 表允许使用子目录组织资源。子目录只参与 ResourceKey，不形成新的 FSDB 表或独立 metadata scope。

```text
[resource]<TableName>/
├── {LeafKey1}.{ext1}
├── {Segment1}/
│   ├── {LeafKey2}.{ext2}
│   └── {Segment2}/
│       └── {LeafKey3}.{ext3}
└── .desc.meta
```

表级 `.desc.meta` 始终位于 `[resource]<TableName>` 根目录。

### 5.3 数据文件与 ResourceKey 规范

Resource physical path 与 logical key 的关系：

```text
physical:
    <NameSegment>/<NameSegment>/.../<LeafName>.<Extension>

logical ResourceKey:
    <NameSegment>/<NameSegment>/.../<LeafName>
```

规则：

- Resource 文件可以位于任意层级非 dot-prefixed 子目录；
- 每个目录名和最终 `LeafName` 都必须是合法 `NameSegment`；
- Logical ResourceKey 使用 `/` 作为 canonical separator，不受宿主 OS path separator 影响；
- 扩展名取文件名最后一个 `.` 之后的部分；只移除最后一个扩展名，此前的 `.` 属于 `LeafName`；
- `Extension` 必须是 `1..32` 个 lowercase ASCII `a-z`、`0-9`、`-`、`_`，且首字符必须是 `a-z` 或 `0-9`；
- Extension 不属于 Resource identity；
- 同一 Resource 表中完整 ResourceKey 必须唯一；同一 key 即使扩展名不同仍然冲突；
- unknown extension 仍然可以是合法 Resource；扩展名只描述物理格式，不限制业务类型。

示例：

```text
[resource]图片/皮卡丘.png
→ key = 皮卡丘
→ ext = png

[resource]图片/关都地区/真新镇.png
→ key = 关都地区/真新镇
→ ext = png

[resource]图片/UI/道具.large.webp
→ key = UI/道具.large
→ ext = webp
```

以下可以共存：

```text
关都地区/皮卡丘.png
城都地区/皮卡丘.png
```

以下冲突：

```text
皮卡丘.png
皮卡丘.webp
```

因为两者 ResourceKey 都是 `皮卡丘`。

Resource 子目录中的 dot-prefixed 文件或目录不进入 Resource namespace，例如 `.DS_Store`、`.gitkeep`。只有 Resource 表根目录的 `.desc.meta` 具有表级 metadata 语义。

非 dot-prefixed Resource regular file 若没有合法的最后扩展名或无法解析出合法 `LeafName`，属于 malformed Resource candidate，而不是普通 Resource。

### 5.4 元数据文件（.desc.meta）

`.desc.meta` 为 Markdown。对于 `[resource]` 和 `[group]` 必填；对于 `[struct]` 和 `[extend]` 可选。

Resource 表只有根目录 `.desc.meta` 具有表级 metadata 语义；子目录不创建新的 metadata scope。

## 6. 目录层级关系

```text
[FSDB]<DatabaseName>/
├── [struct]<TableName>/
│   ├── {Key}.json
│   ├── .info.meta
│   └── .desc.meta (可选)
├── [extend]<TableName>/
│   ├── {Key}.json
│   ├── .info.meta
│   ├── .extend.meta
│   └── .desc.meta (可选)
├── [group]<TableName>/
│   ├── {Key}.jsonl
│   ├── .info.meta
│   ├── .desc.meta
│   └── .extend.meta (可选)
└── [resource]<TableName>/
    ├── {LeafKey}.{ext}
    ├── {NameSegment}/
    │   └── {LeafKey}.{ext}
    └── .desc.meta
```

## 7. 数据关联关系与有效性层级

### 7.1 引用规则

`[extend]` 与 `[group]` 通过 `.extend.meta` 声明对 `[struct]` 的引用：

1. `.extend.meta` 声明引用字段与目标基础表；
2. 数据中的引用字段存储目标基础表的 `Key`；
3. `[group]` 的引用字段作用于每条 JSONL object；
4. 一个表可以声明多个基础表引用。

### 7.2 引用完整性

完整 reference integrity 要求：

- 被引用的基础表存在；
- 引用值满足目标 `Key` 规则；
- 引用的 key 在目标基础表中存在；
- 基础数据删除后的 orphan handling 由写入/应用层策略决定。

### 7.3 Well-formed 与 Integrity-valid

为了让 reader、HTTP adapter、installer 和完整 validator 的职责可分离，FSDB 区分两个有效性层级：

**Well-formed FSDB**：

```text
directory/table naming valid
NameSegment / Key / ResourceKey valid
required metadata exists
metadata syntax valid
struct/extend entry is JSON object
group JSONL record is JSON object
logical identity unique
resource physical mapping unambiguous
```

**Integrity-valid FSDB**：

```text
Well-formed
+
records satisfy applicable .info.meta schema
+
.extend.meta / .info.meta are semantically consistent
+
all declared reference targets exist
+
other explicitly declared business integrity constraints hold
```

读取原始 FSDB 内容的 adapter MAY 只要求 Well-formed；安装器、发布检查或专用 validator 可以进一步要求 Integrity-valid。

## 8. 最佳实践

### 8.1 命名规范

- 名称优先服务于人和 AI 的直接理解，不需要为了数据库习惯强制转换成 ASCII；
- 中文等 Unicode 名称是正常用法，例如 `[struct]角色/皮卡丘.json`；
- 写入器应在落盘前生成 NFC 名称，读取器不应静默修复 malformed 名称；
- 避免只通过大小写区分同一 namespace 中的名称；
- `$` 前缀属于 logical reserved namespace；`.` 前缀属于 physical reserved/auxiliary namespace；
- 内部空格允许，但避免产生难以肉眼区分的连续空白命名；
- Resource 子目录应直接表达资源分类，因为目录层级就是 ResourceKey 的组成部分；
- Resource 最后扩展名应准确表达文件格式。

### 8.2 元数据编写

- `.info.meta` 应完整描述字段、类型和约束；
- 需要跨实现 schema validation 时，应显式声明 `$schema`；
- `.extend.meta` 的 `desc` 应说明引用业务含义；
- `[group]` `.desc.meta` 应说明分组依据；
- `[resource]` `.desc.meta` 应说明资源用途和命名约定。

### 8.3 数据组织

- 相关基础表、拓展表与分组数组表应组织在同一个 FSDB 数据库中；
- Resource 可按类型、地区、日期或其他业务分类使用子目录；
- 定期清理无效 key 与 orphaned 引用；
- 发布或跨平台复制前建议执行 Well-formed validation，并按需要执行 Integrity validation。
