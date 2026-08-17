# FSDB 文件存储系统目录结构详解

## 1. 概述

FSDB（File Store Database）是一种基于文件系统的轻量级数据存储方案，通过特定的目录结构和元数据文件来组织和管理数据。该系统将数据以文件形式存储，支持四种类型的数据表：基础表、拓展表、分组数组表和资源表。

### 1.1 目录命名规范

所有 FSDB 数据目录均以 `[FSDB]` 为前缀，用于标识该目录属于 FSDB 存储系统。FSDB 目录下仅包含以下四种类型的数据目录：

- `[struct]` 开头的目录：基础表数据目录
- `[extend]` 开头的目录：拓展表数据目录
- `[group]` 开头的目录：分组数组表数据目录
- `[resource]` 开头的目录：资源表数据目录

说明：以上四类目录均可包含 `.desc.meta`（用于补充目录说明）；其中 `[resource]` 与 `[group]` 目录要求该文件为必填，`[struct]` 与 `[extend]` 目录中该文件为可选。

其他目录或者文件将被忽略，不会被 FSDB 系统识别和管理。

### 1.2 Key 与保留命名空间

FSDB 中的 `key` 是表内数据的逻辑唯一标识符。

统一约束：

- `key` 必须非空；
- 普通数据 `key` 不得以 `$` 开头；`$` 前缀保留给 FSDB 协议、服务接口或未来控制/元数据命名空间使用；
- `[struct]`、`[extend]`、`[group]` 的 `key` 由数据文件名去掉固定扩展名得到；
- `[resource]` 的 `key` 可以包含目录层级，具体规则见 5.3；
- 对于分层 Resource Key，每一个路径段都视为 key segment，任何 segment 均不得为空、为 `.` / `..`，也不得以 `$` 开头；
- 同一张表内，规范化后的 logical key 必须唯一。

例如以下普通 key 非法：

```text
$info
$meta
$anything
```

这样可以保证实现层在不侵占合法业务 key 的前提下使用 `$...` 作为保留逻辑名称。

## 2. 基础表数据目录（[struct]）

### 2.1 定义与用途

基础表是 FSDB 系统的核心数据存储单元，用于存储系统中最基础、最核心的数据实体。每个基础表对应一个独立的业务概念或数据实体。

### 2.2 目录结构

```
[struct]<数据名>/
├── {key1}.json
├── {key2}.json
├── {key3}.json
├── .info.meta
└── .desc.meta (可选)
```

### 2.3 数据文件规范

- **文件格式**：独立的 JSON 文件
- **文件命名**：`{key}.json`，其中 `key` 是该条数据的唯一标识符
- **Key 规则**：文件名去掉最后的 `.json` 后得到 logical key，并满足 1.2 的统一约束
- **数据内容**：每条数据以 JSON 对象形式存储

### 2.4 元数据文件（.info.meta）

每个 `[struct]` 目录下必须包含一个 `.info.meta` 文件，该文件采用 JSON Schema 格式，用于描述该目录下所有 JSON 数据文件的结构。

`.info.meta` 文件包含以下信息：

- 数据字段的定义
- 每个字段的数据类型
- 字段的业务描述
- 字段的约束条件（如必填、取值范围等）

## 3. 拓展表数据目录（[extend]）

### 3.1 定义与用途

拓展表用于存储与基础表相关联的扩展数据。与基础表不同的是，拓展表中的数据可以通过特定字段引用基础表的数据，实现表之间的关联和数据扩展。

### 3.2 目录结构

```
[extend]<数据名>/
├── {key1}.json
├── {key2}.json
├── {key3}.json
├── .info.meta
├── .extend.meta
└── .desc.meta (可选)
```

### 3.3 数据文件规范

- **文件格式**：独立的 JSON 文件
- **文件命名**：`{key}.json`，其中 `key` 是该条数据的唯一标识符
- **Key 规则**：文件名去掉最后的 `.json` 后得到 logical key，并满足 1.2 的统一约束
- **数据内容**：每条数据以 JSON 对象形式存储，其中某些字段的值指向基础表的 `key`

### 3.4 元数据文件

#### 3.4.1 .info.meta 文件

与 `[struct]` 目录相同，每个 `[extend]` 目录下必须包含一个 `.info.meta` 文件，采用 JSON Schema 格式描述数据结构。

**重要约束**：如果某个字段在 `.extend.meta` 中被声明为对基础表的引用，那么该字段在 `.info.meta` 中定义的数据类型必须为 `string`。

