# Session Events implementation

This package realizes the normative Session Events v1 contract. It owns the
Session-scoped hub, validation and limits, replaceable Runtime client, bounded
serial subscription delivery, remote carrier protocol, and MessagePort
adapter. Business truth remains outside the hub; platform packages only bind
the logical capability to their frozen physical carriers.

Normative sources:

- `doc/15-contracts/session-events-v1.md`
- `doc/15-contracts/session-events-runtime-profile-v1.md`
- `doc/15-contracts/session-events-conformance-v1.md`
