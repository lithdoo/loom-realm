# @loomrealm/renderer-control

Transport-independent LoomRealm Renderer Control v1 protocol mechanics.

> Status: **Implementation scaffold / Protocol + M7 implementation design Frozen / implementation pending**

The package implementation has not started yet, but its current-v1 semantics, package boundary, Main/Renderer integration boundary, Platform Binding, race rules and qualification requirements are frozen by:

- [ADR 0027 — Freeze Renderer Control v1 preimplementation closure](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)
- [Main ⇄ Renderer Control Protocol v1](../../doc/15-contracts/main-renderer-control-v1.md)

Implementation order:

- [M7 / 01 — Renderer Control Package](../../M7_01_RENDERER_CONTROL_PACKAGE.md)
- [M7 / 02 — Main Renderer Authority Projection + Binding](../../M7_02_MAIN_AUTHORITY_PROJECTION.md)
- [M7 / 03 — Renderer Control Holder](../../M7_03_RENDERER_CONTROL_STORE.md)
- [M7 / 04 — Vertical Integration](../../M7_04_VERTICAL_INTEGRATION.md)
- [M7 / 05 — Qualification and Closure](../../M7_05_QUALIFICATION_CLOSURE.md)

Implementation MUST follow the frozen documents directly. Internal filenames/function/class names may vary, but authority ownership, `RendererControlBinding`, hello preflight/current-switch ordering, revision semantics, replacement/terminal behavior, structural boundedness and M8 deferral may change only through the ADR 0027 reopen process.
