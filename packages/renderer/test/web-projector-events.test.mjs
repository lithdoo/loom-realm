import assert from "node:assert/strict";
import test from "node:test";
import { WebProjector } from "../dist/internal/web-projector.js";

class FakeElement {
  constructor() {
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
  }

  get nextSibling() {
    if (this.parentNode === null) return null;
    const index = this.parentNode.children.indexOf(this);
    return this.parentNode.children[index + 1] ?? null;
  }

  insertBefore(child, before) {
    child.remove();
    const index = before === null ? this.children.length : this.children.indexOf(before);
    if (index < 0) throw new Error("unknown sibling");
    this.children.splice(index, 0, child);
    child.parentNode = this;
  }

  remove() {
    if (this.parentNode === null) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

class EventElement extends FakeElement {
  receiveRenderContext(context) {
    this.context = context;
    this.contextCalls = (this.contextCalls ?? 0) + 1;
    context.emitCustomEvent("during-context", { ignored: true });
  }

  receiveRenderEvent(event) {
    this.renderEvents = [...(this.renderEvents ?? []), event];
    if (event.name === "throw") throw new Error("receiver failed");
  }
}

class NoReceiverElement extends FakeElement {}

function fakeDocument() {
  const definitions = new Map([
    ["lr-event", EventElement],
    ["lr-no-receiver", NoReceiverElement],
  ]);
  return {
    body: new FakeElement(),
    defaultView: { customElements: { get: (tag) => definitions.get(tag) } },
    createElement(tag) {
      const Constructor = definitions.get(tag) ?? FakeElement;
      return new Constructor();
    },
  };
}

const node = (key, tag = "lr-event") => ({ key, tag, attrs: {}, data: {}, children: [] });
const view = (roots) => ({
  sessionId: "S",
  subsystems: [{
    subsystemKey: "owner",
    generation: 4,
    eligible: true,
    domains: [{ domainId: "domain", zIndex: 0, roots }],
  }],
});

test("WebProjector provides stable per-node contexts with exact-live event provenance", () => {
  const document = fakeDocument();
  const projector = new WebProjector({
    document,
    resourceClient: { async resource() { throw new Error("unused"); } },
  });
  let current = view([node("A"), node("B")]);
  const source = { read: () => current };
  const firstEvents = [];
  const firstCallback = (event) => firstEvents.push(event);
  projector.reevaluate(source, firstCallback);

  const [a, b] = document.body.children;
  assert.notEqual(a.context, b.context);
  assert.equal(a.context.resources, b.context.resources);
  assert.equal(a.contextCalls, 1);
  assert.equal(b.contextCalls, 1);
  assert.equal(firstEvents.length, 0, "emission during receiveRenderContext is dropped");

  projector.reevaluate(source, firstCallback);
  assert.equal(document.body.children[0], a);
  assert.equal(document.body.children[0].context, a.context);
  assert.equal(a.contextCalls, 1);

  a.context.emitCustomEvent("a-event", { value: "A" });
  b.context.emitCustomEvent("b-event");
  b.context.emitCustomEvent("undefined-event", undefined);
  b.context.emitCustomEvent("null-event", null);
  a.context.emitCustomEvent("broadcast-event", { value: 1 }, { broadcast: true, channel: "keyboard.state" });
  assert.deepEqual(firstEvents.map(({ targetKey, name, data }) => ({ targetKey, name, data })), [
    { targetKey: "A", name: "a-event", data: { value: "A" } },
    { targetKey: "B", name: "b-event", data: {} },
    { targetKey: "B", name: "undefined-event", data: {} },
    { targetKey: "B", name: "null-event", data: null },
    { targetKey: "A", name: "broadcast-event", data: { value: 1 } },
  ]);
  assert.deepEqual(firstEvents.at(-1).options, { broadcast: true, channel: "keyboard.state" });
  assert.equal(firstEvents[1].data, firstEvents[2].data);
  assert.equal(Object.isFrozen(firstEvents[1].data), true);
  assert.ok(firstEvents.every(({ sessionId, subsystemKey, generation, domainId }) =>
    sessionId === "S" && subsystemKey === "owner" && generation === 4 && domainId === "domain"));

  current = view([node("B")]);
  projector.reevaluate(source, firstCallback);
  a.context.emitCustomEvent("removed", { invalid: 1n });
  assert.equal(firstEvents.length, 5);

  current = view([node("A"), node("B")]);
  projector.reevaluate(source, firstCallback);
  const freshA = document.body.children[0];
  assert.notEqual(freshA, a);
  a.context.emitCustomEvent("expired-record", {});
  freshA.context.emitCustomEvent("fresh-record", {});
  assert.equal(firstEvents.at(-1).name, "fresh-record");
  assert.equal(firstEvents.length, 6);

  const secondEvents = [];
  const secondCallback = (event) => secondEvents.push(event);
  projector.reevaluate(source, secondCallback);
  freshA.context.emitCustomEvent("new-attachment", {});
  assert.equal(firstEvents.length, 6);
  assert.equal(secondEvents.length, 1);

  projector.teardown();
  freshA.context.emitCustomEvent("after-teardown", { invalid: 1n });
  assert.equal(secondEvents.length, 1);
  assert.equal(document.body.children.length, 0);
});

test("structural failure permanently makes existing node contexts inert", () => {
  const document = fakeDocument();
  const failures = [];
  const events = [];
  const projector = new WebProjector({
    document,
    resourceClient: { async resource() { throw new Error("unused"); } },
    reportFailure: (cause) => failures.push(cause),
  });
  let current = view([node("A")]);
  const source = { read: () => current };
  projector.reevaluate(source, (event) => events.push(event));
  const context = document.body.children[0].context;
  current = view([node("A"), node("bad", "lr-unregistered")]);
  projector.reevaluate(source, (event) => events.push(event));
  assert.equal(projector.structuralFailed(), true);
  assert.equal(failures.length, 1);
  context.emitCustomEvent("after-failure", { invalid: 1n });
  assert.equal(events.length, 0);
});

test("WebProjector synchronously delivers detached Render Events only to the exact live receiver", () => {
  const document = fakeDocument();
  const failures = [];
  const projector = new WebProjector({
    document,
    resourceClient: { async resource() { throw new Error("unused"); } },
    reportFailure: (cause) => failures.push(cause),
  });
  let current = view([node("A"), node("plain", "lr-no-receiver")]);
  projector.reevaluate({ read: () => current }, () => {});
  const receiver = document.body.children[0];
  const event = Object.freeze({
    sessionId: "S",
    subsystemKey: "owner",
    generation: 4,
    domainId: "domain",
    targetKey: "A",
    name: "pulse",
    data: Object.freeze({ nested: Object.freeze({ value: 1 }) }),
  });
  projector.deliverRenderEvent(event);
  assert.equal(receiver.renderEvents.length, 1);
  assert.deepEqual(Object.keys(receiver.renderEvents[0]).sort(), ["data", "name"]);
  assert.equal(Object.isFrozen(receiver.renderEvents[0]), true);
  assert.equal(receiver.renderEvents[0].data, event.data);

  for (const stale of [
    { sessionId: "old" },
    { subsystemKey: "other" },
    { generation: 5 },
    { domainId: "other" },
    { targetKey: "missing" },
  ]) projector.deliverRenderEvent({ ...event, ...stale });
  projector.deliverRenderEvent({ ...event, targetKey: "plain" });
  assert.equal(receiver.renderEvents.length, 1);

  assert.throws(() => projector.deliverRenderEvent({ ...event, name: "throw" }), /receiver failed/);
  assert.equal(failures.length, 1);
  assert.equal(projector.structuralFailed(), false, "receiver throw is not structural failure");
  projector.deliverRenderEvent({ ...event, name: "after-throw" });
  assert.equal(receiver.renderEvents.at(-1).name, "after-throw");

  current = {
    ...view([node("A")]),
    subsystems: [{ ...view([]).subsystems[0], generation: 5, domains: [{ domainId: "domain", zIndex: 0, roots: [node("A")] }] }],
  };
  projector.reevaluate({ read: () => current }, () => {});
  const freshReceiver = document.body.children[0];
  assert.notEqual(freshReceiver, receiver);
  projector.deliverRenderEvent({ ...event, name: "old-generation" });
  assert.equal(freshReceiver.renderEvents, undefined);
  projector.deliverRenderEvent({ ...event, generation: 5, name: "fresh-generation" });
  assert.equal(freshReceiver.renderEvents[0].name, "fresh-generation");

  projector.teardown();
  projector.deliverRenderEvent({ ...event, generation: 5, name: "ended" });
  assert.equal(freshReceiver.renderEvents.length, 1);
});

test("structurally failed WebProjector drops forward Render Events without reviving old elements", () => {
  const document = fakeDocument();
  const projector = new WebProjector({
    document,
    resourceClient: { async resource() { throw new Error("unused"); } },
  });
  let current = view([node("A")]);
  const source = { read: () => current };
  projector.reevaluate(source, () => {});
  const receiver = document.body.children[0];
  current = view([node("A"), node("bad", "lr-unregistered")]);
  projector.reevaluate(source, () => {});
  projector.deliverRenderEvent({
    sessionId: "S", subsystemKey: "owner", generation: 4, domainId: "domain",
    targetKey: "A", name: "after-failure", data: {},
  });
  assert.equal(receiver.renderEvents, undefined);
});
