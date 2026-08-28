from pathlib import Path


def rep(path, old, new):
    p=Path(path); t=p.read_text()
    if old not in t: raise SystemExit(f'missing in {path}: {old!r}')
    p.write_text(t.replace(old,new,1))

for path in ["packages/game-launcher-hostra/DESIGN.md", "packages/game-launcher-pwa/DESIGN.md"]:
    rep(path,
        "→ RuntimeControlBinding\n→ SubsystemDataBinding\n→ ContentClient\n→ runSubsystem",
        "→ M6 RuntimeControlBinding\n→ M8+ SubsystemDataBinding\n→ M12+ ContentClient\n→ runSubsystem with current-milestone capabilities")

rep("doc/10-architecture/platform-composition-system.md",
    "这些只是 Platform 在每个 role 的 local projection。\n\nConcrete `HostraPlatform` / `PwaPlatform` object MAY 同时实现多个 role-local capability view；",
    "这些只是 Platform 在每个 role 的 conceptual local projection；该列表不是一个必须整体出现的 TypeScript interface，也不表示 M5 需要一次冻结全部 ports。M5 exact Runtime hosting/control/supervision shape 由真实 Main consumer closure 决定，例如可由 `RuntimeHosting` 返回 attempt-scoped `HostedRuntime` 来自然绑定 Control 与 termination facts，而不是强制三个独立 registry/ports。\n\nConcrete `HostraPlatform` / `PwaPlatform` object MAY 同时实现多个 role-local capability view；")

rep("doc/30-implementation/phase-1-delivery-plan.md",
    "## M6：Hostra Game Launcher / Node Runner / First Game Package Consumer",
    "## M6：Hostra Platform Vertical / Launcher Component / Node Runner")

for path in ["doc/20-modules/desktop-host/README.md", "doc/20-modules/pwa-host/README.md"]:
    p=Path(path); t=p.read_text()
    needle="[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)"
    repl=needle+"、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)"
    if needle in t and "0026-session-scoped-platform-instance" not in t:
        t=t.replace(needle,repl,1)
    p.write_text(t)

print('final platform instance doc polish applied')
