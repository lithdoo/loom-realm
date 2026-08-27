from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


path = "doc/30-implementation/package-architecture.md"
replace(
    path,
    """```text
@loomrealm/foundation        @loomrealm/wire
        \\                         /
         \\                       /
          └── @loomrealm/runtime-control
                     ↓
              Main / Subsystem Host

@loomrealm/wire
        ↓
@loomrealm/game-package
        ↓
matching game-launcher-*
        ↓
apps/* composition
```""",
    """```text
@loomrealm/foundation ─────→ @loomrealm/platform-ports
        │                           ↓
        ├──────────────┐     Core role integrations
        │              ↓
@loomrealm/wire ─→ @loomrealm/runtime-control
        │              ↓
        │       Main / Subsystem Host
        ↓
@loomrealm/game-package
        ↓
matching game-launcher-*
        ↓
apps/* composition
```""",
)
replace(
    path,
    """M3 scheduler stays a package-local injected port；do not expand Foundation Clock for one consumer。""",
    """M3 `RuntimeControlScheduler` remains a Runtime Control-owned structural constructor input；M4 `DeadlineScheduler` independently defines the Core↔Platform deadline capability with the same shape。Neither requires a generic Foundation Clock。""",
)
replace(
    path,
    """```text
single role consumes
    → role package integration surface

multiple stable independent consumers
    → smallest shared capability package

only one app glue consumes
    → app internal
```

Thus：""",
    """```text
protocol-specific mechanics/input
    → owning protocol package

Core ↔ Platform capability/fact
with stable platform-neutral semantics
    → @loomrealm/platform-ports

role-specific policy/orchestration
    → owning role integration surface

only one app glue consumes
    → app internal
```

A single Core role consumer does not by itself make a cross-Platform capability role-owned；ownership follows the semantic boundary, not consumer count alone。

Thus：""",
)

path = "doc/30-implementation/repository-layout.md"
replace(
    path,
    """`RuntimeControlScheduler` remains a package-local injected port；no generic Foundation Clock until independent reuse exists。""",
    """`RuntimeControlScheduler` remains Runtime Control-owned；`@loomrealm/platform-ports` separately exposes the structural-compatible M4 `DeadlineScheduler` for Core↔Platform injection。No generic Foundation Clock。""",
)
replace(
    path,
    """## 12. Role-facing Port Placement

```text
packages/main/src/platform/
packages/subsystem/src/host/platform-ports.ts
packages/renderer/src/platform/
```

Typical：

```text
RuntimeHosting
RendererDataBinding
SubsystemDataBinding
```

Runtime Control scheduler/deadlines are protocol-mechanics constructor inputs, not Main application authority or Platform launch manifest fields。

System-level `DataConnectionBroker` stays composition/integration unless real shared capability emerges。""",
    """## 12. Role-facing Port Placement

Shared Core↔Platform capability contracts live only in：

```text
packages/platform-ports/src/index.ts
```

Role packages contain consumer-side orchestration/policy, not duplicate Platform contract owners：

```text
packages/main/src/platform/       # M5+ consumer-side integration as frozen
packages/subsystem/src/host/      # M4 consumer-side orchestration/policy
packages/renderer/src/platform/   # future consumer-side integration as frozen
```

M4 frozen：

```text
platform-ports owns DeadlineScheduler / RuntimeControlBinding
subsystem/host consumes them
subsystem/host owns SubsystemRuntimeControlPolicy
```

Future `RuntimeHosting` / Renderer Data binding / Subsystem Data binding exact shapes are added only at their real milestone closure；M4 MUST NOT create role-local placeholder contracts。System-level `DataConnectionBroker` stays composition/integration unless a later frozen Platform port requires a shared contract。""",
)

print("final platform-port rule alignment applied")
