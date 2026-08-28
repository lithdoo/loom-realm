from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing fragment in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, count))

# Global ADR reference correction (0021 already belongs to Runtime Control).
for root in [Path("doc"), Path("packages")]:
    for p in root.rglob("*.md"):
        text = p.read_text()
        updated = text.replace(
            "0021-session-scoped-platform-instance.md",
            "0026-session-scoped-platform-instance.md",
        ).replace(
            "ADR 0021](./0026-session-scoped-platform-instance.md)",
            "ADR 0026](./0026-session-scoped-platform-instance.md)",
        ).replace(
            "ADR 0021](../decisions/0026-session-scoped-platform-instance.md)",
            "ADR 0026](../decisions/0026-session-scoped-platform-instance.md)",
        ).replace(
            "ADR 0021](../../decisions/0026-session-scoped-platform-instance.md)",
            "ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)",
        )
        if updated != text:
            p.write_text(updated)

# Platform composition: product caller faces concrete Platform; Launcher is internal PREPARE component.
replace(
    "doc/10-architecture/platform-composition-system.md",
    "Hostra product\n→ @loomrealm/game-launcher-hostra\n    → @loomrealm/game-package\n    → launch.hostra.json\n\nPWA product\n→ @loomrealm/game-launcher-pwa\n    → @loomrealm/game-package\n    → launch.pwa.json",
    "Hostra product\n→ HostraPlatform.prepareGame(...)\n    → @loomrealm/game-launcher-hostra component\n        → @loomrealm/game-package\n        → launch.hostra.json\n\nPWA product\n→ PwaPlatform.prepareGame(...)\n    → @loomrealm/game-launcher-pwa component\n        → @loomrealm/game-package\n        → launch.pwa.json",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "Matching Launcher MUST 在任何 business Runtime side effect前完成：\n\n```text\nobtain Game Entry\n→ @loomrealm/game-package parse/validate\n→ validate own Platform Launch Manifest\n→ exact key-set join\n→ resolve every required executable binding\n→ validate installation/security/hosting capability\n→ freeze immutable PlatformLaunchPlan\n→ install that plan into the current session-scoped concrete Platform instance\n→ project immutable LogicalGameBootstrap\n→ return the logical bootstrap to composition\n```",
    "Concrete Platform 的 `prepareGame()` MUST 在任何 business Runtime side effect前，通过 matching Launcher component 完成：\n\n```text\nLauncher component\n    obtain Game Entry\n    → @loomrealm/game-package parse/validate\n    → validate own Platform Launch Manifest\n    → exact key-set join\n    → resolve every required executable binding\n    → validate installation/security/hosting capability\n    → freeze immutable PlatformLaunchPlan\n    → project immutable LogicalGameBootstrap\n\nConcrete Platform.prepareGame(...)\n    → install/freeze PlatformLaunchPlan internally\n    → return LogicalGameBootstrap to composition\n```",
)

# Runtime bootstrap: same product-facing path and ownership.
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "Game source / installation\n→ matching Platform Launcher\n    → @loomrealm/game-package parse/validate\n    → current Platform Launch Manifest parse/validate",
    "Game source / installation\n→ session-scoped concrete Platform.prepareGame(...)\n    → matching Launcher component\n        → @loomrealm/game-package parse/validate\n        → current Platform Launch Manifest parse/validate",
)
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "Session physical bootstrap前 matching Launcher MUST 完成：\n\n```text\nGame Entry validation\n→ current Platform Launch Manifest validation\n→ exact Game↔Platform key-set join\n→ resolve every required platform implementation\n→ validate current Platform hosting/security capability\n→ freeze immutable PlatformLaunchPlan\n→ install/freeze that plan in the current concrete Platform instance\n→ project/freeze LogicalGameBootstrap\n```",
    "Session physical bootstrap前，concrete Platform `prepareGame()` MUST 已通过 matching Launcher component 完成：\n\n```text\nLauncher component\n    Game Entry validation\n    → current Platform Launch Manifest validation\n    → exact Game↔Platform key-set join\n    → resolve every required platform implementation\n    → validate current Platform hosting/security capability\n    → freeze immutable PlatformLaunchPlan\n    → project/freeze LogicalGameBootstrap\n\nConcrete Platform\n    → install/freeze PlatformLaunchPlan internally\n```",
)

