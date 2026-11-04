# LoomRealm PWA

`apps/pwa` 是 LoomRealm 的 canonical PWA product composition。架构、authority 与 frozen topology 见 [`doc/20-modules/pwa-host`](../../doc/20-modules/pwa-host/README.md)；正式跨角色边界见 [`PWA Launcher / Worker Profile v1`](../../doc/15-contracts/pwa-launcher-profile-v1.md)。

本目录只拥有 PWA-specific physical entry/composition，不重新定义 Main、Shared State、Subsystem、Renderer、Content 或 game-lib 的逻辑 authority。

Build/test 请使用本 package 与 repository root `package.json` 中现有脚本；qualification/currentness 规则见 [`doc/30-development/qualification.md`](../../doc/30-development/qualification.md)。

## Generic game installation bundles

A consumer repository owns game-specific packaging (game entry, launch manifest, presentation, executable modules, and FSDB Content). It supplies a versioned JSON payload to the generic PWA builder; the builder does not inspect a game's source tree or know its product identity.

The input payload has this shape:

```json
{
  "formatVersion": 1,
  "gameEntryText": "{ ... }",
  "launchManifestText": "{ ... }",
  "presentation": {},
  "executables": [
    {
      "logicalModule": "subsystems/main.mjs",
      "mime": "text/javascript",
      "source": "export default ...",
      "contentVersion": "sha256:..."
    }
  ],
  "content": [
    {
      "kind": "record",
      "namespace": "struct.Map",
      "key": "1",
      "mime": "application/json",
      "encoding": "base64",
      "body": "eyJ4IjoxfQ=="
    }
  ]
}
```

Build an app-scoped artifact with:

```sh
npm run build:bundle -w @loomrealm/pwa -- \
  --bundle /absolute/path/to/installation-bundle-input.json \
  --app-id my-game \
  --base-path /pwa/my-game/
```

The artifact is written to `apps/pwa/dist/staging/pwa/<app-id>/`. The builder validates the manifests, executable module identities, Content identities and base64 bodies. Its content-addressed bundle ID covers the PWA shell generation and the complete supplied payload, so a content-only game update also creates a new installation identity.

The legacy PokeMan staging path remains temporarily available while the PokeMan repository switches to this generic contract.
