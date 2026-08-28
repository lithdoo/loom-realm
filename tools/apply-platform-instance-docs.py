from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing fragment in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))

# ADR 0020: preserve the accepted boundary, point the over-concrete prepared-result shape to ADR 0021.
replace(
    "doc/decisions/0020-game-entry-consumer-boundary.md",
    "> 延续：[ADR 0017](./0017-system-level-platform-composition.md) Platform Composition ownership、[ADR 0019](./0019-platform-launch-manifest-boundary.md) Game topology / Platform executable binding 分离\n",
    "> 延续：[ADR 0017](./0017-system-level-platform-composition.md) Platform Composition ownership、[ADR 0019](./0019-platform-launch-manifest-boundary.md) Game topology / Platform executable binding 分离  \n> 后续澄清：[ADR 0021](./0021-session-scoped-platform-instance.md) 将本 ADR 决策 5 中过度具体的 `LogicalGameBootstrap + plan-bound RuntimeHosting` prepared-result 形态收敛为 session-scoped concrete Platform instance；本 ADR 的 Game Entry consumer boundary 与 Main logical-only boundary 保持不变。\n",
)

# Platform composition: concrete platform instance is the product composition object.
replace(
    "doc/10-architecture/platform-composition-system.md",
    "[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)",
    "[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-session-scoped-platform-instance.md)",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "Game source\n→ matching Platform Launcher PREPARE\n→ LogicalGameBootstrap + plan-bound RuntimeHosting\n→ Main",
    "Game source\n→ session-scoped concrete Platform instance\n    → matching Launcher component PREPARE\n    → install immutable PlatformLaunchPlan internally\n    → return LogicalGameBootstrap\n→ Main receives LogicalGameBootstrap + Main-facing Platform view",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "> **Platform Composition owns physical topology; matching Launcher owns Game + executable PREPARE; roles consume only projections/ports.**",
    "> **Concrete Platform instance is the product composition object; matching Launcher is its Game + executable PREPARE component; roles consume only logical projections and narrow role-facing capability views.**",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "→ freeze immutable PlatformLaunchPlan\n→ project immutable LogicalGameBootstrap\n→ release PreparedCurrentPlatformGame",
    "→ freeze immutable PlatformLaunchPlan\n→ install that plan into the current session-scoped concrete Platform instance\n→ project immutable LogicalGameBootstrap\n→ return the logical bootstrap to composition",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "LogicalGameBootstrap\n+ plan-bound RuntimeHosting\n+ remaining platform ports\n→ Main / Renderer / Content composition",
    "same prepared concrete Platform instance\n+ LogicalGameBootstrap\n→ Main / Renderer / Content composition\n\nMain receives only the role-local capability view it needs; the concrete Platform object may structurally satisfy several role views without becoming a universal Core service locator.",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "Main 不需要看到 plan；RuntimeHosting 在内部绑定 plan。",
    "Main 不需要看到 plan；session-scoped concrete Platform instance 持有 plan，并通过其 Main-facing `RuntimeHosting` capability 使用该 plan。`RuntimeHosting` 不再作为 Launcher prepared-result 中漂移的独立长生命周期对象。",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "这些只是 Platform 在每个 role 的 local projection。\n\nLauncher package 可以实现 Main-facing RuntimeHosting / Runner integration，但不能因此吞并其他 ports/application authority。",
    "这些只是 Platform 在每个 role 的 local projection。\n\nConcrete `HostraPlatform` / `PwaPlatform` object MAY 同时实现多个 role-local capability view；这属于 composition convenience，不等于 `@loomrealm/platform-ports` 定义一个万能 `Platform` contract。Core role 只依赖自己需要的窄 view。\n\nLauncher package 是 concrete Platform 的 PREPARE / Runner integration component；它可以提供 RuntimeHosting 的内部实现材料，但不能因此吞并 Renderer/Data/Content ports 或 application authority。",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "完整 Platform Composition：\n\n```text\napps/desktop\napps/pwa\n```\n\n窄 Runtime launch packages：",
    "完整 Platform Composition：\n\n```text\napps/desktop\n    → create HostraPlatform for one Session\n\napps/pwa\n    → create PwaPlatform for one Session\n```\n\nConcrete Platform object MAY aggregate current-platform capabilities, but package ownership remains modular. Phase 1 推荐 one Platform instance → one prepared Game → one Main Session；切换 Game / 新 Session 创建 fresh Platform instance。\n\n窄 Runtime launch packages：",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "1. Platform 是 complete physical Session composition boundary；\n2. matching Launcher 是 Runtime-product Game Entry consumer；",
    "1. session-scoped concrete Platform instance 是 complete physical Session composition object；Platform architecture / package boundary 仍保持模块化；\n2. matching Launcher 是 concrete Platform 内部的 Game PREPARE component / Runtime-product Game Entry consumer；",
)
replace(
    "doc/10-architecture/platform-composition-system.md",
    "6. Main 不解析 Game Entry、不依赖 Game Package/concrete Launcher；\n7. Main 只发 logical `launch(subsystemKey)`；",
    "6. Main 不解析 Game Entry、不依赖 Game Package/concrete Launcher；\n7. Main 接收 `LogicalGameBootstrap` + Main-facing Platform capability view；具体 Hostra/PWA object 可 structural-satisfy 该 view；\n8. Main 只发 logical `launch(subsystemKey)`；",
)
# Renumber the tail after inserted invariant.
p = Path("doc/10-architecture/platform-composition-system.md")
text = p.read_text()
for old, new in [("8. Host-owned Runner", "9. Host-owned Runner"), ("9. Hostra/PWA manifest", "10. Hostra/PWA manifest"), ("10. Launcher package", "11. Launcher package"), ("11. DataConnectionBroker", "12. DataConnectionBroker"), ("12. provisioning", "13. provisioning"), ("13. Data provisioning", "14. Data provisioning"), ("14. Control/Data", "15. Control/Data"), ("15. Hostra/PWA physical", "16. Hostra/PWA physical")]:
    text = text.replace(old, new, 1)