# Main module wording.
replace(
    "doc/20-modules/main-system/README.md",
    "主要定义：Main 内部 authority/transaction/recovery 模块、LogicalGameBootstrap input，以及 plan-bound Main-facing Platform ports",
    "主要定义：Main 内部 authority/transaction/recovery 模块、LogicalGameBootstrap input、session-scoped concrete Platform composition，以及 Main-facing narrow capability view",
)

# Launcher designs: references, position, duplicate plan line, and standard caller ownership.
for path, platform, launcher, plan, app in [
    ("packages/game-launcher-hostra/DESIGN.md", "HostraPlatform", "@loomrealm/game-launcher-hostra", "HostraLaunchPlan", "apps/desktop"),
    ("packages/game-launcher-pwa/DESIGN.md", "PwaPlatform", "@loomrealm/game-launcher-pwa", "PwaLaunchPlan", "apps/pwa"),
]:
    p = Path(path)
    text = p.read_text()
    text = text.replace(
        "消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)",
        "消费边界：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../../doc/decisions/0026-session-scoped-platform-instance.md)",
    )
    # Position starts at product-facing platform, not low-level launcher.
    first = "Hostra game source / installation" if platform == "HostraPlatform" else "PWA game source / installation"
    text = text.replace(
        f"{first}\n        ↓\n{launcher}",
        f"{app} / product entry\n        ↓\n{platform}.prepareGame(source)\n        ↓\n{launcher} component",
        1,
    )
    text = text.replace(
        f"    ├── immutable {plan}\n    ├── LogicalGameBootstrap projection\n    ├── immutable {plan}",
        f"    ├── immutable {plan}\n    ├── LogicalGameBootstrap projection",
        1,
    )
    text = text.replace(
        "调用者不应被迫先构造 `ValidatedGameEntryV1`。",
        f"标准 Runtime-product caller 面向 `{platform}.prepareGame(...)`，不应被迫先构造 `ValidatedGameEntryV1`。下列 low-level Launcher API 是 `{platform}` 内部 integration surface，也可用于 tooling/test。",
        1,
    )
    source_word = "Hostra" if platform == "HostraPlatform" else "PWA"
    text = text.replace(
        f"caller supplies {source_word} source/installation capability\nlauncher obtains Game Entry\nlauncher invokes @loomrealm/game-package\ncaller does not orchestrate common validation manually",
        f"{platform} supplies {source_word} source/installation capability to Launcher component\nlauncher obtains Game Entry\nlauncher invokes @loomrealm/game-package\nproduct caller does not orchestrate common validation or call Game Package manually",
        1,
    )
    marker = f"interface Prepared{source_word}Game {{"
    if marker in text:
        end = text.index("```", text.index(marker))
        # Add semantic note after the code fence if not present.
        fence_end = text.index("\n", end + 3)
        note = f"\n`Prepared{source_word}Game` 是 `{platform}` 内部的 PREPARE integration value，不是 Main-facing DTO；`{plan}` MUST 在 `prepareGame()` 成功时被 Platform instance 安装并保持 private。\n"
        if note.strip() not in text:
            text = text[:fence_end+1] + note + text[fence_end+1:]
    text = text.replace("最近复核：2026-08-20", "最近复核：2026-08-28", 1)
    p.write_text(text)

