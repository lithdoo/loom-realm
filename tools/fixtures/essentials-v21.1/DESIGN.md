# Pokémon Essentials v21.1 → FSDB Fixture Importer 草案

> 状态：Draft  
> 目标：将 Pokémon Essentials v21.1 转换为本地 FSDB 测试语料，用于验证 `@loomrealm/fsdb-http` 的真实世界兼容性、规模和安全边界。  
> 输出仅用于开发者本地测试，不得作为 LoomRealm 仓库或 npm package 的第三方素材分发渠道。

---

## 1. 定位

本工具属于 development / fixture tooling，不属于 LoomRealm runtime，也不属于 `@loomrealm/fsdb-http` production package。

位置：

```text
tools/
└── fixtures/
    └── essentials-v21.1/
        ├── DESIGN.md
        └── import.mjs          # 后续实现
```

Phase A 只负责：

```text
local source OR default HTTPS download
        ↓
normalize to an extracted Essentials v21.1 source directory
        ↓
strict FSDB compatibility preflight
        ↓
FSDB Resource mirror
        ↓
production openFsdb(output)
        ↓
real-corpus integration / stress test
```

它不是 Pokémon Essentials 业务语义转换器。

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

每个 Resource table 自动生成根级 `.desc.meta`。

`[struct]测试信息` 用于确保同一真实 fixture 同时覆盖 Struct + Resource：

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
长期缓存下载包
向仓库/npm 发布第三方素材
```

自动获取默认 Essentials v21.1 ZIP **属于 Phase A acquisition responsibility**，但只用于本地转换；下载产物和转换后的第三方素材都不是 LoomRealm distribution artifact。

---

## 3. CLI：仅两个参数

v1 CLI 只暴露两个可选参数：

```text
--source <path>
--output <directory>
```

没有 `--strict` 参数：**strict import 是 Phase A 固定语义**。

典型调用：

```bash
# 1. 两个参数都指定
node tools/fixtures/essentials-v21.1/import.mjs \
  --source "/path/to/Pokemon Essentials v21.1" \
  --output ".local/fixtures"

# 2. 只指定 source；输出创建在当前目录
node tools/fixtures/essentials-v21.1/import.mjs \
  --source "/path/to/Pokemon_Essentials_v21.1_2023-07-30.zip"

# 3. 只指定 output；source 自动下载
node tools/fixtures/essentials-v21.1/import.mjs \
  --output ".local/fixtures"