p.write_text(text)

# Runtime bootstrap: Main receives the prepared platform instance view, not a RuntimeHosting result from launcher.
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)",
    "[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-session-scoped-platform-instance.md)",
)
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "Platform Composition\n    realizes physical Runner/Renderer/connection/content topology",
    "Platform Composition\n    creates one session-scoped concrete Platform instance\n    which realizes physical Runner/Renderer/connection/content topology",
)
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "→ freeze immutable PlatformLaunchPlan\n→ project/freeze LogicalGameBootstrap",
    "→ freeze immutable PlatformLaunchPlan\n→ install/freeze that plan in the current concrete Platform instance\n→ project/freeze LogicalGameBootstrap",
)
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "LogicalGameBootstrap\n    → Main-visible logical facts\n\nplan-bound RuntimeHosting\n    → Main-facing launch capability",
    "LogicalGameBootstrap\n    → Main-visible logical facts\n\nprepared concrete Platform instance\n    → owns PlatformLaunchPlan privately\n    → exposes the narrow Main-facing capability view",
)
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "Main 安装：\n\n```text\nLogicalGameBootstrap.subsystemKeys",
    "Composition 在调用 Main 前已经完成：\n\n```text\nplatform.prepareGame(source)\n→ Launcher PREPARE\n→ platform installs immutable PlatformLaunchPlan\n→ returns LogicalGameBootstrap\n\nrunMain({ bootstrap, platform })\n```\n\nMain 不调用 `prepareGame()`；Main 只消费当前 Platform 对 Main 暴露的窄 capability view。\n\nMain 安装：\n\n```text\nLogicalGameBootstrap.subsystemKeys",
)
replace(
    "doc/10-architecture/runtime-bootstrap-system.md",
    "RuntimeControlBinding\nSubsystemDataBinding\nContentClient",
    "M6 RuntimeControlBinding\nM8+ SubsystemDataBinding\nM12+ ContentClient",
)