# Runtime hosting: prepared Platform owns plan; runner capabilities are milestone-gated.
replace(
    "doc/10-architecture/runtime-hosting-system.md",
    "依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)",
    "依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)",
)
replace(
    "doc/10-architecture/runtime-hosting-system.md",
    "在任何 business Runtime side effect 前，matching Platform Launcher MUST 已完成：\n\n```text\nGame Entry validation via @loomrealm/game-package\n→ Platform Launch Manifest validation\n→ exact Game↔Platform key-set join\n→ every required executable binding resolution\n→ installation/security containment\n→ current hosting capability preflight\n→ freeze immutable PlatformLaunchPlan\n→ project immutable LogicalGameBootstrap\n```",
    "在任何 business Runtime side effect 前，current concrete Platform `prepareGame()` MUST 已通过 matching Launcher component 完成：\n\n```text\nGame Entry validation via @loomrealm/game-package\n→ Platform Launch Manifest validation\n→ exact Game↔Platform key-set join\n→ every required executable binding resolution\n→ installation/security containment\n→ current hosting capability preflight\n→ freeze immutable PlatformLaunchPlan\n→ project immutable LogicalGameBootstrap\n→ concrete Platform installs the plan privately\n```",
)
replace(
    "doc/10-architecture/runtime-hosting-system.md",
    "Main 不得通过 bootstrap 获得 executable material；RuntimeHosting 不得要求 Main重新传 Game Entry/manifest。",
    "Main 不得通过 bootstrap 获得 executable material；session-scoped concrete Platform instance 持有 immutable PlatformLaunchPlan，并通过其 Main-facing RuntimeHosting capability 使用该 plan。RuntimeHosting 不得要求 Main重新传 Game Entry/manifest。",
)
replace(
    "doc/10-architecture/runtime-hosting-system.md",
    "construct RuntimeControlBinding\nconstruct SubsystemDataBinding\nconstruct ContentClient\ninvoke runSubsystem(...)",
    "M6 construct RuntimeControlBinding\nM8+ construct SubsystemDataBinding when Data slice lands\nM12+ construct ContentClient when Content slice lands\ninvoke runSubsystem(...) with only capabilities implemented by the current milestone",
)
replace(
    "doc/10-architecture/runtime-hosting-system.md",
    "RuntimeHosting 是 logical launch port，而不是 module loader API。",
    "RuntimeHosting 是 prepared concrete Platform instance 对 Main 暴露的 logical launch capability，而不是 module loader API。其 exact M5 TypeScript shape 由 `@loomrealm/platform-ports` 的 M5 consumer closure 冻结；本文只冻结 responsibility。",
)
replace(
    "doc/10-architecture/runtime-hosting-system.md",
    "最近复核：2026-08-20",
    "最近复核：2026-08-28",
)

# Desktop composition: create session-scoped HostraPlatform first.
replace(
    "doc/20-modules/desktop-host/README.md",
    "Hostra game installation/source\n        ↓\n@loomrealm/game-launcher-hostra PREPARE\n    ├── @loomrealm/game-package validates Game Entry\n    ├── validates launch.hostra.json\n    ├── exact key-set join\n    ├── full executable/security preflight\n    ├── immutable HostraLaunchPlan\n    └── immutable LogicalGameBootstrap\n        ↓\nPreparedHostraGame\n        ↓\napps/desktop\n├── installs Main(logicalBootstrap + plan-bound RuntimeHosting)",
    "apps/desktop / product entry\n        ↓\ncreate session-scoped HostraPlatform\n        ↓\nHostraPlatform.prepareGame(installation/source)\n        ↓\n@loomrealm/game-launcher-hostra PREPARE component\n    ├── @loomrealm/game-package validates Game Entry\n    ├── validates launch.hostra.json\n    ├── exact key-set join\n    ├── full executable/security preflight\n    ├── immutable HostraLaunchPlan → installed privately in HostraPlatform\n    └── immutable LogicalGameBootstrap → returned to composition\n        ↓\nrunMain({ bootstrap: logicalBootstrap, platform: same HostraPlatform })\n        ↓\nHostraPlatform\n├── Main-facing RuntimeHosting / scheduler",
)
replace(
    "doc/20-modules/desktop-host/README.md",
    "Product bootstrap caller调用 Hostra Launcher，而不是：",
    "Product bootstrap caller调用 `HostraPlatform.prepareGame(...)`；HostraPlatform 内部调用 Hostra Launcher component，而不是让 product caller：",
)
replace(
    "doc/20-modules/desktop-host/README.md",
    "Main receives：\n\n```text\nLogicalGameBootstrap\n    subsystemKeys\n    initial {subsystemKey,input}\n\nplan-bound RuntimeHosting\n```",
    "Main receives：\n\n```text\nLogicalGameBootstrap\n    subsystemKeys\n    initial {subsystemKey,input}\n\nMain-facing capability view\n    structurally satisfied by the same prepared HostraPlatform instance\n```",
)
replace(
    "doc/20-modules/desktop-host/README.md",
    "`apps/desktop` 可以持有 prepared Hostra result，但 MUST NOT重新解释 raw config。",
    "`HostraPlatform` 持有 frozen HostraLaunchPlan；`apps/desktop` 只负责编排 `prepareGame()` 与 `runMain()`，MUST NOT重新解释 raw config。Main 不读取 HostraLaunchPlan。",
)
replace(
    "doc/20-modules/desktop-host/README.md",
    "construct RuntimeControlBinding\n→ construct SubsystemDataBinding\n→ construct ContentClient\n→ runSubsystem(...)".replace("construct RuntimeControlBinding\n→", "construct RuntimeControlBinding\n→"),
    "construct RuntimeControlBinding\n→ M8+ construct SubsystemDataBinding\n→ M12+ construct ContentClient\n→ runSubsystem(...) with current-milestone capabilities",
)
replace(
    "doc/20-modules/desktop-host/README.md",
    "最近复核：2026-08-20",
    "最近复核：2026-08-28",
)