# 4. 两个都省略；自动下载，并在当前目录创建新的 FSDB 目录
node tools/fixtures/essentials-v21.1/import.mjs
```

### 3.1 `--source <path>`

`--source` 指定本地 source，可以是：

```text
1. 已解压的 Pokémon Essentials v21.1 根目录
2. Pokémon Essentials v21.1 ZIP archive
```

本地 source MUST：

- 不被 importer 修改；
- 经 source-shape/version preflight 确认为目标 v21.1 corpus；
- directory 直接作为 acquisition result；
- ZIP 先解压到 importer-owned temporary directory，再进入相同 preflight。

如果 **未提供 `--source`**，importer MUST 自动通过 HTTPS 获取默认 v21.1 archive。

默认稳定入口：

```text
https://www.eeveeexpo.com/essentials/download
```

该地址是 Eevee Expo Essentials 下载入口；importer MUST 允许正常 HTTP redirect。当前入口会进入 MediaFire landing page，importer 从 HTML 中动态选择当前的 HTTPS ZIP download link，再获取 temporary ZIP。

不得把当前 CDN/MediaFire 的瞬时直链写死为长期 authority。默认 acquisition authority 是上面的 Eevee Expo download endpoint。

Landing page resolution MUST 不执行 JavaScript、不接受非 HTTPS link，并只接受 MediaFire authority 下唯一、无歧义的 `.zip` download link。第二个 HTML landing page、非 MediaFire link、多个候选或无法解析都以 `DOWNLOAD_FAILURE` fail closed。

下载要求：

```text
HTTPS request
→ follow bounded redirects
→ parse bounded MediaFire landing page
→ follow current HTTPS ZIP link
→ stream to temporary file
→ verify pinned archive size + SHA-256
→ validate archive shape
→ safely extract to temporary directory
→ locate Essentials v21.1 root
→ continue normal source preflight
```

下载/解压失败必须整体失败，不得回退到不明来源或 GitHub repository snapshot。Maruno 的 GitHub repository 不是完整 Essentials distribution，不能替代默认完整 corpus。

### 3.2 `--output <directory>`

`--output` 表示 **输出父目录**，不是最终 FSDB root 名本身。

例如：

```bash
--output ".local/fixtures"
```

生成：

```text
.local/fixtures/[FSDB]Essentials v21.1/
```

如果 **未提供 `--output`**：

```text
output parent = process.cwd()
```

即在当前工作目录下自动创建一个新的 FSDB 目录。

### 3.3 输出必须永远是新目录

importer MUST NOT 覆盖已有目录。

默认 logical basename：

```text
[FSDB]Essentials v21.1
```

如果已存在，依次尝试：

```text
[FSDB]Essentials v21.1 2
[FSDB]Essentials v21.1 3
[FSDB]Essentials v21.1 4
...
```

直到以 exclusive-create 语义成功取得一个新的 staging/output name。

因此：

```text
same command executed repeatedly
→ creates separate fixtures
→ never mutates previous successful fixture
```

`--output` 指定的父目录不存在时 importer MAY 创建它；如果存在但不是 directory 或不可写，则 import fail。

---

## 4. Source Acquisition Boundary

无论 source 从哪里取得，后续 importer 只能面对一个统一模型：

```text
AcquiredSource {
  root: physical directory
  ownership: borrowed | temporary
}
```

### 4.1 Local directory

```text
--source <directory>
→ borrowed
→ never delete / modify
```

### 4.2 Local ZIP

```text
--source <zip>
→ extract into importer-owned temp
→ temporary
→ cleanup after success/failure
```

### 4.3 Automatic HTTPS download

```text
no --source
→ Eevee Expo download endpoint
→ MediaFire landing page
→ current HTTPS ZIP link
→ temporary ZIP
→ temporary extracted root
→ cleanup after success/failure
```

只有 importer 自己创建的 temporary acquisition object 才能自动删除。

### 4.4 Archive extraction safety

ZIP extraction MUST fail closed：

```text
absolute archive path          → reject
.. path traversal             → reject
entry escaping extraction root → reject
archive symlink/indirection   → reject
ambiguous duplicate target    → reject
unsupported/corrupt archive   → reject
archive > 128 MiB             → reject
entries > 10,000              → reject
uncompressed > 128 MiB        → reject
single entry > 32 MiB         → reject
```

自动下载的 2023-07-30 官方 archive identity 固定为：

```text
size:   61987094 bytes
sha256: da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665
```

自动下载若不匹配必须以 `DOWNLOAD_INTEGRITY_FAILURE` 失败。Local directory/ZIP 仍以 source shape、版本和 strict resource preflight 判定，允许开发者使用内容等价的本地重打包。

ZIP 实现方式属于 tooling implementation detail，可以使用 tooling-only dependency；不得因此给 `@loomrealm/fsdb-http` 增加 runtime dependency。

### 4.5 Source identity preflight

Acquired directory 至少应证明自己看起来是完整的 Essentials v21.1 corpus，而不是仅 GitHub engine checkout。

第一版建议要求：

```text
Graphics/
Audio/
Fonts/
Data/
PBS/
mkxp.json
```

并检查 `mkxp.json` / source metadata 中存在明确的 Essentials `v21.1` 标识。

若 source shape/version 不匹配：

```text
SOURCE_NOT_ESSENTIALS_V21_1
```

不得尝试“尽量导入”。

---

## 5. 映射模型

### 5.1 Resource directory mapping

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

### 5.2 Opaque bytes

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

文件名进行 FSDB compatibility validation，但不得静默改名。

Target writer MUST 以每个 segment 的 NFC canonical spelling 请求创建目录和文件。Source physical spelling 只用于读取和诊断；target physical path 使用 canonical directory segments 与 canonical leaf name。该 NFC 写入是 FSDB writer invariant，不是业务命名修复；source bytes 仍保持不变。

---

## 6. Strict Import 原则

Phase A 固定采用 strict semantics：

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

如果真实 corpus 证明 adaptation 有必要，应作为后续明确设计，不在当前两个参数中偷偷加入额外模式。

### 6.1 Essentials v21.1 已知兼容映射

对 2023-07-30 官方分发包的真实扫描确认了一个 FSDB extension grammar 不兼容项：

```text
Graphics/UI/itemstorage_bg.PNG
```

Phase A 对这一项采用固定、显式且 fail-closed 的兼容映射：

```text
source: Graphics/UI/itemstorage_bg.PNG
target: [resource]Graphics/UI/itemstorage_bg.png
size:   1897 bytes
sha256: a494acc6701661184a211b0de4651b79ed267cac33d1cc9097b0c84926213329
```

该映射只改变目标 physical extension，文件 bytes 必须保持不变。Importer MUST 同时匹配 source relative path、size 和 SHA-256；任一项不匹配都以 `INVALID_EXTENSION` 失败。成功应用时 MUST 在 import report 中输出 warning，不得静默处理。

这不是通用的 lowercase-extension 规则，也不放宽 FSDB Extension authority。其他大写或非法 extension 仍按 strict semantics 失败，CLI 不增加 adaptation mode 参数。

---

## 7. Resource Preflight

真正复制前 MUST 先完整扫描 acquired source，并构造计划：

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

### 7.1 NameSegment / ResourceKey

每个 table name、directory segment、leaf name必须满足当前 FSDB `NameSegment` authority。

### 7.2 UTF-8 / Unicode

物理名称必须能无损解释为有效 Unicode；logical identity 使用 NFC。

### 7.3 Normalization collision

```text
é.png
é.png
```

若 canonicalize 后 ResourceKey 相同 → import fail。

### 7.4 Extension grammar

当前 FSDB Extension：

```text
[a-z0-9][a-z0-9_-]{0,31}
```

例如：

```text
foo.PNG
foo
```

不能合法映射 → import fail。

### 7.5 Cross-extension ResourceKey collision

同 table：

```text
foo.png
foo.webp
```

均映射为：

```text
ResourceKey = foo
```

→ import fail。

### 7.6 Case portability warning

```text
Hero.png
hero.png
```

当前 FSDB logical identity 区分大小写，因此不是 Core validation failure；importer SHOULD 输出 portability warning。

### 7.7 Indirection

source 中 symlink/junction/其他 filesystem indirection 不得 follow：

```text
recognized source object is indirection
→ import fail
```

避免导入结果依赖 source root 之外的文件。

---

## 8. Output Transaction

不要边扫描边直接产生最终 output。

统一流程：

```text
acquire source
    ↓
