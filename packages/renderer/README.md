# @loomrealm/renderer

Renderer Control holder with M8 role-local Data reconciliation.

> Status: **M8 Implemented / Qualified**

The package owns one atomic Control `{ peer, snapshot } | null` record and one private Data slot per desired subsystem authority. Protocol legality remains in `@loomrealm/renderer-control` and `@loomrealm/data`; this package performs whole-Snapshot replacement plus identity-safe Data acquire/install/clear/close reconciliation.

`connect()` is a fail-fast serialized entry point: callers MUST NOT start another connection attempt on the same holder until the previous attempt settles. Sequential connection attempts still provide atomic replacement.

The only M8 construction seam is `createRendererControlHolder(data?: RendererDataBinding)`. It intentionally exposes no Store, subscription framework, Input/Render business state, lease, heartbeat, Broker, or mutable registration API.