# PWA composition: symmetric.
replace(
    "doc/20-modules/pwa-host/README.md",
    "PWA game installation/source\n        ↓\n@loomrealm/game-launcher-pwa PREPARE\n    ├── @loomrealm/game-package validates Game Entry\n    ├── validates launch.pwa.json\n    ├── exact key-set join\n    ├── full installation/origin/security preflight\n    ├── immutable PwaLaunchPlan\n    └── immutable LogicalGameBootstrap\n        ↓\nPreparedPwaGame\n        ↓\napps/pwa\n├── installs Main(logicalBootstrap + plan-bound RuntimeHosting)",
    "apps/pwa / product entry\n        ↓\ncreate session-scoped PwaPlatform\n        ↓\nPwaPlatform.prepareGame(installation/source)\n        ↓\n@loomrealm/game-launcher-pwa PREPARE component\n    ├── @loomrealm/game-package validates Game Entry\n    ├── validates launch.pwa.json\n    ├── exact key-set join\n    ├── full installation/origin/security preflight\n    ├── immutable PwaLaunchPlan → installed privately in PwaPlatform\n    └── immutable LogicalGameBootstrap → returned to composition\n        ↓\nrunMain({ bootstrap: logicalBootstrap, platform: same PwaPlatform })\n        ↓\nPwaPlatform\n├── Main-facing RuntimeHosting / scheduler",
)
replace(
    "doc/20-modules/pwa-host/README.md",
    "Product bootstrap caller 调 PWA Launcher，而不是：",
    "Product bootstrap caller 调 `PwaPlatform.prepareGame(...)`；PwaPlatform 内部调用 PWA Launcher component，而不是让 product caller：",
)
replace(
    "doc/20-modules/pwa-host/README.md",
    "Main receives：\n\n```text\nLogicalGameBootstrap\n    subsystemKeys\n    initial {subsystemKey,input}\n\nplan-bound RuntimeHosting\n```",
    "Main receives：\n\n```text\nLogicalGameBootstrap\n    subsystemKeys\n    initial {subsystemKey,input}\n\nMain-facing capability view\n    structurally satisfied by the same prepared PwaPlatform instance\n```",
)
replace(
    "doc/20-modules/pwa-host/README.md",
    "`apps/pwa` MAY hold prepared result but MUST NOT re-interpret raw config。",
    "`PwaPlatform` 持有 frozen PwaLaunchPlan；`apps/pwa` 只负责编排 `prepareGame()` 与 `runMain()`，MUST NOT re-interpret raw config。Main 不读取 PwaLaunchPlan。",
)
replace(
    "doc/20-modules/pwa-host/README.md",
    "construct RuntimeControlBinding\n→ construct SubsystemDataBinding\n→ construct ContentClient\n→ runSubsystem(...)".replace("construct RuntimeControlBinding\n→", "construct RuntimeControlBinding\n→"),
    "construct RuntimeControlBinding\n→ M8+ construct SubsystemDataBinding\n→ M12+ construct ContentClient\n→ runSubsystem(...) with current-milestone capabilities",
)
replace(
    "doc/20-modules/pwa-host/README.md",
    "最近复核：2026-08-20",
    "最近复核：2026-08-28",
)