# Hostra launcher: PREPARE component of HostraPlatform, no longer returns long-lived RuntimeHosting.
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "目标：成为 Hostra Runtime-product Game bootstrap entry：内部消费 `@loomrealm/game-package`，完成 Hostra Game + Platform PREPARE，产出 Main-facing logical bootstrap 与 plan-bound RuntimeHosting，同时保持 Main/业务 platform-neutral。",
    "目标：成为 concrete Hostra Platform 内部的 Game PREPARE / Runner integration component：内部消费 `@loomrealm/game-package`，闭合 Hostra Game + executable PREPARE，产出 immutable `HostraLaunchPlan` + Main-facing logical bootstrap；long-lived Main-facing capabilities 由 session-scoped HostraPlatform instance 暴露。",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "> **这是 Hostra Subsystem Runtime launch capability package，不是 Hostra Platform mega-package。Product bootstrap caller 调本包；本包内部调 `@loomrealm/game-package`。Main 不调本包，也不调 Game Package。**",
    "> **这是 HostraPlatform 的 Game PREPARE / Runner integration component，不是 Hostra Platform 本身。Product bootstrap caller 面向 session-scoped HostraPlatform；HostraPlatform 内部调用本包，本包内部调用 `@loomrealm/game-package`。Main 不调本包，也不调 Game Package。**",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "    ├── LogicalGameBootstrap projection\n    ├── RuntimeHosting\n    └── Node Runner/supervision integration\n        ↓\nPreparedHostraGame\n        ↓\napps/desktop composition",
    "    ├── LogicalGameBootstrap projection\n    ├── immutable HostraLaunchPlan\n    └── Node Runner/supervision integration primitives\n        ↓\nPreparedHostraGame { logicalBootstrap, launchPlan }\n        ↓\nHostraPlatform.prepareGame installs plan\n        ↓\napps/desktop passes the same HostraPlatform to Main",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "Main-facing RuntimeHosting implementation",
    "HostraLaunchPlan production + plan-consumer primitives for concrete HostraPlatform RuntimeHosting",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "interface PreparedHostraGame {\n  readonly logicalBootstrap: LogicalGameBootstrap;\n  readonly runtimeHosting: RuntimeHosting;\n}",
    "interface PreparedHostraGame {\n  readonly logicalBootstrap: LogicalGameBootstrap;\n  readonly launchPlan: HostraLaunchPlan;\n}",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "→ freeze HostraLaunchPlan\n→ project/freeze LogicalGameBootstrap\n→ return PreparedHostraGame",
    "→ freeze HostraLaunchPlan\n→ project/freeze LogicalGameBootstrap\n→ return PreparedHostraGame to HostraPlatform",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "apps/desktop installs Main(logicalBootstrap, runtimeHosting, other ports)\n→ Main launch(subsystemKey)\n→ RuntimeHosting plan lookup\n→ Launch Attempt\n→ spawn Runner",
    "apps/desktop creates one HostraPlatform\n→ HostraPlatform.prepareGame(source) delegates PREPARE to this package\n→ HostraPlatform installs immutable HostraLaunchPlan\n→ apps/desktop runs Main(logicalBootstrap, same HostraPlatform)\n→ Main launch(subsystemKey) through HostraPlatform.runtimeHosting\n→ plan lookup\n→ Launch Attempt\n→ spawn Runner",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "Hostra RuntimeHosting在构造/prepare时已绑定 frozen plan。",
    "Main-facing Hostra RuntimeHosting 由 session-scoped HostraPlatform 暴露，并消费该 Platform instance 在 `prepareGame()` 时安装的 frozen plan。`PreparedHostraGame` 不再携带独立 long-lived RuntimeHosting object。",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "1. Product bootstrap caller调用 Hostra Launcher，不手动编排 Game Package；\n2. Hostra Launcher内部消费 `@loomrealm/game-package`；",
    "1. Product bootstrap caller创建并调用 session-scoped HostraPlatform，不手动编排 Game Package；\n2. HostraPlatform内部使用 Hostra Launcher component；Launcher内部消费 `@loomrealm/game-package`；",
)
replace(
    "packages/game-launcher-hostra/DESIGN.md",
    "5. Main不依赖 Game Package/concrete Launcher；\n6. Main只传 subsystemKey；",
    "5. Main不依赖 Game Package/concrete Launcher；Main 只消费 HostraPlatform 的 Main-facing narrow view；\n6. Main只传 subsystemKey；",
)