#### 3.4.2 .extend.meta 文件

每个 `[extend]` 目录下必须包含一个 `.extend.meta` 文件，该文件采用 JSONL（JSON Lines）格式，用于声明该拓展表中哪些字段引用了基础表的数据，以及引用关系的描述。

**文件格式说明**：

每行一个独立的 JSON 对象，包含 struct、field 和 desc 三个字段，用于描述一个引用关系。

```json
{"field": "<字段名>", "struct": "<引用的基础表名>", "desc": "<引用关系描述>"}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| field | string | 是 | 拓展表中存储引用关系的字段名 |
| struct | string | 是 | 被引用的基础表名称 |
| desc | string | 否 | 对该引用关系的业务描述 |

## 4. 分组数组表数据目录（[group]）

### 4.1 定义与用途

分组数组表用于存储同一分组下的一组结构一致的数据对象。与 `[struct]` 按单条 JSON 文件存储不同，`[group]` 目录按文件分组，每个文件中存放一个 JSONL 数据集合。

### 4.2 目录结构

```
[group]<数据名>/
├── {key1}.jsonl
├── {key2}.jsonl
├── {key3}.jsonl
├── .info.meta
├── .desc.meta
└── .extend.meta (可选)
```

### 4.3 数据文件规范

- **文件格式**：JSONL（JSON Lines）
- **文件命名**：`{key}.jsonl`，其中 `key` 是该文件分组的唯一标识符（即文件名中的唯一键）
- **Key 规则**：文件名去掉最后的 `.jsonl` 后得到 logical key，并满足 1.2 的统一约束
- **数据内容**：每行一个 JSON 对象，整文件表示该分组下的对象数组

### 4.4 元数据文件

#### 4.4.1 .info.meta 文件

每个 `[group]` 目录下必须包含一个 `.info.meta` 文件，采用 JSON Schema 格式，用于描述 JSONL 文件中每条对象数据的结构。

#### 4.4.2 .desc.meta 文件

每个 `[group]` 目录下必须包含一个 `.desc.meta` 文件，采用 Markdown 格式，用于说明：

- 每个 `{key}.jsonl` 文件的分组依据
- 文件中对象数组的业务含义
- 分组规则与使用约束

#### 4.4.3 .extend.meta 文件（可选）

`[group]` 目录可选包含 `.extend.meta` 文件，采用 JSONL（JSON Lines）格式，用于声明 JSONL 对象中哪些字段引用了基础表数据，以及引用关系描述。

**作用域约束**：`[group]` 下 `.extend.meta` 中声明的 `field` 仅针对每条 JSONL 对象的字段，不用于描述整文件级元数据字段。

若某字段在 `.extend.meta` 中被声明为引用字段，则该字段在 `.info.meta` 中定义的数据类型必须为 `string`。

## 5. 资源表数据目录（[resource]）

### 5.1 定义与用途

资源表用于存储系统中的非结构化或半结构化数据，如图片、音频、视频、文档等二进制或文本资源文件。

### 5.2 目录结构

Resource 表允许使用子目录组织资源。子目录只参与 Resource Key，不形成新的 FSDB 表或独立元数据作用域。

```
[resource]<数据名>/
├── {key1}.{ext1}
├── {folder1}/
│   ├── {key2}.{ext2}
│   └── {folder2}/
│       └── {key3}.{ext3}
└── .desc.meta
```

表级 `.desc.meta` 仍位于 `[resource]<数据名>` 根目录，并描述整张资源表。

### 5.3 数据文件与 Resource Key 规范

- **文件格式**：任意类型的文件（由最后一个扩展名决定）
- **物理位置**：资源文件可以是 `[resource]<数据名>` 的直接子文件，也可以位于任意层级子目录中
- **逻辑 Key**：Resource Key 等于“资源文件相对于 `[resource]<数据名>` 根目录的相对路径，去掉最后一个文件扩展名”
- **路径分隔符**：Logical Resource Key 统一使用 `/`，不受宿主操作系统路径分隔符影响
- **扩展名**：只移除文件名最后一个 `.` 之后的扩展名；此前的 `.` 属于 key 本身
- **Key Segment**：每一个目录名以及最终文件名去扩展名后的部分都必须满足 1.2 的 key segment 约束
- **唯一性**：同一 Resource 表中规范化后的完整 Resource Key 必须唯一
- **数据内容**：可以是任何类型的文件内容

示例：

```text
[resource]image/hero.png
→ key = hero

