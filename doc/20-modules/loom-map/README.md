# Map / Battle ownership migration

Map, Battle, tile presentation, their game content, and their product-level
qualification are owned by the
[PokeMan repository](https://github.com/lithdoo-labs/pokeman).

LoomRealm no longer ships or maintains those game packages. It provides only
the framework APIs consumed by PokeMan: Subsystem Runtime, Frame, State,
Rendering, Input, Resource/Content, Desktop hosting, and PWA hosting.

The former LoomRealm Map module documents and performance evidence were copied
to `doc/map-framework-boundary` and `doc/map-performance` in PokeMan during the
migration. Historical evidence retained in this repository is explicitly
archival and must not be treated as a current product contract.

See [the migration inventory](../../30-implementation/pokeman-map-battle-migration.md)
for the ownership boundary and verification record.
