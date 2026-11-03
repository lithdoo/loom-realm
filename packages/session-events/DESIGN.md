# Session Events implementation

This package realizes the normative Session Events v1 contract. It owns the
Session-scoped hub, validation and limits, replaceable Runtime client, bounded
serial subscription delivery, remote carrier protocol, and MessagePort
adapter. Business truth remains outside the hub; platform packages only bind
the logical capability to their frozen physical carriers.

Host lifecycle is the one retained operational fact in this package. A single
publisher registers a session epoch; the hub assigns a monotonic sequence and
atomically queues the current snapshot when installing a `host.lifecycle`
subscription. This is a specialization of the existing hub, not a second bus
or a generic retained-event facility. Closing the publisher or hub clears the
snapshot, and consumers reject untrusted source/type/payload shapes.

Normative sources:

- `doc/15-contracts/session-events-v1.md`
- `doc/15-contracts/session-events-runtime-profile-v1.md`
- `doc/15-contracts/session-events-conformance-v1.md`