# Package architecture: allow concrete composition object; make launcher an internal component of it.
replace(
    "doc/30-implementation/package-architecture.md",
    "[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)",
    "[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)",
)
replace(
    "doc/30-implementation/package-architecture.md",
    "@loomrealm/game-package\n        ↓\nmatching game-launcher-*\n        ↓\napps/* composition",
    "@loomrealm/game-package\n        ↓\nmatching game-launcher-* component\n        ↓\nsession-scoped concrete Platform composition\n        ↓\napps/* product entry",
)
replace(
    "doc/30-implementation/package-architecture.md",
    "M5+ Main/Renderer/Data/Content ports 只在对应 real consumer closure 时增长；不得提前建立万能 `Platform` object、service locator 或 future port inventory。",
    "M5+ Main/Renderer/Data/Content ports 只在对应 real consumer closure 时增长；不得提前建立 universal Core `Platform` contract、service locator 或 future port inventory。Product composition MAY 创建 session-scoped concrete `HostraPlatform` / `PwaPlatform` object 来聚合真实实现；Core role 只依赖自己的 narrow capability view。",
)

# Phase plan: M5 uses MainPlatform view, M6 builds HostraPlatform composition around launcher component.
replace(
    "doc/30-implementation/phase-1-delivery-plan.md",
    "Main MUST NOT depend on Game Package/concrete Launcher。\n\nFake RuntimeHosting is already plan-bound；M5 does not implement Game/Platform PREPARE。",
    "Main MUST NOT depend on Game Package/concrete Launcher。M5 同时冻结 Main-facing narrow capability view（概念 `MainPlatform`），由 Fake Platform structural-satisfy；不得把 concrete Hostra/PWA type引入 Main。\n\nFake concrete Platform is already logically prepared / plan-bound and exposes RuntimeHosting；M5 does not implement Game/Platform PREPARE。",
)
replace(
    "doc/30-implementation/phase-1-delivery-plan.md",
    "@loomrealm/game-launcher-hostra\nHostra Game source integration\ninternal Game Package consumption\nHostra manifest/join/resolver/preflight\nHostraLaunchPlan\nLogicalGameBootstrap projection\nplan-bound RuntimeHosting\nHost-owned Node Runner\nprocess Supervisor",
    "session-scoped HostraPlatform composition object\n    prepareGame(source)\n    Main-facing RuntimeHosting / scheduler view\n\n@loomrealm/game-launcher-hostra component\n    Hostra Game source integration\n    internal Game Package consumption\n    Hostra manifest/join/resolver/preflight\n    HostraLaunchPlan\n    LogicalGameBootstrap projection\n    Runner/RuntimeHosting implementation primitives\n\nHost-owned Node Runner\nprocess Supervisor",
)
replace(
    "doc/30-implementation/phase-1-delivery-plan.md",
    "PREPARE hard gate completes before first process/import/Runtime Control side effect。",
    "HostraPlatform `prepareGame()` delegates PREPARE to Launcher component, installs the immutable HostraLaunchPlan privately, then composition calls Main with `{bootstrap, platform}`. PREPARE hard gate completes before first process/import/Runtime Control side effect。",
)