source identity preflight
    ↓
resource scan / compatibility preflight
    ↓ PASS
reserve unique output name
    ↓
create sibling staging directory
    ↓
copy resources byte-for-byte
    ↓
generate metadata
    ↓
production openFsdb(staging)
    ↓ PASS
promote staging → reserved final output
    ↓
cleanup temporary acquisition
```

若任意步骤失败：

```text
remove importer-owned staging
remove importer-owned download/extraction temp
leave all previous successful outputs untouched
never modify borrowed local source
```

Phase A 不要求实现通用事务系统，只要求不会留下一个半完成却看起来像成功 fixture 的最终目录。

---

## 9. Generated Metadata

每个 Resource table 自动生成 `.desc.meta`，例如：

```md
Imported from Pokémon Essentials v21.1 `Graphics/`.

Generated for local LoomRealm FSDB integration testing.
Source assets are not owned or redistributed by LoomRealm.
```

`[struct]测试信息/.info.meta`：

```json
{"type":"object"}
```

`[struct]测试信息/来源.json`：

```json
{
  "name": "Pokémon Essentials",
  "version": "21.1",
  "purpose": "local fsdb-http integration fixture"
}
```

可以记录 acquisition mode：

```text
local-directory
local-zip
auto-download
```

但不得把：

```text
开发者本机绝对路径
临时下载路径
MediaFire/CDN 临时 URL
```

写入最终 FSDB fixture。

---

## 10. 最终 FSDB 验证

导入完成前 MUST 使用 production implementation：

```ts
const db = await openFsdb({ root: stagingRoot });
await db.close();
```

不得复制一套 importer-private FSDB validator 并以其结果替代 `openFsdb()`。

闭环：

```text
real third-party corpus
→ importer
→ generated FSDB
→ production openFsdb()
→ PASS
```

---

## 11. HTTP Integration Test

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

测试报告只记录 logical identity，不输出本机绝对 filesystem path。

---

## 12. Import Report

开始时应明确打印 resolved execution plan：

```text
Source:
  local: <user supplied path>
```

或：

```text
Source:
  auto-download: Eevee Expo Essentials v21.1
```

以及：

```text
Output parent: <resolved parent>
Output root:   <new generated FSDB directory name>
```

成功时建议输出：

```text
Imported Pokémon Essentials v21.1

Acquisition:
  local-directory | local-zip | auto-download

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
Output: <output root>
```

失败使用稳定 development-tool category：

```text
DOWNLOAD_FAILURE
DOWNLOAD_REDIRECT_FAILURE
DOWNLOAD_INTEGRITY_FAILURE
ARCHIVE_INVALID
ARCHIVE_PATH_ESCAPE
SOURCE_NOT_ESSENTIALS_V21_1
INVALID_UTF8_NAME
INVALID_NAME_SEGMENT
INVALID_EXTENSION
NORMALIZATION_COLLISION
RESOURCE_KEY_COLLISION
SOURCE_INDIRECTION
COPY_FAILURE
FSDB_VALIDATION_FAILURE
```

这些 category 不成为 FSDB 或 `fsdb-http` wire contract。

---

## 13. 测试目的

真实 fixture 用于暴露 synthetic fixture 很难发现的问题：

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

## 14. 后续阶段

### Phase B — PBS semantic importer

Resource mirror 稳定后另行设计：

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

## 15. Phase A 完成标准

Phase A importer 可以认为完成，当：

```text
CLI only has optional --source and --output inputs
local directory source PASS
local ZIP source PASS
no-source Eevee Expo → MediaFire landing → current HTTPS ZIP download PASS
automatic download size + SHA-256 pin enforced
download redirects handled safely
archive extraction traversal-safe
archive compressed/uncompressed/entry-count limits enforced
borrowed source never modified
temporary acquisition always cleaned up
source identity/version preflight implemented
strict FSDB compatibility preflight implemented
all planned copies byte-for-byte
no silent filename repair
output always uses a newly created directory
existing successful output never overwritten
all generated metadata deterministic
no host absolute path / temporary URL leaked
staging failure leaves no partial final output
production openFsdb(output) PASS
representative HTTP GET/HEAD PASS
byte-for-byte sampled resources PASS
large real corpus statistics reported
fixture tests run in GitHub Actions on relevant changes
```

达到此状态后，再根据真实导入结果决定是否进入 Phase B；不要在 Phase A CLI 上继续累积模式参数。
