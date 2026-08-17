# @loomrealm/fsdb-http

Read-only HTTP adapter for filesystem-backed FSDB directories.

> Status: package skeleton / design draft only. No runtime implementation yet.

The package is intended to open a validated FSDB directory, build a safe immutable index, and expose FSDB logical objects through a small HTTP interface without leaking physical filesystem paths.

Current design draft: [DESIGN.md](./DESIGN.md).

## Package boundary

This package is intentionally independent from LoomRealm Main, Renderer, Frame, Data Connection, Game Package and Content API.

```text
filesystem FSDB directory
        ↓
@loomrealm/fsdb-http
        ↓
readonly HTTP interface
```

The first implementation should prefer Node.js standard-library primitives and avoid runtime dependencies unless a concrete need appears.
