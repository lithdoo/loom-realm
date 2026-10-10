# Game Package：当前实现边界

> 源码：`packages/game-package`；正式契约：[Game Package v1](../../15-contracts/game-package-v1.md)。本文描述 logical installation/game topology，不引入 Installation Registry、Catalog Builder 或 Repository Toolkit。

## Logical topology only

`@loomrealm/game-package` 解析/验证 Game Entry：版本、Subsystem `{key}` 集合、initial target/input，产出与原始输入脱离的 immutable valid snapshot。它不是 Runtime role，也不拥有 executable/module/resource physical location。

```text
game.json
→ Game Entry validation (logical topology)
        + matching platform launch manifest
→ Platform Launcher PREPARE
→ LogicalGameBootstrap
→ Main
```

Game Entry key-set 必须与所选平台 launch manifest exact join。Definition Module/Runner resolution 由匹配的 Launcher/Profile + RuntimeHosting 实现；不得塞回通用 Game Package。Content/storage 归 Content capability，具体游戏内容与 initial input 归 `examples/`。

## Cross-platform boundary

Desktop 与 PWA 可以使用不同 launch manifest、executable carrier 与 physical hosting，但消费同一个 logical Game Package model。平台差异不得反向扩展 `game.json` 成 Node/Worker/URL/Hostra-specific bootstrap。

Current normative sources：[Game Package v1](../../15-contracts/game-package-v1.md) · [Hostra/Node launcher profile](../../15-contracts/nodejs-launcher-profile-v1.md) · [PWA launcher profile](../../15-contracts/pwa-launcher-profile-v1.md)。Decision provenance 见 [ADR0020](../../decisions/0020-game-entry-consumer-boundary.md)。

验证由 Game Package workspace tests、两平台 PREPARE/profile tests 与 product integration 承担；PWA/Hostra 历史 Mxx ledger 只作 exact-subject evidence，不承担 Current status。
