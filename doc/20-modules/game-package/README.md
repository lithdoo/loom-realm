# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Manifest / Entry / Descriptor Loader、Launcher Entry 校验、Catalog、Repository、资源和 Validator 的模块边界  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[Game Package v1](../../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)  
> 最近复核：2026-08-09

## 1. 建议模块

```text
Game Package
├── Safe Package Root
├── Manifest Loader
├── Entry Loader
├── Subsystem Descriptor Loader / Validator
├── Launcher Entry Validator
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── Package Validator
```

Launcher 的 Process / Worker 创建属于 Main / Runtime Supervisor，不属于 Game Package Loader。

## 2. Safe Package Root

Safe Package Root持有可信 Installation Root，并为内容路径与 Launcher Entry提供底层 canonicalization/containment primitive。

```text
Content path policy
!=
Launcher executable path policy
```

可以复用安全路径 primitive，但允许的输入和能力由各自正式契约决定。其他模块不得自行拼接未经验证的本机路径。

## 3. Manifest / Entry Loader

Manifest Loader：读取 UTF-8 JSON、校验格式/版本/公共字段、返回规范化 Manifest，不加载大型内容主体、不启动 Subsystem。

Entry Loader：读取 Game Entry、解析 initial target、读取完整 `subsystems[]`、保留业务 `params`，不解释地图等 Subsystem-specific字段。

## 4. Subsystem Descriptor Validator

Desktop v1：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: {
    readonly type: "nodejs";
    readonly entry: string;
  };
  readonly env?: Readonly<Record<string, string>>;
}
```

职责：

- Descriptor Schema；
- duplicate `key`；
- Host-supported Launcher Type；
- `launcher.entry` syntax + `.mjs/.cjs` module type；
- reject plain `.js` implicit `package.json.type` semantics；
- env count/key/value/reserved fields；
- initial target references declared Subsystem；
- hand normalized Descriptor set to Main Descriptor Registry。

Descriptor集合级校验 MUST 在任何业务 Runtime spawn前完成。

不负责 spawn、Bootstrap Token、Control Connection或 Node executable选择。

## 5. Launcher Entry Validator

按照 [Game Package v1](../../15-contracts/game-package-v1.md) 与 [Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)：

```text
entry syntax / explicit .mjs|.cjs
→ Installation-relative resolution
→ reject symlink/junction/reparse redirect
→ regular-file check
→ canonical containment
```

安装/`validate` SHOULD提前遍历全部 required Entry；正式 `start` MUST在对应 Runtime spawn前再次保证目标满足契约。

Validator返回 logical validation result或 Host-private resolved target，不向业务模块暴露 physical path。

## 6. Catalog / Repository

Catalog扫描必要 Namespace与轻量 metadata，建立 logical ID → validated content location index，不读取全部大型主体，也不承担 Launcher Registry。

Repository Toolkit提供：

- async readonly fetch；
- parse/local validation；
- same-ID concurrent dedup；
- Runtime-local cache；
- immutable results；
- close/cancel。

具体业务 Repository属于对应 Subsystem。

## 7. Resource Metadata Service

只处理 logical resource metadata、MIME、Content Version 与 Package Index关系。resource body由 Content API交付。

不生成 Render State，也不绑定 Frame lifecycle。

## 8. Package Validator

```text
Manifest / Entry
→ Descriptor Schema
→ duplicate key
→ initial target references
→ Launcher Type support
→ Launcher Entry syntax/module type/physical safety
→ env reserved-key conflicts
→ case-collision checks
→ required content references
→ Catalog / Package Index
```

Validator聚合错误，不创建正式 Frame，也不运行正式 Session。Descriptor集合级错误 MUST没有 Process/Worker side effect。

## 9. Trust Boundary

```text
Package Validator
    validates declarations / paths / content inputs

Main Launcher
    executes validated Entry

Desktop Node.js Process
    trusted executable code
    v1 does not provide OS sandbox
```

Entry path安全不表示执行的 JavaScript没有 OS filesystem/network/child_process权限。

普通 Content API仍不暴露任意物理路径或执行能力。

## 10. 核心不变量

- Game Entry一次性声明当前会话完整 Subsystem Descriptor set；
- Descriptor identity=`key`；
- Desktop Launcher Type=`nodejs`；
- Game Package模块只加载/校验 Descriptor，不启动 Runtime；
- Launcher Entry在 spawn前安全解析；
- `.mjs/.cjs`显式 module semantics，plain `.js`不支持；
- Launcher是 Main特权能力；
- Game Package不能提供 Node executable/flags/argv；
- env不能覆盖 `LOOMREALM_*`、`NODE_OPTIONS`、`NODE_PATH`；
- Game Package运行期间只读；
- Content API与 Launcher是不同能力边界；
- public Loader不解释 business params；
- Catalog不缓存大型主体；
- physical path不进入 Render State；
- 所有解析输入有 bounds。

## 11. Tests

至少覆盖：

```text
manifest/entry valid-invalid
duplicate descriptor key
unsupported launcher
undeclared initial target
absolute/traversal/URL/backslash entry
valid .mjs/.cjs
.js/missing/directory/unsupported extension
symlink entry/ancestor/installation escape
case collision
reserved env keys
catalog does not eagerly read large bodies
repository concurrent dedup
validate aggregates errors
descriptor-set failure has zero Runtime side effects
```
