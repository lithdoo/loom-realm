import { connectBoundedDataCarrier, } from "./data-websocket.js";
function sameTuple(left, right) {
    return left.subsystemKey === right.subsystemKey &&
        left.generation === right.generation &&
        left.dataProfile === right.dataProfile;
}
export class DesktopRendererDataBinding {
    policy;
    binding;
    slots = new Map();
    constructor(policy) {
        this.policy = policy;
        this.binding = Object.freeze({
            acquire: (subsystemKey, generation, dataProfile, signal) => this.acquire({ subsystemKey, generation, dataProfile }, signal),
        });
    }
    slot(subsystemKey) {
        let slot = this.slots.get(subsystemKey);
        if (slot === undefined) {
            slot = { prepared: null, current: null, waiter: null };
            this.slots.set(subsystemKey, slot);
        }
        return slot;
    }
    acquire(tuple, signal) {
        if (signal.aborted)
            return Promise.reject(signal.reason);
        const slot = this.slot(tuple.subsystemKey);
        if (slot.waiter !== null)
            return Promise.reject(new Error("Renderer Data acquire already pending"));
        if (slot.current !== null && !slot.current.delivered && sameTuple(slot.current, tuple)) {
            slot.current.delivered = true;
            return Promise.resolve(slot.current.carrier);
        }
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                if (slot.waiter?.resolve !== resolve)
                    return;
                slot.waiter = null;
                reject(signal.reason);
            };
            signal.addEventListener("abort", onAbort, { once: true });
            slot.waiter = {
                ...tuple,
                signal,
                resolve,
                reject,
                detachAbort: () => signal.removeEventListener("abort", onAbort),
            };
        });
    }
    async prepare(candidateId, endpoint, tuple, signal) {
        const slot = this.slot(tuple.subsystemKey);
        if (slot.prepared !== null)
            throw new Error("Renderer Data candidate already prepared");
        const carrier = await connectBoundedDataCarrier(endpoint, signal, this.policy);
        if (signal.aborted || slot.prepared !== null) {
            void carrier.close().catch(() => { });
            throw signal.aborted ? signal.reason : new Error("Renderer Data candidate already prepared");
        }
        const prepared = Object.freeze({ candidateId, carrier, ...tuple });
        slot.prepared = prepared;
        void carrier.closed.then(() => {
            if (slot.prepared === prepared)
                slot.prepared = null;
            if (slot.current?.candidateId === prepared.candidateId)
                slot.current = null;
        });
    }
    commit(candidateId, tuple) {
        const slot = this.slot(tuple.subsystemKey);
        const prepared = slot.prepared;
        if (prepared === null || prepared.candidateId !== candidateId || !sameTuple(prepared, tuple))
            return false;
        slot.prepared = null;
        const current = { ...prepared, delivered: false };
        slot.current = current;
        const waiter = slot.waiter;
        if (waiter !== null && sameTuple(waiter, tuple) && !waiter.signal.aborted) {
            slot.waiter = null;
            waiter.detachAbort();
            current.delivered = true;
            waiter.resolve(current.carrier);
        }
        return true;
    }
    revoke(candidateId) {
        for (const slot of this.slots.values()) {
            if (slot.prepared?.candidateId === candidateId) {
                const prepared = slot.prepared;
                slot.prepared = null;
                void prepared.carrier.close().catch(() => { });
            }
            if (slot.current?.candidateId === candidateId) {
                const current = slot.current;
                slot.current = null;
                void current.carrier.close().catch(() => { });
            }
        }
    }
    close() {
        for (const slot of this.slots.values()) {
            if (slot.prepared !== null)
                void slot.prepared.carrier.close().catch(() => { });
            if (slot.current !== null)
                void slot.current.carrier.close().catch(() => { });
            slot.prepared = null;
            slot.current = null;
            const waiter = slot.waiter;
            slot.waiter = null;
            waiter?.detachAbort();
            waiter?.reject(new Error("Renderer Data binding closed"));
        }
    }
}
