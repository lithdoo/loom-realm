# @loomrealm/renderer

Minimal M7 Renderer Control role holder.

> Status: **M7 Implemented / Qualified**

The package owns exactly one local atomic `{ peer, snapshot } | null` record. Protocol legality remains in `@loomrealm/renderer-control`; this package only performs initial handoff, whole-Snapshot replacement, peer-identity race protection, and terminal revocation.

M7 intentionally exposes no Store, subscription framework, Data/Input/Render implementation, lease, epoch, heartbeat, or Platform binding.
