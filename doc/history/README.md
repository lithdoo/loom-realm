# Historical evidence policy

Git 历史是默认 archive。本目录只用于确有必要集中保存、且包含不可替代 provenance 的 evidence；不要把所有删除文档机械搬进这里。

可保留的典型内容：exact external provenance、machine/environment identity、raw/sanitized digest、sample counts/P95、legal-local qualification boundary、independent interoperability result。

普通完成计划、review、prompt、scope repair 和阶段总结应由 Git 历史保存。

## Retained evidence collections

- [Map / Essentials real-corpus investigations](./evidence/map/README.md) — official archive identity、真实 corpus 统计、entity/sprite compatibility 调查与 legal-local evidence boundary。Raw historical reports are retained byte-for-byte as text archives so their original internal links cannot accidentally become Current navigation.

Historical Evidence 只能证明当时 subject/input/source 上观察到的事实；不能覆盖 Current Architecture / Contract / Module / Development 文档。