[resource]image/character/hero.png
→ key = character/hero

[resource]image/ui/icon/item.large.png
→ key = ui/icon/item.large
→ ext = png
```

因此以下两个资源可以共存：

```text
character/hero.png
icon/hero.png
```

它们的 logical key 分别为：

```text
character/hero
icon/hero
```

而以下资源在同一表中冲突：

```text
hero.png
hero.webp
```

因为两者的 logical key 都是 `hero`。FSDB 实现必须将其视为重复 key，而不能把扩展名作为 identity 的一部分。

### 5.4 元数据文件（.desc.meta）

`.desc.meta` 可用于描述目录下数据或资源的补充信息，格式为 Markdown。  
对于 `[resource]` 与 `[group]` 目录，`.desc.meta` 为必填；对于 `[struct]` 和 `[extend]` 目录，`.desc.meta` 为可选。

对于 Resource 表，只有表根目录的 `.desc.meta` 具有 FSDB 表级元数据语义；Resource 子目录本身不创建新的 `.desc.meta` 作用域。

`.desc.meta` 文件通常包含以下内容：

- 资源的用途和业务场景
- 资源的存储规范和限制
- 资源的命名约定
- 资源的管理策略

## 6. 目录层级关系

FSDB 系统的目录层级关系如下：

```
[FSDB]<数据库名>/
├── [struct]<基础表名1>/
│   ├── {key1}.json
│   ├── {key2}.json
│   ├── .info.meta
│   └── .desc.meta (可选)
├── [extend]<拓展表名1>/
│   ├── {key1}.json
│   ├── {key2}.json
│   ├── .info.meta
│   ├── .extend.meta
│   └── .desc.meta (可选)
├── [group]<数组表名1>/
│   ├── {key1}.jsonl
│   ├── {key2}.jsonl
│   ├── .info.meta
│   ├── .desc.meta
│   └── .extend.meta (可选)
└── [resource]<资源表名1>/
    ├── {key1}.{ext1}
    ├── {folder1}/
    │   └── {key2}.{ext2}
    └── .desc.meta
```

## 7. 数据关联关系

### 7.1 引用规则

拓展表与分组数组表通过 `.extend.meta` 文件声明对基础表的引用关系。这种引用关系通过以下机制实现：

1. 在 `.extend.meta` 中声明引用字段的名称和目标基础表
2. 在拓展表的 JSON 数据或 JSONL 对象中，该字段存储目标基础表数据的 `key` 值
3. 对于 `[group]` 目录，该引用字段始终按“每条 JSONL 对象字段”解析，不按整文件元数据字段解析
4. 系统可以通过该 `key` 值查询并关联对应的基础表数据

### 7.2 多级引用

一个拓展表或分组数组表可以引用多个不同的基础表，通过在 `.extend.meta` 文件中定义多行 JSON 记录来实现。每行记录表示一个独立的引用关系。

### 7.3 引用完整性

由于拓展表和 JSONL 对象中的引用字段存储的是基础表的 `key` 值，因此需要确保：

- 引用的基础表必须存在
- 引用的 `key` 值必须在基础表中存在对应的数据
- 当基础表数据被删除时，需要处理拓展表中的引用（具体策略由应用层决定）

## 8. 最佳实践

### 8.1 命名规范

- 使用有意义的名称命名数据表，避免使用无意义的字符
- `key` 值应具有唯一性和可读性，并满足 1.2 的统一约束
- `$` 前缀属于保留命名空间，业务 key 与 Resource Key 的任一 segment 都不得以 `$` 开头
- 分组数组表中 `{key}.jsonl` 的 `key` 应直接表达该文件的分组语义
- Resource 子目录应直接表达资源分类；其目录层级会成为 Resource Key 的组成部分
- 资源文件的最后一个扩展名应准确反映文件类型

### 8.2 元数据编写

- `.info.meta` 应完整描述所有字段，包括字段含义、数据类型、约束条件等
- `.extend.meta` 中的 `desc` 字段应清晰说明引用的业务含义
- 分组数组表的 `.desc.meta` 应详细说明文件分组依据与文件内容说明
- 资源表的 `.desc.meta` 应详细说明资源的用途、管理方式和使用限制

### 8.3 数据组织

- 相关的基础表、拓展表与分组数组表应组织在同一个 FSDB 目录下
- Resource 可以按类型、日期或其他业务分类使用子目录；目录结构本身即 Resource Key 的一部分
- 定期清理无效的 `key` 和 orphaned 引用