# PWA launcher: symmetric clarification.
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "目标：成为 PWA Runtime-product Game bootstrap entry：内部消费 `@loomrealm/game-package`，完成 PWA Game + Platform PREPARE，产出 Main-facing logical bootstrap 与 plan-bound RuntimeHosting，同时保持 Main/业务 platform-neutral。",
    "目标：成为 concrete PWA Platform 内部的 Game PREPARE / Worker Runner integration component：内部消费 `@loomrealm/game-package`，闭合 PWA Game + executable PREPARE，产出 immutable `PwaLaunchPlan` + Main-facing logical bootstrap；long-lived Main-facing capabilities 由 session-scoped PwaPlatform instance 暴露。",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "> **这是 PWA Subsystem Runtime launch capability package，不是 PWA Platform mega-package。Product bootstrap caller 调本包；本包内部调 `@loomrealm/game-package`。Main 不调本包，也不调 Game Package。**",
    "> **这是 PwaPlatform 的 Game PREPARE / Worker Runner integration component，不是 PWA Platform 本身。Product bootstrap caller 面向 session-scoped PwaPlatform；PwaPlatform 内部调用本包，本包内部调用 `@loomrealm/game-package`。Main 不调本包，也不调 Game Package。**",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "    ├── LogicalGameBootstrap projection\n    ├── RuntimeHosting\n    └── Worker Runner/supervision integration\n        ↓\nPreparedPwaGame\n        ↓\napps/pwa composition",
    "    ├── LogicalGameBootstrap projection\n    ├── immutable PwaLaunchPlan\n    └── Worker Runner/supervision integration primitives\n        ↓\nPreparedPwaGame { logicalBootstrap, launchPlan }\n        ↓\nPwaPlatform.prepareGame installs plan\n        ↓\napps/pwa passes the same PwaPlatform to Main",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "Main-facing RuntimeHosting implementation",
    "PwaLaunchPlan production + plan-consumer primitives for concrete PwaPlatform RuntimeHosting",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "interface PreparedPwaGame {\n  readonly logicalBootstrap: LogicalGameBootstrap;\n  readonly runtimeHosting: RuntimeHosting;\n}",
    "interface PreparedPwaGame {\n  readonly logicalBootstrap: LogicalGameBootstrap;\n  readonly launchPlan: PwaLaunchPlan;\n}",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "→ freeze PwaLaunchPlan\n→ project/freeze LogicalGameBootstrap\n→ return PreparedPwaGame",
    "→ freeze PwaLaunchPlan\n→ project/freeze LogicalGameBootstrap\n→ return PreparedPwaGame to PwaPlatform",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "apps/pwa installs Main(logicalBootstrap, runtimeHosting, other ports)\n→ Main launch(subsystemKey)\n→ RuntimeHosting plan lookup\n→ Launch Attempt\n→ create Host-owned Worker Runner",
    "apps/pwa creates one PwaPlatform\n→ PwaPlatform.prepareGame(source) delegates PREPARE to this package\n→ PwaPlatform installs immutable PwaLaunchPlan\n→ apps/pwa runs Main(logicalBootstrap, same PwaPlatform)\n→ Main launch(subsystemKey) through PwaPlatform.runtimeHosting\n→ plan lookup\n→ Launch Attempt\n→ create Host-owned Worker Runner",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "PWA RuntimeHosting在 prepare 时已绑定 frozen plan。",
    "Main-facing PWA RuntimeHosting 由 session-scoped PwaPlatform 暴露，并消费该 Platform instance 在 `prepareGame()` 时安装的 frozen plan。`PreparedPwaGame` 不再携带独立 long-lived RuntimeHosting object。",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "1. Product bootstrap caller调用 PWA Launcher，不手动编排 Game Package；\n2. PWA Launcher内部消费 `@loomrealm/game-package`；",
    "1. Product bootstrap caller创建并调用 session-scoped PwaPlatform，不手动编排 Game Package；\n2. PwaPlatform内部使用 PWA Launcher component；Launcher内部消费 `@loomrealm/game-package`；",
)
replace(
    "packages/game-launcher-pwa/DESIGN.md",
    "5. Main不依赖 Game Package/concrete Launcher；\n6. Main只传 subsystemKey；",
    "5. Main不依赖 Game Package/concrete Launcher；Main 只消费 PwaPlatform 的 Main-facing narrow view；\n6. Main只传 subsystemKey；",
)

