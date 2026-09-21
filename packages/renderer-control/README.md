# @loomrealm/renderer-control

Transport-independent LoomRealm Renderer Control v1 protocol mechanics.

> Status: **M7 Implemented / Qualified**

The package implements the frozen current-v1 transport-independent Main and Renderer peers, exact outbound preflight, current-Snapshot validation, connection-local monotonicity, retirement, and structurally bounded latest-state publication.

The root API is intentionally narrow: frozen protocol types, the asymmetric peer constructors, and exact hello preflight. Validators, profile errors, and later-state encoding remain package-private mechanics.

- [ADR 0027 — Freeze Renderer Control v1 preimplementation closure](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)
- [Main ⇄ Renderer Control Protocol v1](../../doc/15-contracts/main-renderer-control-v1.md)

Implementation order:

- [M7 / 01 — Renderer Control Package](https://github.com/lithdoo/loom-realm/blob/2d465b8c8501566b26375dae55e1a78007606c40/M7_01_RENDERER_CONTROL_PACKAGE.md)
- [M7 / 02 — Main Renderer Authority Projection + Binding](https://github.com/lithdoo/loom-realm/blob/2d465b8c8501566b26375dae55e1a78007606c40/M7_02_MAIN_AUTHORITY_PROJECTION.md)
- [M7 / 03 — Renderer Control Holder](https://github.com/lithdoo/loom-realm/blob/2d465b8c8501566b26375dae55e1a78007606c40/M7_03_RENDERER_CONTROL_HOLDER.md)
- [M7 / 04 — Vertical Integration](https://github.com/lithdoo/loom-realm/blob/2d465b8c8501566b26375dae55e1a78007606c40/M7_04_VERTICAL_INTEGRATION.md)
- [M7 / 05 — Qualification and Closure](https://github.com/lithdoo/loom-realm/blob/2d465b8c8501566b26375dae55e1a78007606c40/M7_05_QUALIFICATION_CLOSURE.md)

Implementation MUST follow the frozen documents directly. Internal filenames/function/class names may vary, but authority ownership, `RendererControlBinding`, opaque-material bounds, Binding cancellation/terminal semantics, hello preflight/current-switch ordering, revision semantics, replacement/terminal behavior, local-vs-remote currentness boundary, structural boundedness and M8 deferral may change only through the ADR 0027 reopen process.
