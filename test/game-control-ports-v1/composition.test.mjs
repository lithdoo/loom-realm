import assert from "node:assert/strict";
import test from "node:test";
import {
  createControlsConsumer,
  createDirectionalControlsTracker,
} from "@loomrealm-game/common-controls/subsystem";

function activation(id) {
  const controller = new AbortController();
  let listener;
  const presentationEvents = {
    createListener({ frame, channels }) {
      const handlers = new Map();
      listener = {
        channels: [...channels],
        closed: false,
        emit(channel, name, data) {
          if (!this.closed) handlers.get(channel)?.({ channel, name, data });
        },
      };
      assert.equal(frame.id, id);
      return {
        on(channel, handler) {
          assert.ok(channels.includes(channel));
          handlers.set(channel, handler);
          return () => handlers.delete(channel);
        },
        setChannels() { throw new Error("unused"); },
        close() { listener.closed = true; handlers.clear(); },
      };
    },
  };
  const frame = { id, params: {}, signal: controller.signal, async call() { throw new Error("unused"); } };
  return { controller, frame, presentationEvents, get listener() { return listener; } };
}

function toMapDirection(direction) {
  return direction === "up" ? 8
    : direction === "down" ? 2
      : direction === "left" ? 4
        : direction === "right" ? 6
          : null;
}

function compose(target) {
  const tracker = createDirectionalControlsTracker();
  const intents = [];
  const controls = { setMoveIntent(intent) { intents.push(intent); } };
  const apply = () => controls.setMoveIntent(toMapDirection(tracker.direction));
  const consumer = createControlsConsumer(target.presentationEvents, target.frame, {
    onState(state) { tracker.acceptState(state); apply(); },
    onEvent(event) { tracker.acceptEvent(event); apply(); },
  });
  return { consumer, controls, intents, tracker };
}

test("product composition relinquishes one Activation and starts the next from neutral", () => {
  const firstActivation = activation("map-a1");
  const first = compose(firstActivation);
  assert.deepEqual(firstActivation.listener.channels, ["controls.state", "controls.event"]);
  assert.deepEqual(first.intents, [null]);

  firstActivation.listener.emit("controls.state", "input.state", { down: ["right"] });
  assert.equal(first.tracker.direction, "right");
  assert.equal(first.intents.at(-1), 6);

  first.controls.setMoveIntent(null);
  first.tracker.reset();
  first.consumer.close();
  assert.equal(firstActivation.listener.closed, true);
  assert.equal(first.tracker.direction, null);
  assert.equal(first.intents.at(-1), null);

  const secondActivation = activation("map-a2");
  const second = compose(secondActivation);
  assert.equal(second.tracker.direction, null);
  assert.deepEqual(second.intents, [null]);

  firstActivation.listener.emit("controls.state", "input.state", { down: ["left"] });
  assert.equal(first.tracker.direction, null, "closed A1 delivery cannot revive old held truth");
  assert.equal(second.tracker.direction, null, "A1 delivery cannot affect A2");

  secondActivation.listener.emit("controls.state", "input.state", { down: ["up"] });
  assert.equal(second.tracker.direction, "up");
  assert.equal(second.intents.at(-1), 8, "fresh State rebuilds held truth without Event replay");

  second.controls.setMoveIntent(null);
  second.tracker.reset();
  second.consumer.close();
});