# Main module design: role-local MainPlatform view, concrete platform can satisfy it directly.
replace(
    "doc/20-modules/main-system/README.md",
    "[ADR 0020](../../decisions/0020-game-entry-consumer-boundary.md)",
    "[ADR 0020](../../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../../decisions/0021-session-scoped-platform-instance.md)",
)
replace(
    "doc/20-modules/main-system/README.md",
    "LogicalGameBootstrap\n+\nplan-bound RuntimeHosting\n+\nremaining platform ports",
    "LogicalGameBootstrap\n+\nsession-scoped prepared concrete Platform instance\n    exposed through Main's narrow capability view",
)
replace(
    "doc/20-modules/main-system/README.md",
    "not from raw documents。\n\n---\n\n## 4. Main-facing Platform Ports",
    "not from raw documents。\n\nComposition model：\n\n```ts\nconst platform = createPwaPlatform(/* current environment/policy */);\nconst prepared = await platform.prepareGame(source);\n\nawait runMain({\n  bootstrap: prepared.logicalBootstrap,\n  platform,\n});\n```\n\nMain MUST NOT call `prepareGame()`；PREPARE belongs to product composition / concrete Platform before Main starts.\n\n---\n\n## 4. Main-facing Platform Ports",
)
replace(
    "doc/20-modules/main-system/README.md",
    "```text\nRuntimeHosting\n    launch/supervise Host-owned Runner Runtime by logical subsystemKey\n\nRuntimeControlHost\n    establish current Launch Attempt Control carrier\n\nRendererHosting\n    realize current Renderer participant\n\nRendererControlHost\n    establish Renderer Control carrier\n\nDataConnectionBroker\n    realize current DataAuthority on Renderer + Subsystem sides\n\nContentServiceIntegration\n    expose platform Content implementation\n```\n\nPorts provide physical capability/facts；Main仍拥有 application authority。\n\n`RuntimeHosting` 已绑定 immutable PlatformLaunchPlan；Main不需要 module resolver API。",
    "M5 建议先形成一个 consumer-owned role-local view：\n\n```ts\ninterface MainPlatform {\n  readonly scheduler: DeadlineScheduler;\n  readonly runtimeHosting: RuntimeHosting;\n}\n```\n\n`MainPlatform` 是 Main 当前需要的 capability bundle，不是 universal LoomRealm Platform contract。Concrete `HostraPlatform` / `PwaPlatform` MAY 是更大的 composition object，并 structural-satisfy 这个 view；`@loomrealm/main` 不依赖 concrete type。\n\nCapability 按 milestone 增长：\n\n```text\nM5\n    DeadlineScheduler\n    RuntimeHosting\n        → HostedRuntime\n            → Main-side Runtime Control establishment\n            → physical termination fact\n            → termination request capability\n\nM7\n    RendererHosting / Renderer Control binding\n\nM8/M9\n    DataConnectionBroker\n```\n\nContent 若没有 Main-owned Session-level authority，则不穿过 Main；它应由具体 Platform 直接投影到真实 role consumer。\n\nPorts provide physical capability/facts；Main仍拥有 application authority。\n\nConcrete Platform instance 已绑定 immutable PlatformLaunchPlan；其 `RuntimeHosting` capability 内部读取该 plan。Main 不需要 module resolver API。",
)

# platform-ports: concrete platform object / role-local bundle does not violate narrow-port rule.
replace(
    "packages/platform-ports/DESIGN.md",
    "也禁止：service locator、DI container、generic event bus、transport registry、generic lifecycle framework、generic Clock、platform detection API。\n\n每个 capability 独立定义、独立注入、独立 lifetime。",
    "也禁止：service locator、DI container、generic event bus、transport registry、generic lifecycle framework、generic Clock、platform detection API。\n\n这条规则 **不禁止 product composition 创建 concrete `HostraPlatform` / `PwaPlatform` object**，也不禁止 consumer package 定义只聚合当前所需 ports 的 role-local view（例如 M5 `@loomrealm/main` 的 `MainPlatform`）。区别固定为：\n\n```text\nConcrete Platform object\n    composition convenience / physical implementation aggregate\n\nconsumer-owned role view\n    narrow capability bundle for one Core role\n\n@loomrealm/platform-ports\n    individual cross-boundary capability contracts only\n```\n\nConcrete Platform MAY structural-satisfy 多个 role view；Core MUST NOT依赖其 concrete type。\n\n每个 capability 仍独立定义、独立 lifetime；role-local bundle 不获得额外 authority。",
)
replace(
    "packages/platform-ports/DESIGN.md",
    "M5 preimplementation closure 先闭合：\n\n```text\nMain-owned Launch Attempt\n        ↓\nPlatform Runtime creation\n        ↓\nControl connection\n        ↓\nMain correlation\n```",
    "M5 preimplementation closure 先闭合：\n\n```text\nsession-scoped concrete Platform instance\n    already prepared with immutable PlatformLaunchPlan\n        ↓\nMain-owned Launch Attempt\n        ↓\nPlatform Runtime creation\n        ↓\nControl connection + physical termination facts\n        ↓\nMain correlation\n```\n\nM5 exact individual ports 仍由本包冻结；若 Main 为调用 ergonomics 定义 `MainPlatform` bundle，该 bundle 属于 Main consumer surface，而不是本包的 universal Platform API。",
)

print("platform-instance documentation closure applied")
