# Viewport Core — Cursor optimization re-qualification evidence

- Branch: `cursor/resize-viewport`
- Optimization plan commit (start HEAD): `13c79d102a0496965fa043fe2d84c3ac8526dbc3`
- Implementation SHA (final executable): `a0f664f29e687fc35e966fcc7675c7f2db808a3c`
- Node: `v22.12.0`
- OS: Windows 10.0.19044 AMD64
- Date: 2026-09-18

## RED-before-fix (T-03)

Prior to the three production fixes, these failing fixtures were recorded:

| ID | Fixture | Expected | Actual (pre-fix) | Log |
|---|---|---|---|---|
| C-01 | getter on `width` throws inside `publishState` | `doesNotThrow` + `local-fatal` | sync throw `width getter boom` from `isAdmissibleViewport` | `red-before-fix.log` |
| C-02 | listener returns object whose `then` getter throws | isolated; other listeners continue | sync throw `then getter boom` from `deliver` outside try | `red-before-fix.log` |
| C-03 | sample with extra symbol own-key | `normalizeViewportSample` → `null` | accepted `{width:640,height:480}` via `Object.getOwnPropertyNames` | `red-before-fix.log` |

C-01 inFlight/idle same-size-with-`extra` already local-fatals under the pre-fix path (string extra keyed out by `Object.keys`); retained as regression. Post-fix suite: `red-after-fix.log` (4/4 PASS).

## Command results on final SHA `a0f664f…`

| Command | Exit | Raw log |
|---|---|---|
| `npm run docs:check-links` | 0 | `docs-check-links.log` |
| `npm run test:data` | 0 | `test-data.log` |
| `npm test -w @loomrealm/subsystem` | 0 | `test-subsystem.log` |
| `npm test -w @loomrealm/renderer` | 0 | `test-renderer.log` |
| `npm run test:viewport` | 0 | `test-viewport.log` |
| `npm run test:m10:qualification` | 0 | `test-m10.log` |
| `npm run test:m11:qualification` | 0 | `test-m11.log` |
| `npm run test:m13:qualification` | 0 | `test-m13.log` |
| `npm run build:desktop-stack` | 0 | `build-desktop-stack.log` |
| `npm run test:regression` | 0 | `test-regression.log` |

`npm run test:viewport:conformance` is an alias of `test:viewport` in root `package.json`.

## P3 / V ID map (executable)

- P3-01…P3-09 → `test/renderer-data-profile-v1/revision3.test.mjs` (named `P3-0N: …`); P3-08 marker + same-SHA child suites above
- V-01…V-14 → `test/viewport-state-v1/qualification.test.mjs` (named `V-0N: …`)
- V-14 independent scenarios → `test/viewport-core-vertical.test.mjs` (6 named cases: sync/deferred, blocked 10k+Input/Render, same-G reconnect, new-G, participant replace, Runtime terminal)
- C-01 / C-02 / C-03 → package suites under `packages/{data,subsystem,renderer}/test`

## Architecture Qualified

Re-confirmed on executable `a0f664f29e687fc35e966fcc7675c7f2db808a3c` after Cursor optimization. Desktop / Map / `play.bat` product window resize remains **OUT OF SCOPE**.