# ADR index: catch up 22-26 and record supersession nuance.
replace(
    "doc/decisions/README.md",
    "21. [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./0021-runtime-control-preimplementation-closure.md)\n",
    "21. [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./0021-runtime-control-preimplementation-closure.md)\n22. [ADR 0022：Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)\n23. [ADR 0023：User Input v1 semantic closure](./0023-user-input-v1-semantic-closure.md)\n24. [ADR 0024：Renderer ⇄ Subsystem Data Connection v1 semantic closure](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)\n25. [ADR 0025：Renderer Data Profile v1 preimplementation closure](./0025-renderer-data-profile-v1-preimplementation-closure.md)\n26. [ADR 0026：Concrete Platform 是 Session Composition Object，Launcher 是 Platform 内部 PREPARE Component](./0026-session-scoped-platform-instance.md)\n",
)
replace(
    "doc/decisions/README.md",
    "ADR 0020\n    → Game Package = document validation capability, not Runtime role\n    → matching Platform Launcher owns Runtime-product Game Entry consumption\n    → GameEntryV1 != Main bootstrap model\n    → Main has no Game Package/concrete Launcher dependency\n    → Main consumes immutable LogicalGameBootstrap only",
    "ADR 0020\n    → Game Package = document validation capability, not Runtime role\n    → matching Platform Launcher owns Runtime-product Game Entry consumption\n    → GameEntryV1 != Main bootstrap model\n    → Main has no Game Package/concrete Launcher dependency\n    → Main consumes immutable LogicalGameBootstrap only\n    → prepared-result `LogicalGameBootstrap + RuntimeHosting` shape clarified/superseded by ADR 0026",
)
replace(
    "doc/decisions/README.md",
    "ADR 0021\n    → Runtime Control package root-only + role-specific peers",
    "ADR 0021\n    → Runtime Control package root-only + role-specific peers",
)
# Insert ADR0026 relationship after ADR0021 block ending no second parser.
replace(
    "doc/decisions/README.md",
    "    → duplicate JSON source semantics follow frozen Wire/JSON.parse\n    → no second JSON parser\n```",
    "    → duplicate JSON source semantics follow frozen Wire/JSON.parse\n    → no second JSON parser\n\nADR 0026\n    → concrete Platform is session-scoped product composition object\n    → Launcher is Platform-internal PREPARE component\n    → PlatformLaunchPlan installed privately in concrete Platform\n    → Main receives LogicalGameBootstrap + Main-facing narrow Platform view\n    → concrete Platform object does not create universal Core Platform contract/mega-package\n```",
)
replace(
    "doc/decisions/README.md",
    "Game installation / source\n        ↓\nCurrent Platform Launcher PREPARE\n    ├── @loomrealm/game-package\n    │       Game Entry {key...} + initial validation\n    ├── Current Platform Launch Manifest\n    │       Hostra: launch.hostra.json\n    │       PWA:    launch.pwa.json\n    ├── exact key-set join\n    ├── full executable resolution\n    └── hosting/security preflight\n        ↓\nimmutable PlatformLaunchPlan\n+\nimmutable LogicalGameBootstrap\n        ↓\napps/* installs Main\n        ↓\nMain launch(key) ─────────────► plan-bound RuntimeHosting",
    "Game installation / source\n        ↓\nSession-scoped Concrete Platform.prepareGame(...)\n        ↓\nCurrent Platform Launcher component PREPARE\n    ├── @loomrealm/game-package\n    │       Game Entry {key...} + initial validation\n    ├── Current Platform Launch Manifest\n    │       Hostra: launch.hostra.json\n    │       PWA:    launch.pwa.json\n    ├── exact key-set join\n    ├── full executable resolution\n    └── hosting/security preflight\n        ↓\nimmutable PlatformLaunchPlan → installed privately in Platform\nimmutable LogicalGameBootstrap → returned to composition\n        ↓\napps/* runs Main({ bootstrap, platform })\n        ↓\nMain launch(key) ─────────────► Platform.runtimeHosting",
)
replace(
    "doc/decisions/README.md",
    "最近复核：2026-08-21",
    "最近复核：2026-08-28",
)

# Update review dates for the main architecture facts touched earlier.
for path in [
    "doc/10-architecture/platform-composition-system.md",
    "doc/10-architecture/runtime-bootstrap-system.md",
    "doc/20-modules/main-system/README.md",
    "packages/platform-ports/DESIGN.md",
    "doc/30-implementation/package-architecture.md",
    "doc/30-implementation/phase-1-delivery-plan.md",
]:
    p = Path(path)
    text = p.read_text()
    # Only first metadata occurrence.
    import re
    text = re.sub(r"最近复核：2026-08-(?:20|27)", "最近复核：2026-08-28", text, count=1)
    p.write_text(text)

# Guard against the exact superseded prepared-result API in active launcher docs.
for path in ["packages/game-launcher-hostra/DESIGN.md", "packages/game-launcher-pwa/DESIGN.md"]:
    text = Path(path).read_text()
    if "readonly runtimeHosting: RuntimeHosting" in text:
        raise SystemExit(f"stale prepared RuntimeHosting surface remains in {path}")
    if text.count("├── immutable HostraLaunchPlan") > 1 or text.count("├── immutable PwaLaunchPlan") > 1:
        raise SystemExit(f"duplicate launch plan line remains in {path}")

print("platform-instance facts closed")
